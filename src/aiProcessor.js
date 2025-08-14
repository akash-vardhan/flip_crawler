const OpenAI = require('openai');
const config = require('../config/config');
const Utils = require('./utils');
const axios = require('axios');

class AIProcessor {
    constructor(apiKey) {
        this.openai = new OpenAI({ apiKey });
        this.config = config.openai;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
    }

    /**
     * Extract credit card URLs from listing pages
     */
    async extractCardUrls(url, maxUrls = 50) {
        try {
            console.log(`🔍 Extracting card URLs from: ${url}`);
            
            const prompt = `Extract credit card page URLs from this listing content.

URL: ${url}

Return a JSON array of unique URLs that lead to individual credit card pages.
Look for URLs containing terms like: card, credit, benefits, features, apply, details
Exclude: general pages, footer links, navigation, social media
Maximum ${maxUrls} URLs.

Return format: ["url1", "url2", "url3"]`;

            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: "system", content: "Extract credit card URLs from listing pages. Return only a JSON array of URLs." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 2000
            });

            const content = response.choices[0].message.content;
            this.updateTokenUsage(response.usage);

            // Parse URLs from response
            const urls = JSON.parse(content);
            console.log(`✅ Extracted ${urls.length} credit card URLs`);
            return urls;

        } catch (error) {
            console.error('❌ Failed to extract card URLs:', error.message);
            return [];
        }
    }

    /**
     * Process multiple listings in chunks
     */
    async processListingInChunks(listings, chunkSize = 5) {
        console.log(`📊 Processing ${listings.length} listings in chunks of ${chunkSize}`);
        
        const allUrls = new Set();
        
        for (let i = 0; i < listings.length; i += chunkSize) {
            const chunk = listings.slice(i, i + chunkSize);
            console.log(`🔄 Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(listings.length/chunkSize)}`);
            
            for (const listing of chunk) {
                try {
                    const urls = await this.extractCardUrls(listing.url);
                    urls.forEach(url => allUrls.add(url));
                    
                    // Delay between requests
                    await Utils.sleep(1000);
                } catch (error) {
                    console.error(`❌ Failed to process ${listing.url}:`, error.message);
                }
            }
        }
        
        return Array.from(allUrls);
    }

    /**
     * Main content processing method
     */
    async processContent(mainContent, linkedContents, url) {
        try {
            console.log('🤖 Processing content with AI...');
            
            const prompt = this.buildFlexibleComprehensivePrompt(mainContent, linkedContents, url);
            
            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [
                    {
                        role: "system",
                        content: "You are a financial data extraction expert. Extract structured credit card information accurately. Return only valid JSON."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000
            });

            this.updateTokenUsage(response.usage);
            
            const aiResponse = response.choices[0].message.content;
            console.log('✅ AI processing completed');
            
            // Parse the response
            const parsedData = this.parseAIResponse(aiResponse);
            
            return {
                standardJson: parsedData.standard_format,
                structuredJson: parsedData.structured_format
            };

        } catch (error) {
            console.error('❌ AI processing failed:', error.message);
            throw error;
        }
    }

    /**
     * Build flexible comprehensive prompt with PDF handling
     */
    buildFlexibleComprehensivePrompt(mainContent, linkedContents, url) {
        // NEW: Check if main content is PDF
        if (mainContent.contentType === 'pdf') {
            return this.buildPdfPrompt(mainContent, url);
        }
        
        // EXISTING: Keep original web content logic exactly the same
        let contentSections = [];

        // Add main content with strict limits
        const mainText = mainContent.content?.text || '';
        contentSections.push(`MAIN PAGE:
URL: ${url}
TITLE: ${mainContent.title}
CONTENT: ${mainText}`);

        // Add linked content
        linkedContents.forEach((link, index) => {
            if (link.content?.text) {
                contentSections.push(`LINKED PAGE ${index + 1}:
URL: ${link.url}
CONTENT: ${link.content.text}`);
            }
        });

        const allContent = contentSections.join('\n\n');

        return `Extract credit card information from provided content and return BOTH formats.

${allContent}

Return JSON with BOTH formats - you can ADD additional fields as needed:

{
  "standard_format": {
    "card": {"name": "", "bank": "", "variant": "", "description": "", "target_audience": ""},
    "rewards": {
      "program": "",
      "type": "",
      "earning": {
        "base_rate": 0,
        "categories": [
          {
            "name": "",
            "rate": 0,
            "cap": null,
            "description": "",
            "terms_and_conditions": "",
            "how_to_earn": "",
            "validity": "",
            "exclusions": ""
          }
        ],
        "bonus_rates": [
          {
            "condition": "",
            "rate": 0,
            "validity": "",
            "terms_and_conditions": ""
          }
        ]
      },
      "redemption": [
        {
          "option": "",
          "minimum": null,
          "value": null,
          "process": "",
          "terms_and_conditions": "",
          "validity": "",
          "processing_time": ""
        }
      ]
    },
    "benefits": [
      {
        "category": "",
        "name": "",
        "description": "",
        "how_to_avail": "",
        "value": "",
        "terms_and_conditions": "",
        "validity": "",
        "eligibility": "",
        "usage_limit": ""
      }
    ],
    "current_offers": [
      {
        "title": "",
        "description": "",
        "validity": "",
        "terms_and_conditions": "",
        "activation_required": false,
        "how_to_activate": "",
        "eligibility": "",
        "maximum_benefit": "",
        "offer_code": "",
        "exclusions": ""
      }
    ],
    "perks": [
      {
        "name": "",
        "description": "",
        "category": "",
        "usage_limit": "",
        "how_to_use": "",
        "terms_and_conditions": "",
        "value": "",
        "validity": ""
      }
    ],
    "partnerships": [
      {
        "partner": "",
        "benefit": "",
        "category": "",
        "validity": "",
        "how_to_avail": "",
        "terms_and_conditions": "",
        "discount_percentage": "",
        "maximum_discount": ""
      }
    ],
    "fees_and_charges": [
      {
        "type": "",
        "amount": "",
        "waiver_conditions": "",
        "frequency": "",
        "terms_and_conditions": ""
      }
    ]
  },
  "structured_format": {
    "Metadata": {"PK": "CARD#BANK_NAME", "SK": "METADATA", "card_name": "", "issuer": "", "network": [], "type": "Credit Card", "category": []},
    "features": {"PK": "CARD#BANK_NAME", "SK": "FEATURES", "digital_onboarding": false, "contactless_payments": false, "customization_options": {}, "app_management": [], "security_features": []},
    "rewards": {"PK": "CARD#BANK_NAME", "SK": "REWARDS", "reward_currency": "", "cashback_program": [], "earning_structure": [], "redemption": {}},
    "fees": {"PK": "CARD#BANK_NAME", "SK": "FEES", "joining_fee": null, "renewal_fee": null, "tax_applicable": true, "renewal_waiver_condition": "", "joining_fee_waiver_condition": "", "other_charges": {}},
    "eligibility": {"PK": "CARD#BANK_NAME", "SK": "ELIGIBILITY", "salaried": {}, "self_employed": {}},
    "related_docs": {"PK": "CARD#BANK_NAME", "SK": "PDFS", "pdfs": []}
  }
}

FLEXIBILITY RULES:
- You CAN add additional fields to any section in standard_format
- You CAN add new top-level sections in standard_format if needed
- You HAVE full flexibility in standard_format, make sure all relevant information is captured.
- You CANNOT modify anything in structured_format it should be exactly the format given
- Extract information ONLY from provided content
- If information is not found, use null or appropriate empty values
- Be comprehensive but stay within the provided content scope

Return ONLY the JSON object with BOTH formats.`;
    }

    /**
     * NEW METHOD: Build prompt specifically for PDF content
     */
    buildPdfPrompt(pdfContent, url) {
        const title = pdfContent.title || 'PDF Document';
        const textContent = pdfContent.content?.text || '';
        const pages = pdfContent.metadata?.pages || 'unknown';
        
        return `Extract credit card information from this PDF document and return BOTH formats:

SOURCE: ${url}
DOCUMENT TITLE: ${title}
CONTENT TYPE: PDF Document (${pages} pages)
ACTUAL URL: ${pdfContent.metadata?.actualUrl || url}

PDF CONTENT:
${textContent}

This is a PDF document that may contain:
- Terms and conditions for credit card offers
- Bank promotional materials  
- Credit card feature descriptions
- Offer details and eligibility criteria
- Bank partnership information
- Cardholder benefits and perks

EXTRACTION INSTRUCTIONS:
1. Extract any credit card names, bank names, and variants mentioned
2. Identify all benefits, offers, rewards, and perks described
3. Look for partnership details with merchants/brands
4. Extract any specific terms, conditions, or eligibility criteria
5. Identify earning rates, redemption options, and reward categories
6. Note any time-limited offers or promotional details

Be flexible in extraction as PDFs may have different formatting.
If minimal information is available, extract what you can find.
For PDFs, even partial information is valuable.

Return ONLY a JSON object with BOTH formats using the exact same structure as web content:

{
  "standard_format": {
    "card": {"name": "", "bank": "", "variant": "", "description": "", "target_audience": ""},
    "rewards": {
      "program": "",
      "type": "",
      "earning": {
        "base_rate": 0,
        "categories": [
          {
            "name": "",
            "rate": 0,
            "cap": null,
            "description": "",
            "terms_and_conditions": "",
            "how_to_earn": "",
            "validity": "",
            "exclusions": ""
          }
        ],
        "bonus_rates": [
          {
            "condition": "",
            "rate": 0,
            "validity": "",
            "terms_and_conditions": ""
          }
        ]
      },
      "redemption": [
        {
          "option": "",
          "minimum": null,
          "value": null,
          "process": "",
          "terms_and_conditions": "",
          "validity": "",
          "processing_time": ""
        }
      ]
    },
    "benefits": [
      {
        "category": "",
        "name": "",
        "description": "",
        "how_to_avail": "",
        "value": "",
        "terms_and_conditions": "",
        "validity": "",
        "eligibility": "",
        "usage_limit": ""
      }
    ],
    "current_offers": [
      {
        "title": "",
        "description": "",
        "validity": "",
        "terms_and_conditions": "",
        "activation_required": false,
        "how_to_activate": "",
        "eligibility": "",
        "maximum_benefit": "",
        "offer_code": "",
        "exclusions": ""
      }
    ],
    "perks": [
      {
        "name": "",
        "description": "",
        "category": "",
        "usage_limit": "",
        "how_to_use": "",
        "terms_and_conditions": "",
        "value": "",
        "validity": ""
      }
    ],
    "partnerships": [
      {
        "partner": "",
        "benefit": "",
        "category": "",
        "validity": "",
        "how_to_avail": "",
        "terms_and_conditions": "",
        "discount_percentage": "",
        "maximum_discount": ""
      }
    ],
    "fees_and_charges": [
      {
        "type": "",
        "amount": "",
        "waiver_conditions": "",
        "frequency": "",
        "terms_and_conditions": ""
      }
    ]
  },
  "structured_format": {
    "Metadata": {"PK": "CARD#BANK_NAME", "SK": "METADATA", "card_name": "", "issuer": "", "network": [], "type": "Credit Card", "category": []},
    "features": {"PK": "CARD#BANK_NAME", "SK": "FEATURES", "digital_onboarding": false, "contactless_payments": false, "customization_options": {}, "app_management": [], "security_features": []},
    "rewards": {"PK": "CARD#BANK_NAME", "SK": "REWARDS", "reward_currency": "", "cashback_program": [], "earning_structure": [], "redemption": {}},
    "fees": {"PK": "CARD#BANK_NAME", "SK": "FEES", "joining_fee": null, "renewal_fee": null, "tax_applicable": true, "renewal_waiver_condition": "", "joining_fee_waiver_condition": "", "other_charges": {}},
    "eligibility": {"PK": "CARD#BANK_NAME", "SK": "ELIGIBILITY", "salaried": {}, "self_employed": {}},
    "related_docs": {"PK": "CARD#BANK_NAME", "SK": "PDFS", "pdfs": []}
  }
}`;
    }

    /**
     * Parse AI response and handle errors
     */
    parseAIResponse(response) {
        try {
            // Clean the response
            let cleanedResponse = response.trim();
            
            
            // Find JSON boundaries
            const start = cleanedResponse.indexOf('{');
            const end = cleanedResponse.lastIndexOf('}') + 1;
            
            if (start === -1 || end === 0) {
                throw new Error('No JSON object found in response');
            }
            
            const jsonStr = cleanedResponse.substring(start, end);
            return JSON.parse(jsonStr);
            
        } catch (error) {
            console.error('❌ Error parsing AI response:', error.message);
            console.log('Raw response:', response.substring(0, 500));
            throw error;
        }
    }

    /**
     * Convert standard format to structured format
     */
    convertToStructuredFormat(standardData, url) {
        try {
            const cardName = standardData.card?.name || '';
            const bankName = standardData.card?.bank || '';
            const pkValue = `CARD#${bankName.replace(/\s+/g, '_').toUpperCase()}`;

            return {
                Metadata: {
                    PK: pkValue,
                    SK: "METADATA",
                    card_name: cardName,
                    issuer: bankName,
                    network: this.extractNetworks(standardData),
                    type: "Credit Card",
                    category: this.categorizeCard(standardData)
                },
                features: {
                    PK: pkValue,
                    SK: "FEATURES", 
                    digital_onboarding: false,
                    contactless_payments: false,
                    customization_options: {},
                    app_management: [],
                    security_features: []
                },
                rewards: {
                    PK: pkValue,
                    SK: "REWARDS",
                    reward_currency: standardData.rewards?.type || '',
                    cashback_program: this.extractCashbackProgram(standardData.rewards),
                    earning_structure: this.extractEarningStructure(standardData.rewards),
                    redemption: this.extractRedemptionOptions(standardData.rewards)
                },
                fees: {
                    PK: pkValue,
                    SK: "FEES",
                    joining_fee: null,
                    renewal_fee: null,
                    tax_applicable: true,
                    renewal_waiver_condition: '',
                    joining_fee_waiver_condition: '',
                    other_charges: this.extractOtherCharges(standardData.fees_and_charges)
                },
                eligibility: {
                    PK: pkValue,
                    SK: "ELIGIBILITY",
                    salaried: {},
                    self_employed: {}
                },
                related_docs: {
                    PK: pkValue,
                    SK: "PDFS",
                    pdfs: []
                }
            };
        } catch (error) {
            console.error('❌ Error converting to structured format:', error.message);
            return this.getDefaultStructuredFormat();
        }
    }

    /**
     * Helper methods for structured format conversion
     */
    extractNetworks(standardData) {
        // Extract card networks from content
        const networks = [];
        const content = JSON.stringify(standardData).toLowerCase();
        
        if (content.includes('visa')) networks.push('Visa');
        if (content.includes('mastercard') || content.includes('master card')) networks.push('Mastercard');
        if (content.includes('rupay')) networks.push('RuPay');
        if (content.includes('american express') || content.includes('amex')) networks.push('American Express');
        
        return networks;
    }

    categorizeCard(standardData) {
        const categories = [];
        const content = JSON.stringify(standardData).toLowerCase();
        
        if (content.includes('travel') || content.includes('miles')) categories.push('Travel');
        if (content.includes('cashback')) categories.push('Cashback');
        if (content.includes('fuel') || content.includes('petrol')) categories.push('Fuel');
        if (content.includes('shopping') || content.includes('retail')) categories.push('Shopping');
        if (content.includes('dining') || content.includes('restaurant')) categories.push('Dining');
        if (content.includes('premium') || content.includes('luxury')) categories.push('Premium');
        
        return categories.length > 0 ? categories : ['General'];
    }

    extractCashbackProgram(rewards) {
        if (!rewards?.earning?.categories) return [];
        
        return rewards.earning.categories
            .filter(cat => cat.name && cat.rate)
            .map(cat => ({
                category: cat.name,
                rate: cat.rate,
                cap: cat.cap || null
            }));
    }

    extractEarningStructure(rewards) {
        if (!rewards?.earning) return [];
        
        const structure = [];
        
        if (rewards.earning.base_rate) {
            structure.push({
                type: 'base',
                rate: rewards.earning.base_rate,
                description: 'Base earning rate'
            });
        }
        
        if (rewards.earning.categories) {
            rewards.earning.categories.forEach(cat => {
                structure.push({
                    type: 'category',
                    category: cat.name,
                    rate: cat.rate,
                    description: cat.description || ''
                });
            });
        }
        
        return structure;
    }

    extractRedemptionOptions(rewards) {
        if (!rewards?.redemption) return {};
        
        return {
            options: rewards.redemption.map(opt => ({
                method: opt.option,
                minimum: opt.minimum,
                value: opt.value,
                description: opt.process || ''
            }))
        };
    }

    extractOtherCharges(feesAndCharges) {
        if (!feesAndCharges) return {};
        
        const charges = {};
        feesAndCharges.forEach(fee => {
            if (fee.type && fee.amount) {
                charges[fee.type.toLowerCase().replace(/\s+/g, '_')] = {
                    amount: fee.amount,
                    frequency: fee.frequency || '',
                    waiver_conditions: fee.waiver_conditions || ''
                };
            }
        });
        
        return charges;
    }

    getDefaultStructuredFormat() {
        return {
            Metadata: {PK: "CARD#UNKNOWN", SK: "METADATA", card_name: "", issuer: "", network: [], type: "Credit Card", category: []},
            features: {PK: "CARD#UNKNOWN", SK: "FEATURES", digital_onboarding: false, contactless_payments: false, customization_options: {}, app_management: [], security_features: []},
            rewards: {PK: "CARD#UNKNOWN", SK: "REWARDS", reward_currency: "", cashback_program: [], earning_structure: [], redemption: {}},
            fees: {PK: "CARD#UNKNOWN", SK: "FEES", joining_fee: null, renewal_fee: null, tax_applicable: true, renewal_waiver_condition: "", joining_fee_waiver_condition: "", other_charges: {}},
            eligibility: {PK: "CARD#UNKNOWN", SK: "ELIGIBILITY", salaried: {}, self_employed: {}},
            related_docs: {PK: "CARD#UNKNOWN", SK: "PDFS", pdfs: []}
        };
    }

    /**
     * Update token usage tracking
     */
    updateTokenUsage(usage) {
        if (usage) {
            this.totalInputTokens += usage.prompt_tokens || 0;
            this.totalOutputTokens += usage.completion_tokens || 0;
            
            console.log(`📊 Token usage - Input: ${usage.prompt_tokens}, Output: ${usage.completion_tokens}`);
            console.log(`📊 Total tokens - Input: ${this.totalInputTokens}, Output: ${this.totalOutputTokens}`);
        }
    }

    /**
     * Get total token usage
     */
    getTotalTokenUsage() {
        return {
            total_input_tokens: this.totalInputTokens,
            total_output_tokens: this.totalOutputTokens,
            total_tokens: this.totalInputTokens + this.totalOutputTokens
        };
    }

    /**
     * Reset token counters
     */
    resetTokenUsage() {
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        console.log('🔄 Token usage counters reset');
    }
}

module.exports = AIProcessor;
