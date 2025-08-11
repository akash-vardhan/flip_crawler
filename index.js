const CardholderBenefitsCrawler = require('./src/crawler');
const ListingCrawler = require('./src/listingCrawler');
const Utils = require('./src/utils');

/**
 * Smart function that detects if URL is a listing or individual card page
 */
async function extractCardBenefits(url, openaiApiKey, options = {}) {
    const isListingPage = detectListingPage(url, options.forceListingMode || false);
    
    if (isListingPage) {
        console.log(`🏷️ Detected as LISTING page - will extract all cards`);
        const listingCrawler = new ListingCrawler(openaiApiKey, options);
        return await listingCrawler.crawlCardListing(url);
    } else {
        console.log(`🎯 Detected as INDIVIDUAL card page - will extract single card`);
        const crawler = new CardholderBenefitsCrawler(openaiApiKey, options);
        return await crawler.crawlCardBenefits(url);
    }
}

/**
 * Extract from individual card page (original functionality)
 */
async function extractSingleCard(url, openaiApiKey, options = {}) {
    const crawler = new CardholderBenefitsCrawler(openaiApiKey, options);
    return await crawler.crawlCardBenefits(url);
}

/**
 * Extract from listing page (new functionality)
 */
async function extractCardListing(url, openaiApiKey, options = {}) {
    const listingCrawler = new ListingCrawler(openaiApiKey, options);
    return await listingCrawler.crawlCardListing(url);
}

/**
 * Detect if URL is a listing page or individual card page
 */
function detectListingPage(url, forceListingMode = false) {
    if (forceListingMode) return true;

    const urlLower = url.toLowerCase();
    
    // Listing page indicators
    const listingIndicators = [
        'credit-cards',      // Generic credit cards page
        'cards/credit-cards', // HDFC pattern
        '/cards/',           // Generic cards section
        'all-credit-cards',  // All cards page
        'compare-cards',     // Comparison page
        'card-listing',      // Direct listing
        'credit-card-offers' // Offers page
    ];

    // Individual card indicators (these override listing detection)
    const individualIndicators = [
        'pixel-play-credit-card',    // Specific card names
        'regalia-credit-card',
        'millennia-credit-card',
        'diners-club',
        'times-credit-card',
        'freedom-credit-card'
    ];

    // Check for individual card indicators first
    const isIndividualCard = individualIndicators.some(indicator => 
        urlLower.includes(indicator)
    );

    if (isIndividualCard) {
        return false; // Individual card page
    }

    // Check for listing indicators
    const isListingPage = listingIndicators.some(indicator => 
        urlLower.includes(indicator)
    );

    return isListingPage;
}

module.exports = {
    extractCardBenefits,      // Smart detection function
    extractSingleCard,       // Explicit single card extraction
    extractCardListing,      // Explicit listing extraction
    detectListingPage        // Utility function
};

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node index.js <url> <openai-api-key> [--listing] [--single]');
        console.log('Options:');
        console.log('  --listing  Force listing mode');
        console.log('  --single   Force single card mode');
        process.exit(1);
    }

    const url = args[0];
    const apiKey = args[1];
    const forceListingMode = args.includes('--listing');
    const forceSingleMode = args.includes('--single');

    let extractFunction;
    if (forceListingMode) {
        extractFunction = () => extractCardListing(url, apiKey);
    } else if (forceSingleMode) {
        extractFunction = () => extractSingleCard(url, apiKey);
    } else {
        extractFunction = () => extractCardBenefits(url, apiKey, { forceListingMode: false });
    }

    extractFunction()
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}
