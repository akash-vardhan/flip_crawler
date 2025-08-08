const OpenAI = require('openai');
const config = require('../config/config');
const Utils = require('./utils');

class AIProcessor {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.config = config.openai;
  }

  /**
   * Process all content with OpenAI
   */
  async processContent(mainContent, linkedContents, url) {
    try {
      console.log('🤖 Processing content with OpenAI...');
      
      const prompt = this.buildComprehensivePrompt(mainContent, linkedContents, url);
      
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt()
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: "json_object" }
      });

      let responseContent = response.choices[0].message.content.trim();
      
      const extractedData = this.cleanAndParseResponse(responseContent);
      
      // Add metadata
      extractedData.metadata = {
        last_updated: new Date().toISOString(),
        confidence_score: this.calculateConfidenceScore(extractedData),
        missing_data: this.findMissingData(extractedData),
        processed_links: linkedContents.length
      };
      
      return extractedData;
      
    } catch (error) {
      console.error('❌ OpenAI processing error:', error.message);
      return this.createFallbackExtraction(mainContent, url);
    }
  }

  /**
   * Clean and parse OpenAI response
   */
  cleanAndParseResponse(responseContent) {
    try {
      const cleaned = responseContent.trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse OpenAI response:', error.message);
      console.error('Raw response:', responseContent);
      throw new Error(`Invalid JSON response from OpenAI: ${error.message}`);
    }
  }

  /**
   * Get system prompt
   */
  getSystemPrompt() {
    return `You are an expert at extracting credit card benefits information for existing cardholders.

CRITICAL RESPONSE FORMAT RULES:
- You MUST respond with ONLY raw JSON
- DO NOT use markdown code blocks
- DO NOT add any explanations before or after the JSON
- Start your response immediately with the opening brace {
- End your response with the closing brace }
- Your entire response must be valid, parseable JSON

Your task is to analyze webpage content and extract comprehensive information about current offers, benefits, rewards, and perks that existing cardholders can use RIGHT NOW.`;
  }

  /**
   * Build comprehensive prompt with enhanced extraction instructions
   */
  buildComprehensivePrompt(mainContent, linkedContents, url) {
    let contentSections = [];
    
    // Add main content
    contentSections.push(`MAIN PAGE CONTENT:
URL: ${url}
Title: ${mainContent.title}
Content: ${Utils.truncateText(mainContent.content?.text || '', 10000)}`);
    
    // Add linked content with more detail
    linkedContents.forEach((link, index) => {
      if (link.content?.text) {
        contentSections.push(`LINKED PAGE ${index + 1}:
URL: ${link.url}
Type: ${link.type}
Link Text: ${link.text}
Content: ${Utils.truncateText(link.content.text, 6000)}`);
      } else {
        contentSections.push(`LINKED DOCUMENT ${index + 1}:
URL: ${link.url}
Type: ${link.type}
Summary: ${link.summary}`);
      }
    });
    
    const allContent = contentSections.join('\n\n' + '='.repeat(80) + '\n\n');
    
    return `
You are analyzing a credit card webpage and ALL its linked content to extract COMPREHENSIVE information for existing cardholders.

EXTRACTION PHILOSOPHY: 
- Extract EVERY piece of useful information
- Include specific terms and conditions WITH each benefit/offer (not separately)
- Add ANY additional relevant information you find, even if it doesn't fit the predefined structure
- Be thorough and detailed - cardholders want complete information

RESPONSE FORMAT: Return ONLY raw JSON (no markdown formatting).

BASE JSON STRUCTURE (You can ADD additional fields as needed):

{
  "card": {
    "name": "string",
    "bank": "string", 
    "variant": "string",
    "description": "string",
    "target_audience": "string"
  },
  "rewards": {
    "program": "string",
    "type": "string",
    "earning": {
      "base_rate": "number",
      "categories": [
        {
          "name": "string",
          "rate": "number", 
          "cap": "number or null",
          "description": "string",
          "terms_and_conditions": "string",
          "how_to_earn": "string",
          "validity": "string or null",
          "exclusions": "string or null"
        }
      ],
      "bonus_rates": [
        {
          "condition": "string",
          "rate": "number",
          "validity": "string",
          "terms_and_conditions": "string"
        }
      ]
    },
    "redemption": [
      {
        "option": "string",
        "minimum": "number or null",
        "value": "number or null", 
        "process": "string",
        "terms_and_conditions": "string",
        "validity": "string or null",
        "processing_time": "string or null"
      }
    ]
  },
  "benefits": [
    {
      "category": "string",
      "name": "string",
      "description": "string",
      "how_to_avail": "string",
      "value": "string or null",
      "terms_and_conditions": "string",
      "validity": "string or null",
      "eligibility": "string or null",
      "usage_limit": "string or null"
    }
  ],
  "current_offers": [
    {
      "title": "string",
      "description": "string", 
      "validity": "string",
      "terms_and_conditions": "string",
      "activation_required": "boolean",
      "how_to_activate": "string or null",
      "eligibility": "string or null",
      "maximum_benefit": "string or null",
      "offer_code": "string or null",
      "exclusions": "string or null"
    }
  ],
  "perks": [
    {
      "name": "string",
      "description": "string",
      "category": "string",
      "usage_limit": "string or null",
      "how_to_use": "string",
      "terms_and_conditions": "string", 
      "value": "string or null",
      "validity": "string or null"
    }
  ],
  "partnerships": [
    {
      "partner": "string",
      "benefit": "string",
      "category": "string", 
      "validity": "string or null",
      "how_to_avail": "string",
      "terms_and_conditions": "string",
      "discount_percentage": "string or null",
      "maximum_discount": "string or null"
    }
  ],
  "fees_and_charges": [
    {
      "type": "string",
      "amount": "string",
      "waiver_conditions": "string or null",
      "frequency": "string",
      "terms_and_conditions": "string"
    }
  ]
}

ALL CONTENT TO ANALYZE:
${Utils.truncateText(allContent, 45000)}

COMPREHENSIVE EXTRACTION INSTRUCTIONS:
1. Analyze ALL content sources (main page + ALL linked pages/documents)
2. Extract EVERY benefit, offer, perk, and feature mentioned
3. Include specific terms_and_conditions for EACH item (not as separate section)
4. Add ANY additional fields you think are relevant to each section
5. If you find information that doesn't fit existing categories, ADD new sections
6. Include specific details: rates, caps, conditions, processes, exclusions
7. Extract fee information with their specific terms and waiver conditions
8. Don't miss any partnerships, special offers, or bonus categories
9. Use descriptive and detailed text - be comprehensive
10. Feel free to expand the JSON structure if you find additional relevant information

FLEXIBILITY RULES:
- You can add new fields to any existing object
- You can add entirely new top-level sections if needed
- Always include terms_and_conditions specific to each benefit/offer
- If terms apply to multiple items, repeat them for each relevant item
- Add fields like "exclusions", "fine_print", "special_notes" where relevant

Extract everything useful and structure it logically - no detail should be left behind!
Return ONLY the JSON object with NO markdown formatting.
`;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidenceScore(data) {
    let score = 0;
    let maxScore = 0;

    // Card info (15%)
    maxScore += 15;
    if (data.card?.name) score += 8;
    if (data.card?.bank) score += 7;

    // Rewards (25%)
    maxScore += 25;
    if (data.rewards?.program) score += 5;
    if (data.rewards?.type) score += 5;
    if (data.rewards?.earning?.categories?.length > 0) score += 10;
    if (data.rewards?.redemption?.length > 0) score += 5;

    // Benefits (25%)
    maxScore += 25;
    if (data.benefits?.length > 0) score += 25;

    // Offers (20%)
    maxScore += 20;
    if (data.current_offers?.length > 0) score += 20;

    // Perks (10%)
    maxScore += 10;
    if (data.perks?.length > 0) score += 10;

    // Partnerships (5%)
    maxScore += 5;
    if (data.partnerships?.length > 0) score += 5;

    return Math.round((score / maxScore) * 100) / 100;
  }

   //Find missing data sections
   
  findMissingData(data) {
    const missing = [];
    
    if (!data.card?.name) missing.push("card_name");
    if (!data.card?.bank) missing.push("bank_name");
    if (!data.rewards?.program) missing.push("rewards_program");
    if (!data.rewards?.earning?.categories?.length) missing.push("reward_categories");
    if (!data.benefits?.length) missing.push("benefits");
    if (!data.current_offers?.length) missing.push("current_offers");
    if (!data.perks?.length) missing.push("perks");
    if (!data.partnerships?.length) missing.push("partnerships");
    
    return missing;
  }

  /**
   * Create fallback extraction
   */
  createFallbackExtraction(content, url) {
    return {
      card: {
        name: content?.title || null,
        bank: null,
        variant: null
      },
      rewards: {
        program: null,
        type: null,
        earning: {
          base_rate: null,
          categories: []
        },
        redemption: []
      },
      benefits: [],
      current_offers: [],
      perks: [],
      partnerships: [],
      metadata: {
        last_updated: new Date().toISOString(),
        confidence_score: 0.1,
        missing_data: ["all_sections"],
        processed_links: 0,
        fallback_used: true
      }
    };
  }
}

module.exports = AIProcessor;
