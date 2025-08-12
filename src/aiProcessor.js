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
     * Process listing page to extract card URLs with enhanced Know More detection
     */
    async extractCardUrls(listingContent, baseUrl) {
        try {
            console.log('🔍 Extracting card URLs from listing page with OpenAI...');
            
            const prompt = this.buildEnhancedListingPrompt(listingContent, baseUrl);
            const estimatedTokens = prompt.length / 4;
            
            if (estimatedTokens > 15000) {
                console.log(`⚠️ Content too long (${Math.round(estimatedTokens)} tokens), chunking...`);
                return await this.processListingInChunks(listingContent, baseUrl);
            }

            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [
                    {
                        role: "system",
                        content: this.getEnhancedListingSystemPrompt()
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 3500,
                response_format: { type: "json_object" }
            });

            const usage = response.usage;
            this.totalInputTokens += usage.prompt_tokens;
            this.totalOutputTokens += usage.completion_tokens;

            console.log(`📈 Listing Token Usage:`);
            console.log(`   Input: ${usage.prompt_tokens} tokens`);
            console.log(`   Output: ${usage.completion_tokens} tokens`);
            console.log(`   Total: ${usage.total_tokens} tokens`);

            const responseContent = response.choices[0].message.content.trim();
            
            if (response.choices[0].finish_reason === 'length') {
                console.warn('⚠️ Response was truncated. Retrying with chunks...');
                return await this.processListingInChunks(listingContent, baseUrl);
            }

            const extractedData = this.cleanAndParseResponse(responseContent);
            
            console.log(`🔍 GPT Response: Found ${extractedData.cards?.length || 0} cards`);
            if (extractedData.cards?.length > 0) {
                console.log(`📋 Sample card: ${extractedData.cards[0].name} -> ${extractedData.cards[0].url}`);
            }
            
            const validatedData = await this.postProcessAndValidateUrls(extractedData, baseUrl);
            
            console.log(`🎯 Before validation: ${extractedData.cards?.length || 0} cards`);
            console.log(`✅ After validation: ${validatedData.cards?.length || 0} valid cards`);

            return validatedData;

        } catch (error) {
            console.error('❌ Listing extraction error:', error.message);
            if (error.message.includes('JSON')) {
                console.log('🔄 JSON parsing failed, attempting retry with chunks...');
                return await this.processListingInChunks(listingContent, baseUrl);
            }
            return { cards: [], invalid_urls: [] };
        }
    }

    /**
     * Enhanced system prompt that specifically targets Know More buttons and card links
     */
    getEnhancedListingSystemPrompt() {
        return `You are a specialized credit card URL extractor. You MUST respond with ONLY valid JSON.

CRITICAL RESPONSE RULES:
- Start response immediately with {
- End response with }
- NO explanations before or after JSON
- NO markdown code blocks
- Only valid JSON syntax

EXTRACTION MISSION:
Find ALL individual credit card page URLs from a listing page. Focus specifically on:

1. "Know More" buttons/links next to each card
2. "Learn More" / "View Details" / "Apply Now" links  
3. Card names that are clickable links
4. Any clickable element that leads to individual card pages

CRITICAL: Look for patterns like:
- Links containing card names (pixel-play, freedom, millennia, regalia, etc.)
- URLs ending with specific card identifiers
- Buttons or links in card sections/containers
- Both anchor tags <a> and button elements with onclick handlers`;
    }

    /**
     * Enhanced listing prompt that gives GPT better context to find Know More links
     */
    buildEnhancedListingPrompt(listingContent, baseUrl) {
        const title = listingContent.title || '';
        const textContent = listingContent.content?.text || '';
        const htmlContent = listingContent.content?.html || '';
        const links = listingContent.links || [];
        
        // Filter and prepare relevant links for GPT
        const relevantLinks = links.filter(link => {
            const href = link.href || link.url || '';
            const text = (link.text || link.title || '').toLowerCase();
            const context = (link.context || '').toLowerCase();
            
            // Look for credit card related links
            return href.includes('credit-card') || 
                   href.includes('/cards/') ||
                   text.includes('know more') || 
                   text.includes('learn more') || 
                   text.includes('view details') || 
                   text.includes('apply') ||
                   href.includes('pixel') ||
                   href.includes('freedom') ||
                   href.includes('millennia') ||
                   href.includes('regalia') ||
                   href.includes('diners') ||
                   context.includes('card');
        });

        return `EXTRACT CREDIT CARD URLs FROM THIS HDFC BANK LISTING PAGE:

BASE URL: ${baseUrl}
PAGE TITLE: ${title}

CONTENT TEXT (First 12000 chars):
${textContent.slice(0, 12000)}

RELEVANT LINKS FOUND ON PAGE:
${relevantLinks.slice(0, 50).map(link => 
    `- URL: ${link.href || link.url || 'N/A'}
  TEXT: "${link.text || link.title || 'N/A'}"
  CONTEXT: ${link.context || 'N/A'}`
).join('\n')}

HTML SAMPLE (First 5000 chars):
${htmlContent.slice(0, 5000)}

EXTRACTION INSTRUCTIONS:
1. Look for individual credit card pages (NOT the main listing page)
2. Each card should have a "Know More" / "Learn More" / "View Details" button/link
3. Extract the URL that each button/link points to
4. Card names to look for: PIXEL Play, Freedom, Millennia, Regalia, Diners Club, MoneyBack, IndianOil, etc.
5. URLs should contain specific card names or identifiers
6. Convert relative URLs to absolute using base URL: ${baseUrl}

REQUIRED JSON FORMAT:
{
  "cards": [
    {
      "name": "Specific Card Name (e.g., PIXEL Play Credit Card)",
      "description": "Brief card description from page",
      "url": "Complete absolute URL to individual card page", 
      "category": "Personal Credit Card",
      "key_features": ["feature1", "feature2"],
      "annual_fee": null,
      "link_context": "Know More / Learn More / View Details",
      "extraction_source": "Where you found this link"
    }
  ],
  "total_cards_found": 0
}

CRITICAL SUCCESS CRITERIA:
- MUST find the "Know More", "Learn more" etc button URLs for each card
- Each URL should lead to a SPECIFIC card's detail page
- Do NOT include the main listing page URL
- Look in BOTH the content text AND the links array
- Pay special attention to button elements and their associated URLs

Return ONLY the JSON object with ALL credit card URLs you can find.`;
    }

    /**
     * Process listing in chunks with enhanced extraction
     */
    async processListingInChunks(listingContent, baseUrl) {
        console.log('📝 Processing listing in chunks with enhanced extraction...');
        
        const allCards = [];
        const content = listingContent.content?.text || '';
        const links = listingContent.links || [];
        const chunkSize = 6000;
        
        // First, try to extract from links directly
        const cardLinksFromList = this.extractCardLinksFromArray(links, baseUrl);
        if (cardLinksFromList.length > 0) {
            console.log(`🎯 Found ${cardLinksFromList.length} card links directly from links array`);
            allCards.push(...cardLinksFromList);
        }
        
        // Then chunk the content for additional extraction
        const chunks = [];
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.slice(i, i + chunkSize));
        }

        console.log(`📋 Processing ${chunks.length} content chunks...`);

        for (let i = 0; i < Math.min(chunks.length, 5); i++) { // Limit to 5 chunks
            try {
                console.log(`🔍 Processing chunk ${i + 1}...`);
                
                const chunkContent = {
                    title: `${listingContent.title} (Part ${i + 1})`,
                    content: { text: chunks[i] },
                    links: i === 0 ? links.slice(0, 100) : [] // Include links only in first chunk
                };

                const prompt = this.buildEnhancedListingPrompt(chunkContent, baseUrl);
                
                const response = await this.openai.chat.completions.create({
                    model: this.config.model,
                    messages: [
                        {
                            role: "system",
                            content: this.getEnhancedListingSystemPrompt()
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 3000,
                    response_format: { type: "json_object" }
                });

                const usage = response.usage;
                this.totalInputTokens += usage.prompt_tokens;
                this.totalOutputTokens += usage.completion_tokens;

                const responseContent = response.choices[0].message.content.trim();
                const extractedData = this.cleanAndParseResponse(responseContent);
                
                if (extractedData.cards && Array.isArray(extractedData.cards)) {
                    allCards.push(...extractedData.cards);
                    console.log(`📍 Chunk ${i + 1} found: ${extractedData.cards.length} cards`);
                }

                await Utils.sleep(1000);

            } catch (error) {
                console.error(`❌ Error processing chunk ${i + 1}:`, error.message);
                continue;
            }
        }

        // Remove duplicates
        const uniqueCards = allCards.filter((card, index, self) => 
            index === self.findIndex(c => c.url === card.url && c.name === card.name)
        );

        console.log(`🎯 Total extracted: ${allCards.length}, Unique: ${uniqueCards.length}`);

        const consolidatedData = { 
            cards: uniqueCards, 
            total_cards_found: uniqueCards.length 
        };
        
        return await this.postProcessAndValidateUrls(consolidatedData, baseUrl);
    }

    /**
     * Extract card links directly from the links array
     */
    extractCardLinksFromArray(links, baseUrl) {
        const cardLinks = [];
        
        links.forEach(link => {
            const href = link.href || link.url || '';
            const text = (link.text || link.title || '').toLowerCase();
            const context = (link.context || '').toLowerCase();
            
            // Check if this looks like a credit card link
            const isCardLink = href.includes('credit-card') || 
                              href.includes('/cards/') ||
                              text.includes('know more') ||
                              text.includes('learn more') ||
                              text.includes('view details');
                              
            const isPersonalCard = !href.includes('business') && 
                                   !href.includes('corporate') &&
                                   !href.includes('debit');
                                   
            if (isCardLink && isPersonalCard && href !== baseUrl) {
                // Try to extract card name from URL or text
                let cardName = this.extractCardNameFromUrl(href) || 
                              this.extractCardNameFromText(text) || 
                              'Unknown Card';
                
                let normalizedUrl = href;
                if (href.startsWith('/')) {
                    const base = new URL(baseUrl);
                    normalizedUrl = `${base.protocol}//${base.host}${href}`;
                }
                
                cardLinks.push({
                    name: cardName,
                    description: `Credit card extracted from ${text}`,
                    url: normalizedUrl,
                    category: "Personal Credit Card",
                    key_features: [],
                    annual_fee: null,
                    link_context: text,
                    extraction_source: "links_array"
                });
            }
        });
        
        return cardLinks;
    }

    /**
     * Extract card name from URL
     */
    extractCardNameFromUrl(url) {
        const urlLower = url.toLowerCase();
        
        // Common HDFC card patterns
        if (urlLower.includes('pixel-play')) return 'PIXEL Play Credit Card';
        if (urlLower.includes('freedom')) return 'Freedom Credit Card';
        if (urlLower.includes('millennia')) return 'Millennia Credit Card';
        if (urlLower.includes('regalia')) return 'Regalia Credit Card';
        if (urlLower.includes('diners')) return 'Diners Club Credit Card';
        if (urlLower.includes('moneyback')) return 'MoneyBack Credit Card';
        if (urlLower.includes('indianoil')) return 'IndianOil HDFC Bank Credit Card';
        if (urlLower.includes('infinia')) return 'INFINIA Credit Card';
        if (urlLower.includes('marriott')) return 'Marriott Bonvoy Credit Card';
        if (urlLower.includes('irctc')) return 'IRCTC HDFC Bank Credit Card';
        
        // Try to extract from URL path
        const pathParts = url.split('/').filter(part => part.length > 3);
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes('-')) {
            return lastPart.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ') + ' Credit Card';
        }
        
        return null;
    }

    /**
     * Extract card name from link text
     */
    extractCardNameFromText(text) {
        if (text.includes('pixel')) return 'PIXEL Play Credit Card';
        if (text.includes('freedom')) return 'Freedom Credit Card';  
        if (text.includes('millennia')) return 'Millennia Credit Card';
        if (text.includes('regalia')) return 'Regalia Credit Card';
        return null;
    }

    /**
     * Process content with flexible JSON structure - NO TRUNCATION
     */
    async processContent(mainContent, linkedContents, url) {
        try {
            console.log('🤖 Processing content with OpenAI for DUAL format output...');
            
            const prompt = this.buildFlexibleComprehensivePrompt(mainContent, linkedContents, url);
            
            const response = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [
                    {
                        role: "system",
                        content: this.getFlexibleSystemPrompt()
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: this.config.temperature,
                max_tokens: 4000,
                response_format: { type: "json_object" }
            });

            const usage = response.usage;
            this.totalInputTokens += usage.prompt_tokens;
            this.totalOutputTokens += usage.completion_tokens;

            console.log(`📈 Token Usage:`);
            console.log(`   Input: ${usage.prompt_tokens} tokens`);
            console.log(`   Output: ${usage.completion_tokens} tokens`);
            console.log(`   Total: ${usage.total_tokens} tokens`);

            if (response.choices[0].finish_reason === 'length') {
                throw new Error('Response was truncated due to token limit');
            }

            let responseContent = response.choices[0].message.content.trim();
            const extractedData = this.cleanAndParseResponse(responseContent);

            // Handle dual format response
            if (extractedData.standard_format && extractedData.structured_format) {
                const standardJson = {
                    ...extractedData.standard_format,
                    metadata: {
                        last_updated: new Date().toISOString(),
                        confidence_score: this.calculateConfidenceScore(extractedData.standard_format),
                        missing_data: this.findMissingData(extractedData.standard_format),
                        processed_links: linkedContents.length,
                        token_usage: {
                            input_tokens: usage.prompt_tokens,
                            output_tokens: usage.completion_tokens,
                            total_tokens: usage.total_tokens
                        }
                    }
                };

                return {
                    standardJson: standardJson,
                    structuredJson: extractedData.structured_format
                };
            } else {
                // Fallback to conversion
                const standardData = extractedData.standard_format || extractedData;
                const structuredData = this.convertToStructuredFormat(standardData, url);
                
                return {
                    standardJson: {
                        ...standardData,
                        metadata: {
                            last_updated: new Date().toISOString(),
                            confidence_score: this.calculateConfidenceScore(standardData),
                            missing_data: this.findMissingData(standardData),
                            processed_links: linkedContents.length,
                            token_usage: {
                                input_tokens: usage.prompt_tokens,
                                output_tokens: usage.completion_tokens,
                                total_tokens: usage.total_tokens
                            }
                        }
                    },
                    structuredJson: structuredData
                };
            }

        } catch (error) {
            console.error('❌ OpenAI processing error:', error.message);
            return {
                standardJson: this.createFallbackExtraction(mainContent, url),
                structuredJson: this.createFallbackStructuredFormat(url)
            };
        }
    }

    /**
     * Flexible system prompt for content processing
     */
    getFlexibleSystemPrompt() {
        return `You are a JSON data processor with flexible output structure. You MUST respond with ONLY valid JSON.

CRITICAL RESPONSE RULES:
- Start with {
- End with }  
- NO explanations
- NO markdown blocks
- NO comments
- Only valid JSON syntax

Extract credit card information and return both standard and structured formats with flexibility to add additional fields as needed but only in standard_resposne.`;
    }

    /**
     * Build flexible comprehensive prompt with the user's preferred structure
     */
    buildFlexibleComprehensivePrompt(mainContent, linkedContents, url) {
        let contentSections = [];

        // Add main content with strict limits
        const mainText = mainContent.content?.text || '';
        contentSections.push(`MAIN PAGE:
URL: ${url}
TITLE: ${mainContent.title}
CONTENT: ${mainText}`); // NO TRUNCATION as requested

        // Add linked content
        linkedContents.forEach((link, index) => {
            if (link.content?.text) {
                contentSections.push(`LINKED PAGE ${index + 1}:
URL: ${link.url}
CONTENT: ${link.content.text}`); // NO TRUNCATION as requested
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
     * Enhanced JSON parsing with markdown checking REMOVED
     */
    cleanAndParseResponse(responseContent) {
        try {
            // Only basic cleaning - NO markdown checking
            let cleaned = responseContent.trim();
            
            // Try to fix common JSON issues only
            cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
            cleaned = cleaned.replace(/([}\]])\s*,\s*([}\]])/g, '$1$2'); // Fix double commas
            
            return JSON.parse(cleaned);
            
        } catch (error) {
            console.error('Failed to parse OpenAI response:', error.message);
            console.error('Raw response length:', responseContent.length);
            console.error('First 500 chars:', responseContent.slice(0, 500));
            console.error('Last 500 chars:', responseContent.slice(-500));
            
            // Try to extract partial JSON
            try {
                const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    let partialJson = jsonMatch[0];
                    partialJson = partialJson.replace(/,(\s*[}\]])/g, '$1');
                    return JSON.parse(partialJson);
                }
            } catch (e) {
                console.error('Failed to extract partial JSON:', e.message);
            }
            
            throw new Error(`Invalid JSON response from OpenAI: ${error.message}`);
        }
    }

    /**
     * Post-process and validate URLs to remove 404s and broken links
     */
    async postProcessAndValidateUrls(extractedData, baseUrl) {
        if (!extractedData.cards || !Array.isArray(extractedData.cards)) {
            return { cards: [], invalid_urls: [], total_cards_found: 0 };
        }

        console.log('🔗 Validating URLs for accessibility...');
        const validCards = [];
        const invalidUrls = [];

        for (let i = 0; i < extractedData.cards.length; i++) {
            const card = extractedData.cards[i];
            
            try {
                console.log(`🔍 Validating ${i + 1}/${extractedData.cards.length}: ${card.name}`);
                
                if (!this.isValidCreditCard(card)) {
                    invalidUrls.push({
                        ...card,
                        validation_error: 'Content filtering - not a valid credit card',
                        error_type: 'CONTENT_FILTER'
                    });
                    continue;
                }

                const normalizedCard = this.normalizeCardData(card, baseUrl);
                const isAccessible = await this.validateUrlAccessibility(normalizedCard.url);
                
                if (isAccessible.valid) {
                    validCards.push({
                        ...normalizedCard,
                        validation_status: 'VALID',
                        response_code: isAccessible.statusCode
                    });
                    console.log(`✅ Valid: ${card.name} (${isAccessible.statusCode})`);
                } else {
                    invalidUrls.push({
                        ...normalizedCard,
                        validation_error: isAccessible.error,
                        error_type: isAccessible.errorType,
                        response_code: isAccessible.statusCode
                    });
                    console.log(`❌ Invalid: ${card.name} - ${isAccessible.error}`);
                }

                await Utils.sleep(500);

            } catch (error) {
                console.error(`❌ Error validating ${card.name}: ${error.message}`);
                invalidUrls.push({
                    ...card,
                    validation_error: error.message,
                    error_type: 'VALIDATION_ERROR'
                });
            }
        }

        return {
            cards: validCards,
            invalid_urls: invalidUrls,
            total_cards_found: validCards.length,
            original_count: extractedData.cards.length,
            filtered_out: invalidUrls.length,
            validation_summary: {
                total_checked: extractedData.cards.length,
                valid_urls: validCards.length,
                invalid_urls: invalidUrls.length,
                success_rate: extractedData.cards.length > 0 ? 
                    Math.round((validCards.length / extractedData.cards.length) * 100) / 100 : 0
            }
        };
    }

    async validateUrlAccessibility(url) {
        try {
            const response = await axios.head(url, {
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            return { valid: true, statusCode: response.status, error: null, errorType: null };

        } catch (error) {
            let errorType = 'UNKNOWN';
            let errorMessage = error.message;

            if (error.response) {
                errorType = 'HTTP_ERROR';
                errorMessage = `HTTP ${error.response.status} - ${error.response.statusText}`;
                if (error.response.status === 404) {
                    errorType = 'NOT_FOUND_404';
                    errorMessage = '404 Not Found';
                }
            } else if (error.code === 'ECONNREFUSED') {
                errorType = 'CONNECTION_REFUSED';
                errorMessage = 'Connection refused';
            } else if (error.code === 'ENOTFOUND') {
                errorType = 'DNS_ERROR';
                errorMessage = 'Domain not found';
            } else if (error.code === 'ETIMEDOUT') {
                errorType = 'TIMEOUT';
                errorMessage = 'Request timeout';
            }

            return { valid: false, statusCode: error.response?.status || null, error: errorMessage, errorType: errorType };
        }
    }

    isValidCreditCard(card) {
        if (!card.url || !card.name) {
            console.log(`⚠️ Filtering out: Missing URL or name`);
            return false;
        }

        const url = card.url.toLowerCase();
        const name = card.name.toLowerCase();
        const description = (card.description || '').toLowerCase();

        const excludePatterns = [
            'business', 'corporate', 'commercial', 'enterprise', 'debit', 'prepaid',
            'gift-card', 'forex', 'travel-card', 'salary-account', 'savings-account',
            'loan', 'insurance', 'mutual-fund', 'investment'
        ];

        const shouldExclude = excludePatterns.some(pattern => 
            url.includes(pattern) || name.includes(pattern) || description.includes(pattern)
        );

        if (shouldExclude) {
            console.log(`⚠️ Filtering out: ${card.name} - contains excluded pattern`);
            return false;
        }

        const includePatterns = [
            'credit-card', 'credit card', 'creditcard', 'rewards', 'cashback',
            'points', 'platinum', 'gold', 'premium', 'prime', 'elite'
        ];

        const hasIncludePattern = includePatterns.some(pattern => 
            url.includes(pattern.replace(/\s+/g, '-')) || 
            name.includes(pattern) || 
            description.includes(pattern)
        );

        if (!hasIncludePattern) {
            console.log(`⚠️ Filtering out: ${card.name} - no credit card indicators`);
            return false;
        }

        return true;
    }

    normalizeCardData(card, baseUrl) {
        let normalizedUrl = card.url;
        if (card.url.startsWith('/')) {
            const base = new URL(baseUrl);
            normalizedUrl = `${base.protocol}//${base.host}${card.url}`;
        }

        return {
            ...card,
            url: normalizedUrl,
            name: card.name.replace(/\s+/g, ' ').trim(),
            category: card.category || 'Personal Credit Card',
            key_features: card.key_features || [],
            annual_fee: card.annual_fee || null
        };
    }

    convertToStructuredFormat(data, url) {
        const cardName = data.card?.name || 'Unknown Card';
        const issuer = data.card?.bank || 'Unknown Bank';
        const pkValue = `CARD#${issuer.toUpperCase().replace(/\s+/g, '_')}_${cardName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

        return {
            Metadata: {
                PK: pkValue,
                SK: "METADATA",
                card_name: cardName,
                issuer: issuer,
                network: this.extractNetworks(data),
                type: "Credit Card",
                category: this.extractCategories(data)
            },
            features: {
                PK: pkValue,
                SK: "FEATURES",
                digital_onboarding: this.extractDigitalOnboarding(data),
                contactless_payments: this.extractContactlessPayments(data),
                customization_options: {
                    merchant_cashback_selection: false,
                    card_design_selection: [],
                    billing_cycle_selection: false
                },
                app_management: this.extractAppFeatures(data),
                security_features: this.extractSecurityFeatures(data)
            },
            rewards: {
                PK: pkValue,
                SK: "REWARDS",
                reward_currency: this.extractRewardCurrency(data),
                cashback_program: this.extractCashbackProgram(data),
                earning_structure: this.extractEarningStructure(data),
                redemption: this.extractRedemptionInfo(data)
            },
            fees: {
                PK: pkValue,
                SK: "FEES",
                joining_fee: this.extractJoiningFee(data),
                renewal_fee: this.extractRenewalFee(data),
                tax_applicable: true,
                renewal_waiver_condition: this.extractRenewalWaiver(data),
                joining_fee_waiver_condition: this.extractJoiningWaiver(data),
                other_charges: this.extractOtherCharges(data)
            },
            eligibility: {
                PK: pkValue,
                SK: "ELIGIBILITY",
                salaried: this.extractSalariedEligibility(data),
                self_employed: this.extractSelfEmployedEligibility(data)
            },
            related_docs: {
                PK: pkValue,
                SK: "PDFS",
                pdfs: this.extractPdfReferences(data, pkValue)
            }
        };
    }

    // Helper methods for structured format conversion
    extractNetworks(data) {
        const networks = [];
        const content = JSON.stringify(data).toLowerCase();
        if (content.includes('visa')) networks.push('Visa');
        if (content.includes('mastercard')) networks.push('Mastercard');
        if (content.includes('rupay')) networks.push('RuPay');
        return networks.length > 0 ? networks : ['Visa'];
    }

    extractCategories(data) {
        const categories = [];
        const content = JSON.stringify(data).toLowerCase();
        if (content.includes('cashback')) categories.push('Cashback');
        if (content.includes('travel')) categories.push('Travel');
        if (content.includes('lifestyle')) categories.push('Lifestyle');
        if (content.includes('premium')) categories.push('Premium');
        if (content.includes('reward')) categories.push('Rewards');
        if (content.includes('digital')) categories.push('Digital');
        return categories.length > 0 ? categories : ['Credit Card'];
    }

    extractDigitalOnboarding(data) {
        const content = JSON.stringify(data).toLowerCase();
        return content.includes('digital') || content.includes('online application');
    }

    extractContactlessPayments(data) {
        const content = JSON.stringify(data).toLowerCase();
        return content.includes('contactless') || content.includes('tap');
    }

    extractAppFeatures(data) {
        const features = ['Card Controls', 'Rewards', 'Statement', 'Bill Payment'];
        const content = JSON.stringify(data).toLowerCase();
        if (content.includes('emi')) features.push('EMI Dashboard');
        if (content.includes('transaction')) features.push('Recent Transactions');
        if (content.includes('dispute')) features.push('Disputes');
        return features;
    }

    extractSecurityFeatures(data) {
        return ['SMS Alerts', 'Transaction Limits', 'Card Lock/Unlock'];
    }

    extractRewardCurrency(data) {
        if (data.rewards?.program) return data.rewards.program;
        const content = JSON.stringify(data).toLowerCase();
        if (content.includes('cashpoint')) return 'CashPoints';
        if (content.includes('reward point')) return 'Reward Points';
        return 'Reward Points';
    }

    extractCashbackProgram(data) {
        const program = [];
        if (data.rewards?.earning?.categories) {
            data.rewards.earning.categories.forEach(category => {
                program.push({
                    rate: category.rate || 1,
                    categories: [{ pack: category.name || 'General', merchants: [] }],
                    max_points_per_month: category.cap || null
                });
            });
        }
        return program;
    }

    extractEarningStructure(data) {
        const structure = [];
        if (data.rewards?.earning?.categories) {
            data.rewards.earning.categories.forEach(category => {
                structure.push({
                    rate: category.rate || 1,
                    category: category.name || 'General',
                    cap_per_month: category.cap || null
                });
            });
        }
        return structure.length > 0 ? structure : [
            { rate: 1, category: 'All spends', cap_per_month: null }
        ];
    }

    extractRedemptionInfo(data) {
        if (data.rewards?.redemption?.length > 0) {
            const redemption = data.rewards.redemption[0];
            return {
                rate: redemption.value || '1 Point = ₹0.25',
                minimum_points: redemption.minimum || 1000,
                validity_years: 3
            };
        }
        return {
            rate: '1 Point = ₹0.25',
            minimum_points: 1000,
            validity_years: 3
        };
    }

    extractJoiningFee(data) {
        const content = JSON.stringify(data).toLowerCase();
        const feeMatch = content.match(/joining.*?fee.*?₹?(\d+)/i) || content.match(/₹(\d+).*?joining/i);
        return feeMatch ? parseInt(feeMatch[1]) : null;
    }

    extractRenewalFee(data) {
        const content = JSON.stringify(data).toLowerCase();
        const feeMatch = content.match(/renewal.*?fee.*?₹?(\d+)/i) || content.match(/annual.*?fee.*?₹?(\d+)/i);
        return feeMatch ? parseInt(feeMatch[1]) : null;
    }

    extractRenewalWaiver(data) {
        const content = JSON.stringify(data).toLowerCase();
        const waiverMatch = content.match(/waiver.*?₹?(\d+,?\d*)/i) || content.match(/spend.*?₹?(\d+,?\d*)/i);
        return waiverMatch ? `Spend ₹${waiverMatch[1]} or more in a year` : null;
    }

    extractJoiningWaiver(data) {
        const content = JSON.stringify(data).toLowerCase();
        const waiverMatch = content.match(/joining.*?waiver.*?₹?(\d+,?\d*)/i);
        return waiverMatch ? `Spend ₹${waiverMatch[1]} within 90 days` : null;
    }

    extractOtherCharges(data) {
        return {
            cash_advance: '3.5% (Min ₹500)',
            foreign_transaction: '3.5%',
            overlimit: '2.5% (Min ₹500)'
        };
    }

    extractSalariedEligibility(data) {
        return {
            age: { min: 21, max: 60 },
            min_income_per_month: 25000
        };
    }

    extractSelfEmployedEligibility(data) {
        return {
            age: { min: 21, max: 65 },
            min_itr_per_annum: 600000
        };
    }

    extractPdfReferences(data, pkValue) {
        const pdfs = [];
        const content = JSON.stringify(data);
        if (content.includes('terms') || content.includes('condition')) {
            pdfs.push({
                type: 'terms_and_conditions',
                storage: {
                    s3_key: `creditcards/${pkValue.toLowerCase()}/terms.pdf`,
                    extracted_text_key: `creditcards/${pkValue.toLowerCase()}/terms.txt`
                }
            });
        }
        if (content.includes('fees') || content.includes('charges')) {
            pdfs.push({
                type: 'fees_and_charges',
                storage: {
                    s3_key: `creditcards/${pkValue.toLowerCase()}/fees.pdf`,
                    extracted_text_key: `creditcards/${pkValue.toLowerCase()}/fees.txt`
                }
            });
        }
        return pdfs;
    }

    createFallbackStructuredFormat(url) {
        const pkValue = `CARD#UNKNOWN_${Date.now()}`;
        return {
            Metadata: { PK: pkValue, SK: "METADATA", card_name: "Unknown Card", issuer: "Unknown Bank", network: ["Visa"], type: "Credit Card", category: ["General"] },
            features: { PK: pkValue, SK: "FEATURES", digital_onboarding: false, contactless_payments: false, customization_options: {}, app_management: [], security_features: [] },
            rewards: { PK: pkValue, SK: "REWARDS", reward_currency: "Points", cashback_program: [], earning_structure: [], redemption: {} },
            fees: { PK: pkValue, SK: "FEES", joining_fee: null, renewal_fee: null, tax_applicable: true, renewal_waiver_condition: null, joining_fee_waiver_condition: null, other_charges: {} },
            eligibility: { PK: pkValue, SK: "ELIGIBILITY", salaried: {}, self_employed: {} },
            related_docs: { PK: pkValue, SK: "PDFS", pdfs: [] }
        };
    }

    calculateConfidenceScore(data) {
        let score = 0;
        if (data.card?.name) score += 20;
        if (data.card?.bank) score += 20;
        if (data.rewards?.earning?.categories?.length > 0) score += 20;
        if (data.benefits?.length > 0) score += 20;
        if (data.current_offers?.length > 0) score += 20;
        return Math.round(score / 100);
    }

    findMissingData(data) {
        const missing = [];
        if (!data.card?.name) missing.push("card_name");
        if (!data.card?.bank) missing.push("bank_name");
        if (!data.rewards?.earning?.categories?.length) missing.push("reward_categories");
        if (!data.benefits?.length) missing.push("benefits");
        return missing;
    }

    createFallbackExtraction(content, url) {
        return {
            card: { name: content?.title || null, bank: null, variant: null },
            rewards: { program: null, type: null, earning: { base_rate: null, categories: [] }, redemption: [] },
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

    getTokenTotals() {
        return {
            totalInputTokens: this.totalInputTokens,
            totalOutputTokens: this.totalOutputTokens,
            totalTokens: this.totalInputTokens + this.totalOutputTokens
        };
    }
}

module.exports = AIProcessor;
