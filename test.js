const { extractCardBenefits, extractSingleCard, extractCardListing } = require('./index');
const Utils = require('./src/utils');
require('dotenv').config();

async function testCrawler() {
    const testUrls = [
        'https://www.hdfcbank.com/personal/pay/cards/credit-cards',
        'https://www.sbicard.com/en/personal/credit-cards.page'
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your-openai-api-key-here') {
        console.error('❌ Please set your OpenAI API key in .env file');
        return;
    }

    for (const url of testUrls) {
        try {
            console.log(`\n${'='.repeat(120)}`);
            console.log(`🎯 Testing SMART DETECTION with URL VALIDATION for: ${url}`);
            console.log(`🔥 NO LIMITS - Will validate all URLs and process ALL accessible cards`);
            console.log(`🧹 Enhanced filtering + URL validation to prevent 404 errors`);
            console.log(`${'='.repeat(120)}`);

            const startTime = Date.now();

            // Use smart detection function with NO LIMITS and URL validation
            const result = await extractCardBenefits(url, apiKey, {
                // NO maxCardsToProcess limit - process ALL valid cards
                delayBetweenCards: 3000, // 3 seconds between cards
                delayBetweenRequests: 1000,
                delayBetweenValidation: 500 // Delay between URL validations
            });

            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);

            console.log('\n📊 RESULTS SUMMARY:');
            console.log(`⏱️ Total processing time: ${duration} seconds (${Math.round(duration/60)} minutes)`);

            if (result.listing_summary) {
                // Listing result with URL validation
                console.log(`📋 LISTING RESULTS WITH URL VALIDATION:`);
                console.log(`- Total URLs found initially: ${result.listing_summary.total_urls_found}`);
                console.log(`- Valid URLs after validation: ${result.listing_summary.valid_urls_after_validation}`);
                console.log(`- Invalid URLs filtered out: ${result.listing_summary.invalid_urls_filtered}`);
                console.log(`- URL validation success rate: ${(result.listing_summary.url_validation_success_rate * 100).toFixed(1)}%`);
                console.log(`- Cards successfully processed: ${result.listing_summary.cards_processed}`);
                console.log(`- Cards failed processing: ${result.listing_summary.cards_failed}`);
                console.log(`- Processing success rate: ${(result.listing_summary.processing_success_rate * 100).toFixed(1)}%`);
                console.log(`- Average confidence: ${result.metadata?.average_confidence || 0}`);
                console.log(`- Processing mode: ${result.listing_summary.processing_mode}`);
                
                // Show URL validation breakdown
                if (result.url_validation_summary) {
                    console.log(`🔗 URL Validation Breakdown:`);
                    console.log(`- Total checked: ${result.url_validation_summary.total_checked}`);
                    console.log(`- Valid: ${result.url_validation_summary.valid_urls}`);
                    console.log(`- Invalid: ${result.url_validation_summary.invalid_urls}`);
                }

                // Show invalid URL types if any
                if (result.invalid_urls && result.invalid_urls.length > 0) {
                    console.log(`\n❌ Invalid URLs Found (${result.invalid_urls.length}):`);
                    const errorTypes = {};
                    result.invalid_urls.forEach(url => {
                        const type = url.error_type || 'UNKNOWN';
                        errorTypes[type] = (errorTypes[type] || 0) + 1;
                    });
                    Object.entries(errorTypes).forEach(([type, count]) => {
                        console.log(`   - ${type}: ${count} URLs`);
                    });
                }
                
                if (result.token_summary) {
                    console.log(`🔥 Token Usage:`);
                    console.log(`- Total Input: ${result.token_summary.totalInputTokens} tokens`);
                    console.log(`- Total Output: ${result.token_summary.totalOutputTokens} tokens`);
                    console.log(`- Grand Total: ${result.token_summary.totalTokens} tokens`);
                    console.log(`- Estimated cost: $${((result.token_summary.totalTokens / 1000) * 0.002).toFixed(4)}`);
                }

                // Show all processed cards
                if (result.cards.length > 0) {
                    console.log(`\n📋 ALL Processed Cards (${result.cards.length}):`);
                    result.cards.forEach((card, index) => {
                        const validationInfo = card.listing_info?.url_validation;
                        console.log(`${index + 1}. ${card.card?.name || 'Unknown'} (${card.card?.bank || 'Unknown Bank'})`);
                        console.log(`   - URL Status: ${validationInfo?.status} (${validationInfo?.response_code})`);
                        console.log(`   - Benefits: ${card.benefits?.length || 0}`);
                        console.log(`   - Offers: ${card.current_offers?.length || 0}`);
                        console.log(`   - Perks: ${card.perks?.length || 0}`);
                        console.log(`   - Confidence: ${card.metadata?.confidence_score || 0}`);
                    });
                }

                // Show failed cards if any
                if (result.failed_cards.length > 0) {
                    console.log(`\n❌ Failed Cards (${result.failed_cards.length}):`);
                    result.failed_cards.forEach((card, index) => {
                        console.log(`${index + 1}. ${card.name} - Error: ${card.processing_error || card.error}`);
                    });
                }
            } else {
                // Individual card result
                console.log(`🎯 INDIVIDUAL CARD RESULTS:`);
                console.log(`- Card: ${result.card?.name || 'Not found'}`);
                console.log(`- Bank: ${result.card?.bank || 'Not found'}`);
                console.log(`- Benefits: ${result.benefits?.length || 0}`);
                console.log(`- Current Offers: ${result.current_offers?.length || 0}`);
                console.log(`- Perks: ${result.perks?.length || 0}`);
                console.log(`- Partnerships: ${result.partnerships?.length || 0}`);
                console.log(`- Confidence: ${result.metadata?.confidence_score || 0}`);
                console.log(`- Links Processed: ${result.metadata?.processed_links || 0}`);

                if (result.metadata?.token_usage) {
                    console.log(`🔥 Token Usage:`);
                    console.log(`- Input: ${result.metadata.token_usage.input_tokens} tokens`);
                    console.log(`- Output: ${result.metadata.token_usage.output_tokens} tokens`);
                    console.log(`- Total: ${result.metadata.token_usage.total_tokens} tokens`);
                }
            }


        } catch (error) {
            console.error(`❌ Test failed for ${url}:`, error.message);
        }

        // Wait between tests
        if (testUrls.indexOf(url) < testUrls.length - 1) {
            console.log('\n⏳ Waiting 15 seconds before next test...');
            await Utils.sleep(15000);
        }
    }
}

// Test specific functions
async function testListingOnly() {
    const listingUrl = 'https://www.hdfcbank.com/personal/pay/cards/credit-cards';
    const apiKey = process.env.OPENAI_API_KEY;
    
    console.log('🏷️ Testing LISTING EXTRACTION WITH URL VALIDATION (NO LIMITS)');
    console.log('🧹 Enhanced filtering + URL validation to prevent 404 errors');
    
    const result = await extractCardListing(listingUrl, apiKey, {
        // No maxCardsToProcess - will process ALL valid cards
        delayBetweenCards: 4000,
        delayBetweenValidation: 500
    });
    
    console.log('📊 URL Validation Results:');
    console.log(`- Total URLs found: ${result.listing_summary?.total_urls_found}`);
    console.log(`- Valid URLs: ${result.listing_summary?.valid_urls_after_validation}`);
    console.log(`- Invalid URLs filtered: ${result.listing_summary?.invalid_urls_filtered}`);
    console.log(`- Validation success rate: ${(result.listing_summary?.url_validation_success_rate * 100).toFixed(1)}%`);
    
    const fs = require('fs');
    fs.writeFileSync('listing_test_validated.json', JSON.stringify(result, null, 2));
    console.log('💾 Results saved to listing_test_validated.json');
}

async function testSingleOnly() {
    const cardUrl = 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/pixel-play-credit-card';
    const apiKey = process.env.OPENAI_API_KEY;
    
    console.log('🎯 Testing SINGLE CARD EXTRACTION ONLY');
    const result = await extractSingleCard(cardUrl, apiKey);
    
    console.log('Results:', JSON.stringify(result, null, 2));
}

if (require.main === module) {
    const testType = process.argv[2];
    
    switch (testType) {
        case '--listing':
            testListingOnly().catch(console.error);
            break;
        case '--single':
            testSingleOnly().catch(console.error);
            break;
        default:
            testCrawler().catch(console.error);
    }
}
