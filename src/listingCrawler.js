const ContentExtractor = require('./contentExtractor');
const AIProcessor = require('./aiProcessor');
const CardholderBenefitsCrawler = require('./crawler');
const Utils = require('./utils');
const { URL } = require('url');

class ListingCrawler {
    constructor(openaiApiKey, options = {}) {
        this.contentExtractor = new ContentExtractor();
        this.aiProcessor = new AIProcessor(openaiApiKey);
        this.cardCrawler = new CardholderBenefitsCrawler(openaiApiKey, options);
        this.options = {
            // Remove all limits by default
            maxCardsToProcess: 0, // 0 = no limit (process ALL cards)
            delayBetweenCards: options.delayBetweenCards || 5000,
            skipExistingCards: options.skipExistingCards || false,
            ...options
        };
    }

    /**
     * Main method to crawl listing page and extract all cards
     */
    async crawlCardListing(listingUrl) {
        try {
            console.log(`🚀 Starting listing page crawl: ${listingUrl}`);
            console.log(`🔥 Will extract ALL individual card URLs and process EVERY card (no limits)`);

            // Step 1: Extract listing page content
            const listingContent = await this.contentExtractor.extractFromUrl(listingUrl);
            if (!listingContent.success) {
                throw new Error(`Failed to extract listing content: ${listingContent.error}`);
            }

            console.log(`✅ Successfully extracted listing page content`);

            // Step 2: Use AI to extract card URLs from listing with improved filtering
            const listingData = await this.aiProcessor.extractCardUrls(listingContent, listingUrl);
            
            if (!listingData.cards || listingData.cards.length === 0) {
                console.log(`⚠️ No valid credit cards found in listing page after filtering`);
                return this.createEmptyListingResult(listingUrl);
            }

            console.log(`🎯 Found ${listingData.cards.length} VALID credit cards after filtering`);
            if (listingData.filtered_out > 0) {
                console.log(`🗑️ Filtered out ${listingData.filtered_out} non-credit card links`);
            }

            // Step 3: Process ALL cards (no limits)
            const processedCards = [];
            const failedCards = [];
            let processCount = 0;

            // Process ALL cards found (no maxCardsToProcess limit)
            const cardsToProcess = listingData.cards;

            console.log(`📋 Processing ALL ${cardsToProcess.length} cards (no limits applied)...`);

            for (let i = 0; i < cardsToProcess.length; i++) {
                const cardInfo = cardsToProcess[i];
                
                try {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log(`🔍 Processing card ${i + 1}/${cardsToProcess.length}: ${cardInfo.name}`);
                    console.log(`🌐 URL: ${cardInfo.url}`);
                    console.log(`📂 Category: ${cardInfo.category}`);
                    console.log(`${'='.repeat(80)}`);

                    // Validate URL
                    if (!this.isValidCardUrl(cardInfo.url)) {
                        console.log(`❌ Invalid URL, skipping: ${cardInfo.url}`);
                        failedCards.push({
                            ...cardInfo,
                            error: 'Invalid URL format'
                        });
                        continue;
                    }

                    // Process individual card
                    const cardData = await this.cardCrawler.crawlCardBenefits(cardInfo.url);
                    
                    // Enhance with listing information
                    cardData.listing_info = {
                        extracted_from: listingUrl,
                        listing_name: cardInfo.name,
                        listing_description: cardInfo.description,
                        listing_category: cardInfo.category,
                        listing_features: cardInfo.key_features,
                        annual_fee_mentioned: cardInfo.annual_fee,
                        processing_order: i + 1,
                        total_in_listing: cardsToProcess.length
                    };

                    processedCards.push(cardData);
                    processCount++;

                    console.log(`✅ Successfully processed: ${cardInfo.name}`);
                    console.log(`📊 Confidence: ${cardData.metadata?.confidence_score || 0}`);
                    console.log(`🎁 Benefits: ${cardData.benefits?.length || 0}, Offers: ${cardData.current_offers?.length || 0}`);

                } catch (error) {
                    console.error(`❌ Failed to process card: ${cardInfo.name} - ${error.message}`);
                    failedCards.push({
                        ...cardInfo,
                        error: error.message,
                        processing_order: i + 1
                    });
                }

                // Progress update every 3 cards or at the end
                if ((i + 1) % 3 === 0 || i === cardsToProcess.length - 1) {
                    const progressPercent = Math.round(((i + 1) / cardsToProcess.length) * 100);
                    console.log(`\n📈 Progress: ${i + 1}/${cardsToProcess.length} (${progressPercent}%) - ${processCount} successful, ${failedCards.length} failed`);
                }

                // Delay between cards to be respectful to the server
                if (i < cardsToProcess.length - 1) {
                    console.log(`⏳ Waiting ${this.options.delayBetweenCards}ms before next card...`);
                    await Utils.sleep(this.options.delayBetweenCards);
                }
            }

            // Step 4: Create final result
            const result = this.createListingResult(
                listingUrl,
                listingData,
                processedCards,
                failedCards
            );

            // Add token usage summary
            const tokenTotals = this.aiProcessor.getTokenTotals();
            result.token_summary = tokenTotals;

            // Add filtering summary
            result.filtering_summary = {
                original_links_found: listingData.original_count || listingData.cards.length,
                after_filtering: listingData.cards.length,
                filtered_out_count: listingData.filtered_out || 0,
                filter_efficiency: listingData.filtered_out > 0 ? 
                    Math.round((listingData.filtered_out / listingData.original_count) * 100) : 0
            };

            console.log(`\n🎉 LISTING CRAWL COMPLETED!`);
            console.log(`📊 Original links found: ${listingData.original_count || listingData.cards.length}`);
            console.log(`🎯 Valid credit cards after filtering: ${listingData.cards.length}`);
            console.log(`🗑️ Non-relevant links filtered out: ${listingData.filtered_out || 0}`);
            console.log(`✅ Successfully processed: ${processedCards.length}`);
            console.log(`❌ Failed: ${failedCards.length}`);
            console.log(`📈 Success rate: ${Math.round((processedCards.length / (processedCards.length + failedCards.length)) * 100)}%`);
            console.log(`🔥 Token Usage Summary:`);
            console.log(`   Total Input: ${tokenTotals.totalInputTokens} tokens`);
            console.log(`   Total Output: ${tokenTotals.totalOutputTokens} tokens`);
            console.log(`   Grand Total: ${tokenTotals.totalTokens} tokens`);

            return result;

        } catch (error) {
            console.error('❌ Listing crawl failed:', error.message);
            return this.createErrorListingResult(listingUrl, error.message);
        }
    }

    /**
     * Enhanced URL validation with better filtering
     */
    isValidCardUrl(url) {
        try {
            const parsedUrl = new URL(url);
            const urlLower = url.toLowerCase();
            
            // Must be HTTP/HTTPS
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return false;
            }

            // Must contain credit card related paths
            const validPaths = [
                '/credit-card',
                '/creditcard',
                '/cards/credit',
                '/personal/pay/cards'
            ];

            const hasValidPath = validPaths.some(path => urlLower.includes(path));
            
            // Or must contain specific card names
            const cardNames = [
                'regalia', 'millennia', 'freedom', 'diners', 'times',
                'pixel', 'moneyback', 'indianoil', 'platinum', 'gold'
            ];

            const hasCardName = cardNames.some(name => urlLower.includes(name));

            return hasValidPath || hasCardName;

        } catch (e) {
            return false;
        }
    }

    /**
     * Create final listing result with enhanced metadata
     */
    createListingResult(listingUrl, listingData, processedCards, failedCards) {
        const totalAttempted = processedCards.length + failedCards.length;
        const successRate = totalAttempted > 0 ? Math.round((processedCards.length / totalAttempted) * 100) / 100 : 0;

        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            listing_summary: {
                total_cards_found: listingData.total_cards_found || listingData.cards.length,
                cards_processed: processedCards.length,
                cards_failed: failedCards.length,
                success_rate: successRate,
                processing_mode: 'NO_LIMITS - All cards processed'
            },
            cards: processedCards,
            failed_cards: failedCards,
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl',
                limits_applied: 'NONE - All found cards were processed',
                average_confidence: this.calculateAverageConfidence(processedCards)
            }
        };
    }

    /**
     * Calculate average confidence across all processed cards
     */
    calculateAverageConfidence(processedCards) {
        if (processedCards.length === 0) return 0;
        
        const totalConfidence = processedCards.reduce((sum, card) => {
            return sum + (card.metadata?.confidence_score || 0);
        }, 0);
        
        return Math.round((totalConfidence / processedCards.length) * 100) / 100;
    }

    /**
     * Create empty listing result
     */
    createEmptyListingResult(listingUrl) {
        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            listing_summary: {
                total_cards_found: 0,
                cards_processed: 0,
                cards_failed: 0,
                success_rate: 0,
                processing_mode: 'NO_LIMITS - No valid cards found'
            },
            cards: [],
            failed_cards: [],
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl',
                message: 'No valid credit cards found after filtering',
                limits_applied: 'NONE'
            }
        };
    }

    /**
     * Create error listing result
     */
    createErrorListingResult(listingUrl, errorMessage) {
        return {
            id: Utils.generateId(listingUrl),
            listing_url: listingUrl,
            scraped_at: new Date().toISOString(),
            listing_summary: {
                total_cards_found: 0,
                cards_processed: 0,
                cards_failed: 0,
                success_rate: 0,
                processing_mode: 'ERROR - Processing failed'
            },
            cards: [],
            failed_cards: [],
            metadata: {
                last_updated: new Date().toISOString(),
                processing_type: 'listing_crawl',
                error: errorMessage,
                limits_applied: 'NONE'
            }
        };
    }
}

module.exports = ListingCrawler;
