const ContentExtractor = require('./contentExtractor');
const AIProcessor = require('./aiProcessor');
const CardholderBenefitsCrawler = require('./crawler');
const Utils = require('./utils');
const fs = require('fs');
const { URL } = require('url');

class ListingCrawler {
    constructor(openaiApiKey, options = {}) {
        this.contentExtractor = new ContentExtractor();
        this.aiProcessor = new AIProcessor(openaiApiKey);
        this.cardCrawler = new CardholderBenefitsCrawler(openaiApiKey, options);
        this.options = {
            maxCardsToProcess: 0, // 0 = no limit
            delayBetweenCards: options.delayBetweenCards || 5000,
            delayBetweenValidation: options.delayBetweenValidation || 500,
            skipUrlValidation: options.skipUrlValidation || false,
            ...options
        };
    }

    /**
     * Main method to crawl listing page with dual JSON output
     */
    async crawlCardListing(listingUrl) {
        try {
            console.log(`🚀 Starting listing page crawl with dual JSON output: ${listingUrl}`);
            console.log(`🔥 Will generate both standard and structured JSON formats for all cards`);

            // Step 1: Extract listing page content
            const listingContent = await this.contentExtractor.extractFromUrl(listingUrl);
            if (!listingContent.success) {
                throw new Error(`Failed to extract listing content: ${listingContent.error}`);
            }

            console.log(`✅ Successfully extracted listing page content`);

            // Step 2: Extract and validate card URLs
            const listingData = await this.aiProcessor.extractCardUrls(listingContent, listingUrl);
            
            if (!listingData.cards || listingData.cards.length === 0) {
                console.log(`⚠️ No valid and accessible credit cards found after URL validation`);
                return this.createEmptyListingResult(listingUrl, listingData);
            }

            console.log(`🎯 Found ${listingData.cards.length} VALID and ACCESSIBLE credit cards`);
            if (listingData.invalid_urls && listingData.invalid_urls.length > 0) {
                console.log(`🗑️ Filtered out ${listingData.invalid_urls.length} invalid/broken URLs`);
                
                const errorTypes = {};
                listingData.invalid_urls.forEach(url => {
                    const type = url.error_type || 'UNKNOWN';
                    errorTypes[type] = (errorTypes[type] || 0) + 1;
                });
                
                console.log(`📊 Invalid URL breakdown:`);
                Object.entries(errorTypes).forEach(([type, count]) => {
                    console.log(`   - ${type}: ${count} URLs`);
                });
            }

            // Step 3: Process each validated card
            const processedCards = [];
            const structuredCards = [];
            const failedCards = [];
            let processCount = 0;

            const cardsToProcess = listingData.cards;
            console.log(`📋 Processing ALL ${cardsToProcess.length} validated cards...`);

            for (let i = 0; i < cardsToProcess.length; i++) {
                const cardInfo = cardsToProcess[i];
                
                try {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log(`🔍 Processing card ${i + 1}/${cardsToProcess.length}: ${cardInfo.name}`);
                    console.log(`🌐 URL: ${cardInfo.url}`);
                    console.log(`✅ Validation Status: ${cardInfo.validation_status} (${cardInfo.response_code})`);
                    console.log(`${'='.repeat(80)}`);

                    // Process individual card (returns both formats)
                    const cardResult = await this.cardCrawler.crawlCardBenefits(cardInfo.url);
                    
                    // Enhance with listing information
                    const listingInfo = {
                        extracted_from: listingUrl,
                        listing_name: cardInfo.name,
                        listing_description: cardInfo.description,
                        listing_category: cardInfo.category,
                        listing_features: cardInfo.key_features,
                        annual_fee_mentioned: cardInfo.annual_fee,
                        processing_order: i + 1,
                        total_in_listing: cardsToProcess.length,
                        url_validation: {
                            status: cardInfo.validation_status,
                            response_code: cardInfo.response_code,
                            link_context: cardInfo.link_context
                        }
                    };

                    cardResult.standard.listing_info = listingInfo;
                    cardResult.structured.Metadata.listing_info = listingInfo;

                    processedCards.push(cardResult.standard);
                    structuredCards.push(cardResult.structured);
                    processCount++;

                    console.log(`✅ Successfully processed: ${cardInfo.name}`);
                    console.log(`📊 Confidence: ${cardResult.standard.metadata?.confidence_score || 0}`);
                    console.log(`🎁 Benefits: ${cardResult.standard.benefits?.length || 0}, Offers: ${cardResult.standard.current_offers?.length || 0}`);
                    console.log(`📄 Files: ${cardResult.files.standard}, ${cardResult.files.structured}`);

                } catch (error) {
                    console.error(`❌ Failed to process validated card: ${cardInfo.name} - ${error.message}`);
                    failedCards.push({
                        ...cardInfo,
                        processing_error: error.message,
                        processing_order: i + 1
                    });
                }

                // Progress update
                if ((i + 1) % 3 === 0 || i === cardsToProcess.length - 1) {
                    const progressPercent = Math.round(((i + 1) / cardsToProcess.length) * 100);
                    console.log(`\n📈 Progress: ${i + 1}/${cardsToProcess.length} (${progressPercent}%) - ${processCount} successful, ${failedCards.length} failed`);
                }

                // Delay between cards
                if (i < cardsToProcess.length - 1) {
                    console.log(`⏳ Waiting ${this.options.delayBetweenCards}ms before next card...`);
                    await Utils.sleep(this.options.delayBetweenCards);
                }
            }

            // Step 4: Create final results
            const standardResult = this.createValidatedListingResult(
                listingUrl,
                listingData,
                processedCards,
                failedCards
            );

            const structuredResult = {
                listing_metadata: {
                    listing_url: listingUrl,
                    scraped_at: new Date().toISOString(),
                    total_cards: structuredCards.length
                },
                cards: structuredCards
            };

            // Add token usage summary
            const tokenTotals = this.aiProcessor.getTokenTotals();
            standardResult.token_summary = tokenTotals;

            console.log(`\n🎉 LISTING CRAWL WITH DUAL JSON OUTPUT COMPLETED!`);
            console.log(`📊 URL Validation Results:`);
            console.log(`   - Total URLs checked: ${listingData.validation_summary?.total_checked || 0}`);
            console.log(`   - Valid URLs: ${listingData.validation_summary?.valid_urls || 0}`);
            console.log(`   - Invalid URLs: ${listingData.validation_summary?.invalid_urls || 0}`);
            console.log(`   - URL Success Rate: ${((listingData.validation_summary?.success_rate || 0) * 100).toFixed(1)}%`);
            console.log(`📈 Processing Results:`);
            console.log(`   - Cards processed: ${processedCards.length}`);
            console.log(`   - Cards failed: ${failedCards.length}`);
            console.log(`   - Processing Success Rate: ${Math.round((processedCards.length / (processedCards.length + failedCards.length)) * 100)}%`);
            console.log(`🔥 Token Usage: ${tokenTotals.totalTokens} total tokens`);
            console.log(`📄 Listing Files: ${standardListingFile}, ${structuredListingFile}`);

            return {
                standard: standardResult,
                structured: structuredResult,
                files: {
                    standard: standardListingFile,
                    structured: structuredListingFile
                }
            };

        } catch (error) {
            console.error('❌ Listing crawl with validation failed:', error.message);
            return this.createErrorListingResult(listingUrl, error.message);
        }
    }

    createValidatedListingResult(listingUrl, listingData, processedCards, failedCards) {
        const totalAttempted = processedCards.length + failedCards.length;
        const successRate = totalAttempted > 0 ? Math.round((processedCards.length / totalAttempted) * 100) / 100 : 0;

        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            url_validation_summary: listingData.validation_summary || {},
            listing_summary: {
                total_urls_found: listingData.original_count || 0,
                valid_urls_after_validation: listingData.total_cards_found || 0,
                invalid_urls_filtered: listingData.filtered_out || 0,
                cards_processed: processedCards.length,
                cards_failed: failedCards.length,
                processing_success_rate: successRate,
                url_validation_success_rate: listingData.validation_summary?.success_rate || 0,
                processing_mode: 'DUAL_JSON_OUTPUT_WITH_URL_VALIDATION'
            },
            cards: processedCards,
            failed_cards: failedCards,
            invalid_urls: listingData.invalid_urls || [],
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl_dual_output',
                validation_enabled: true,
                limits_applied: 'NONE - All valid cards processed',
                average_confidence: this.calculateAverageConfidence(processedCards)
            }
        };
    }

    createEmptyListingResult(listingUrl, listingData) {
        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            url_validation_summary: listingData?.validation_summary || {},
            listing_summary: {
                total_urls_found: listingData?.original_count || 0,
                valid_urls_after_validation: 0,
                invalid_urls_filtered: listingData?.filtered_out || 0,
                cards_processed: 0,
                cards_failed: 0,
                processing_success_rate: 0,
                url_validation_success_rate: listingData?.validation_summary?.success_rate || 0,
                processing_mode: 'DUAL_JSON_OUTPUT_WITH_URL_VALIDATION'
            },
            cards: [],
            failed_cards: [],
            invalid_urls: listingData?.invalid_urls || [],
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl_dual_output',
                validation_enabled: true,
                limits_applied: 'NONE',
                message: 'No valid URLs found after validation'
            }
        };
    }

    calculateAverageConfidence(processedCards) {
        if (processedCards.length === 0) return 0;
        
        const totalConfidence = processedCards.reduce((sum, card) => {
            return sum + (card.metadata?.confidence_score || 0);
        }, 0);
        
        return Math.round((totalConfidence / processedCards.length) * 100) / 100;
    }

    createErrorListingResult(listingUrl, errorMessage) {
        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            url_validation_summary: {},
            listing_summary: {
                total_urls_found: 0,
                valid_urls_after_validation: 0,
                invalid_urls_filtered: 0,
                cards_processed: 0,
                cards_failed: 0,
                processing_success_rate: 0,
                url_validation_success_rate: 0,
                processing_mode: 'ERROR'
            },
            cards: [],
            failed_cards: [],
            invalid_urls: [],
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl_dual_output',
                validation_enabled: true,
                limits_applied: 'NONE',
                error: errorMessage
            }
        };
    }
}

module.exports = ListingCrawler;
