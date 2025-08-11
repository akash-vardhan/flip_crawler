const OpenAI = require('openai');
const config = require('../config/config');
const Utils = require('./utils');

class AIProcessor {
    constructor(apiKey) {
        this.openai = new OpenAI({ apiKey });
        this.config = config.openai;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
    }

    /**
     * Process listing page to extract card URLs with improved filtering
     */
    async extractCardUrls(listingContent, baseUrl) {
        try {
            console.log('🔍 Extracting card URLs from listing page with OpenAI...');
            
            const prompt = this.buildListingExtractionPrompt(listingContent, baseUrl);
            const estimatedInputTokens = Math.ceil(prompt.length / 4);
            console.log(`📊 Estimated input tokens for listing: ${estimatedInputTokens}`);

            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [
                    {
                        role: "system",
                        content: this.getListingSystemPrompt()
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                response_format: { type: "json_object" }
            });

            // Track token usage
            const usage = response.usage;
            this.totalInputTokens += usage.prompt_tokens;
            this.totalOutputTokens += usage.completion_tokens;

            console.log(`📈 Listing Token Usage:`);
            console.log(`   Input: ${usage.prompt_tokens} tokens`);
            console.log(`   Output: ${usage.completion_tokens} tokens`);
            console.log(`   Total: ${usage.total_tokens} tokens`);

            const responseContent = response.choices[0].message.content.trim();
            const extractedData = this.cleanAndParseResponse(responseContent);

            // Post-process and filter the results
            const filteredData = this.postProcessCardUrls(extractedData, baseUrl);
            
            console.log(`🎯 Before filtering: ${extractedData.cards?.length || 0} cards`);
            console.log(`✅ After filtering: ${filteredData.cards?.length || 0} cards`);

            return filteredData;

        } catch (error) {
            console.error('❌ Listing extraction error:', error.message);
            return { cards: [] };
        }
    }

    /**
     * Post-process and filter card URLs to remove irrelevant ones
     */
    postProcessCardUrls(extractedData, baseUrl) {
        if (!extractedData.cards || !Array.isArray(extractedData.cards)) {
            return { cards: [], total_cards_found: 0 };
        }

        const filteredCards = extractedData.cards
            .filter(card => this.isValidCreditCard(card))
            .map(card => this.normalizeCardData(card, baseUrl));

        return {
            cards: filteredCards,
            total_cards_found: filteredCards.length,
            original_count: extractedData.cards.length,
            filtered_out: extractedData.cards.length - filteredCards.length
        };
    }

    /**
     * Validate if a card entry is a legitimate credit card
     */
    isValidCreditCard(card) {
        if (!card.url || !card.name) {
            console.log(`⚠️ Filtering out: Missing URL or name`);
            return false;
        }

        const url = card.url.toLowerCase();
        const name = card.name.toLowerCase();
        const description = (card.description || '').toLowerCase();

        // EXCLUDE: Business cards, debit cards, forex cards, etc.
        const excludePatterns = [
            'business', 'corporate', 'commercial', 'enterprise',
            'debit', 'prepaid', 'gift-card', 'forex', 'travel-card',
            'salary-account', 'savings-account', 'current-account',
            'loan', 'personal-loan', 'home-loan', 'vehicle-loan',
            'insurance', 'mutual-fund', 'investment', 'fixed-deposit',
            'nri', 'student-account', 'pension', 'senior-citizen',
            'apply-now', 'eligibility', 'documents', 'fees-charges',
            'terms-conditions', 'offers-only', 'calculator',
            'branch-locator', 'customer-care', 'support', 'help'
        ];

        // Check URL for exclusion patterns
        const urlExcluded = excludePatterns.some(pattern => url.includes(pattern));
        if (urlExcluded) {
            console.log(`⚠️ Filtering out URL pattern: ${card.name} - ${card.url}`);
            return false;
        }

        // Check name and description for exclusion patterns
        const nameExcluded = excludePatterns.some(pattern => 
            name.includes(pattern) || description.includes(pattern)
        );
        if (nameExcluded) {
            console.log(`⚠️ Filtering out name/desc pattern: ${card.name}`);
            return false;
        }

        // INCLUDE: Must contain credit card indicators
        const includePatterns = [
            'credit-card', 'credit card', 'creditcard',
            'rewards', 'cashback', 'points', 'miles',
            'platinum', 'gold', 'silver', 'premium',
            'classic', 'signature', 'infinite', 'world',
            'millennia', 'regalia', 'diners', 'times',
            'freedom', 'pixel', 'moneyback', 'indianoil'
        ];

        const urlIncluded = includePatterns.some(pattern => url.includes(pattern.replace(/\s+/g, '-')));
        const nameIncluded = includePatterns.some(pattern => 
            name.includes(pattern) || description.includes(pattern)
        );

        if (!urlIncluded && !nameIncluded) {
            console.log(`⚠️ Filtering out - no credit card indicators: ${card.name}`);
            return false;
        }

        // Must have a proper URL structure
        if (!url.includes('/credit-card') && !url.includes('/card') && !url.includes('card')) {
            console.log(`⚠️ Filtering out - URL doesn't seem card-related: ${card.url}`);
            return false;
        }

        console.log(`✅ Valid credit card: ${card.name}`);
        return true;
    }

    /**
     * Normalize card data and ensure proper URL format
     */
    normalizeCardData(card, baseUrl) {
        // Ensure absolute URL
        let normalizedUrl = card.url;
        if (card.url.startsWith('/')) {
            const base = new URL(baseUrl);
            normalizedUrl = `${base.protocol}//${base.host}${card.url}`;
        }

        // Clean up the name
        const normalizedName = card.name.replace(/\s+/g, ' ').trim();

        return {
            ...card,
            url: normalizedUrl,
            name: normalizedName,
            category: card.category || 'Personal Credit Card',
            key_features: card.key_features || [],
            annual_fee: card.annual_fee || null
        };
    }

    /**
     * Get system prompt for listing extraction
     */
    getListingSystemPrompt() {
        return `You are an expert at extracting PERSONAL CREDIT CARD information from listing pages.

CRITICAL RESPONSE FORMAT RULES:
- You MUST respond with ONLY raw JSON
- DO NOT use markdown code blocks
- DO NOT add any explanations before or after the JSON
- Start your response immediately with the opening brace {
- End your response with the closing brace }

IMPORTANT FILTERING RULES:
- ONLY extract PERSONAL CREDIT CARDS (not business, corporate, or commercial cards)
- EXCLUDE debit cards, prepaid cards, forex cards, travel cards
- EXCLUDE loan products, insurance, investments, or bank accounts
- EXCLUDE general pages like "apply now", "eligibility", "documents"
- FOCUS on individual credit card product pages with specific card names

Your task is to analyze a credit card listing page and extract individual PERSONAL credit card URLs and basic information.`;
    }

    /**
     * Build listing extraction prompt with enhanced filtering instructions
     */
    buildListingExtractionPrompt(listingContent, baseUrl) {
        return `
Analyze this credit card listing page and extract ONLY PERSONAL CREDIT CARD URLs and information.

BASE URL: ${baseUrl}
LISTING PAGE CONTENT:
Title: ${listingContent.title}
Content: ${Utils.truncateText(listingContent.content?.text || '', 15000)}

STRICT FILTERING REQUIREMENTS:

✅ INCLUDE ONLY:
- Personal credit cards with specific names (like "Regalia Credit Card", "Millennia Credit Card")
- Individual credit card product pages 
- Links containing "credit-card" in URL
- Cards with specific features like rewards, cashback, points
- Named card variants (Classic, Gold, Platinum, Signature, etc.)

❌ EXCLUDE ALL:
- Business credit cards, corporate cards, commercial cards
- Debit cards, prepaid cards, gift cards, forex cards
- Loan products (personal loan, home loan, etc.)
- Bank accounts (savings, current, salary accounts)
- Insurance products, mutual funds, investments
- General pages: "Apply Now", "Eligibility", "Documents", "Terms & Conditions"
- Customer service pages, branch locators, calculators
- NRI products, student accounts, senior citizen accounts

URL VALIDATION:
- Must contain "/credit-card" OR "/card" OR specific card names
- Must lead to individual product pages, not category pages
- Convert relative URLs to absolute URLs using: ${baseUrl}

RESPONSE FORMAT: Return ONLY raw JSON (no markdown formatting).

JSON STRUCTURE:
{
  "cards": [
    {
      "name": "exact_card_name_from_page",
      "description": "brief_description_of_card", 
      "url": "complete_absolute_url_to_card_page",
      "category": "Personal Credit Card",
      "key_features": ["feature1", "feature2", "feature3"],
      "annual_fee": "fee_amount_or_null"
    }
  ],
  "total_cards_found": "number_of_valid_cards_extracted"
}

EXTRACTION STRATEGY:
1. Look for "Know More", "View Details", "Apply Now" buttons that lead to specific card pages
2. Find card names mentioned in headers, titles, or prominent text
3. Extract key features like rewards rate, cashback percentage, annual fee
4. Ensure each URL is a unique credit card product page
5. Ignore duplicate links to the same card
6. Focus on cards actually available for application

Extract ONLY legitimate personal credit cards that consumers can apply for.
Return ONLY the JSON object with NO markdown formatting.
`;
    }

    // ... rest of existing methods remain the same ...

    /**
     * Process all content with OpenAI
     */
    async processContent(mainContent, linkedContents, url) {
        try {
            console.log('🤖 Processing content with OpenAI...');
            const prompt = this.buildComprehensivePrompt(mainContent, linkedContents, url);
            
            // Calculate approximate input tokens (rough estimate: 1 token ≈ 4 characters)
            const estimatedInputTokens = Math.ceil(prompt.length / 4);
            console.log(`📊 Estimated input tokens: ${estimatedInputTokens}`);

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

            // Track actual token usage
            const usage = response.usage;
            this.totalInputTokens += usage.prompt_tokens;
            this.totalOutputTokens += usage.completion_tokens;

            console.log(`📈 Token Usage:`);
            console.log(`   Input: ${usage.prompt_tokens} tokens`);
            console.log(`   Output: ${usage.completion_tokens} tokens`);
            console.log(`   Total: ${usage.total_tokens} tokens`);
            console.log(`📊 Session Totals:`);
            console.log(`   Total Input: ${this.totalInputTokens} tokens`);
            console.log(`   Total Output: ${this.totalOutputTokens} tokens`);
            console.log(`   Grand Total: ${this.totalInputTokens + this.totalOutputTokens} tokens`);

            let responseContent = response.choices[0].message.content.trim();
            const extractedData = this.cleanAndParseResponse(responseContent);

            // Add metadata
            extractedData.metadata = {
                last_updated: new Date().toISOString(),
                confidence_score: this.calculateConfidenceScore(extractedData),
                missing_data: this.findMissingData(extractedData),
                processed_links: linkedContents.length,
                token_usage: {
                    input_tokens: usage.prompt_tokens,
                    output_tokens: usage.completion_tokens,
                    total_tokens: usage.total_tokens
                }
            };

            return extractedData;
        } catch (error) {
            console.error('❌ OpenAI processing error:', error.message);
            return this.createFallbackExtraction(mainContent, url);
        }
    }

    /**
     * Get session token totals
     */
    getTokenTotals() {
        return {
            totalInputTokens: this.totalInputTokens,
            totalOutputTokens: this.totalOutputTokens,
            totalTokens: this.totalInputTokens + this.totalOutputTokens
        };
    }

    // ... rest of existing methods (getSystemPrompt, buildComprehensivePrompt, etc.) remain unchanged ...
    
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

    /**
     * Find missing data sections
     */
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
