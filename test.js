const { extractCardBenefits, extractSingleCard, extractCardListing } = require('./index');
const Utils = require('./src/utils');
require('dotenv').config();

async function testCrawler() {
    const testUrls = [
        'https://www.hdfcbank.com/personal/pay/cards/credit-cards'
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your-openai-api-key-here') {
        console.error('❌ Please set your OpenAI API key in .env file');
        return;
    }

    for (const url of testUrls) {
        try {
            console.log(`\n${'='.repeat(120)}`);
            console.log(`🎯 Testing SMART DETECTION for: ${url}`);
            console.log(`🔥 Will automatically detect if it's a listing or individual card page`);
            console.log(`${'='.repeat(120)}`);

            const startTime = Date.now();

            // Use smart detection function
            const result = await extractCardBenefits(url, apiKey, {
                maxCardsToProcess: 3, // Limit for testing
                delayBetweenCards: 2000,
                delayBetweenRequests: 1000
            });

            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);

            console.log('\n📊 RESULTS SUMMARY:');
            console.log(`⏱️ Total processing time: ${duration} seconds`);

            if (result.listing_summary) {
                // Listing result
                console.log(`📋 LISTING RESULTS:`);
                console.log(`- Total cards found: ${result.listing_summary.total_cards_found}`);
                console.log(`- Cards processed: ${result.listing_summary.cards_processed}`);
                console.log(`- Cards failed: ${result.listing_summary.cards_failed}`);
                console.log(`- Success rate: ${(result.listing_summary.success_rate * 100).toFixed(1)}%`);
                
                if (result.token_summary) {
                    console.log(`🔥 Token Usage:`);
                    console.log(`- Total Input: ${result.token_summary.totalInputTokens} tokens`);
                    console.log(`- Total Output: ${result.token_summary.totalOutputTokens} tokens`);
                    console.log(`- Grand Total: ${result.token_summary.totalTokens} tokens`);
                }

                // Show sample cards
                if (result.cards.length > 0) {
                    console.log(`\n📋 Sample processed cards:`);
                    result.cards.slice(0, 3).forEach((card, index) => {
                        console.log(`${index + 1}. ${card.card?.name || 'Unknown'} (${card.card?.bank || 'Unknown Bank'})`);
                        console.log(`   - Benefits: ${card.benefits?.length || 0}`);
                        console.log(`   - Offers: ${card.current_offers?.length || 0}`);
                        console.log(`   - Confidence: ${card.metadata?.confidence_score || 0}`);
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

            // Save result to file
            const fs = require('fs');
            const isListing = !!result.listing_summary;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = isListing 
                ? `listing_${timestamp}.json`
                : `${result.card?.bank}_${result.card?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'card'}_${timestamp}.json`;
            
            fs.writeFileSync(filename, JSON.stringify(result, null, 2));
            console.log(`💾 Results saved to ${filename}`);

        } catch (error) {
            console.error(`❌ Test failed for ${url}:`, error.message);
        }

        // Wait between tests
        if (testUrls.indexOf(url) < testUrls.length - 1) {
            console.log('\n⏳ Waiting 10 seconds before next test...');
            await Utils.sleep(10000);
        }
    }
}

// Test specific functions
async function testListingOnly() {
    const listingUrl = 'https://www.hdfcbank.com/personal/pay/cards/credit-cards';
    const apiKey = process.env.OPENAI_API_KEY;
    
    console.log('🏷️ Testing LISTING EXTRACTION ONLY');
    const result = await extractCardListing(listingUrl, apiKey, {
        maxCardsToProcess: 2,
        delayBetweenCards: 3000
    });
    
    console.log('Results:', JSON.stringify(result, null, 2));
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
