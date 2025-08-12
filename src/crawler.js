const ContentExtractor = require('./contentExtractor');
const LinkProcessor = require('./linkProcessor');
const AIProcessor = require('./aiProcessor');
const Utils = require('./utils');
const config = require('../config/config');
const fs = require('fs');

class CardholderBenefitsCrawler {
    constructor(openaiApiKey, options = {}) {
        this.contentExtractor = new ContentExtractor();
        this.linkProcessor = new LinkProcessor({
            maxLinks: options.maxLinks || 0,
            delayBetweenRequests: options.delayBetweenRequests || 2000
        });
        this.aiProcessor = new AIProcessor(openaiApiKey);
        this.options = options;
    }

    /**
     * Main crawling method with dual JSON output - INDIVIDUAL CARDS ONLY
     */
    async crawlCardBenefits(url) {
        try {
            console.log(`🚀 Starting comprehensive crawl for: ${url}`);
            console.log(`🔥 Will generate both standard and structured JSON formats`);

            // Step 1: Extract main page content
            const mainContent = await this.contentExtractor.extractFromUrl(url);
            if (!mainContent.success) {
                throw new Error(`Failed to extract main content: ${mainContent.error}`);
            }

            // Step 2: Process all extracted links
            const links = this.linkProcessor.extractLinks(mainContent, url);
            console.log(`🔍 Found ${links.length} relevant links to process`);
            const { processedLinks, failedLinks } = await this.linkProcessor.processLinks(links);

            // Step 3: Process all content with AI (returns both formats)
            console.log('🤖 Processing all content with OpenAI...');
            const { standardJson, structuredJson } = await this.aiProcessor.processContent(
                mainContent,
                processedLinks,
                url
            );

            // Step 4: Create final results
            const standardResult = {
                id: Utils.generateId(url),
                url: url,
                scraped_at: new Date().toISOString(),
                ...standardJson
            };

            standardResult.metadata.failed_links = failedLinks.length;
            standardResult.metadata.failed_link_details = failedLinks;

            // Step 5: Save both JSON files for individual card
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const cardName = standardJson.card?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'card';
            const bankName = standardJson.card?.bank?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bank';

            const standardFilename = `${bankName}_${cardName}_standard_${timestamp}.json`;
            const structuredFilename = `${bankName}_${cardName}_structured_${timestamp}.json`;

            // Save standard format
            fs.writeFileSync(standardFilename, JSON.stringify(standardResult, null, 2));
            console.log(`💾 Standard JSON saved to: ${standardFilename}`);

            // Save structured format
            fs.writeFileSync(structuredFilename, JSON.stringify(structuredJson, null, 2));
            console.log(`💾 Structured JSON saved to: ${structuredFilename}`);

            console.log('✅ Crawling completed successfully');
            console.log(`📈 Confidence Score: ${standardResult.metadata?.confidence_score || 0}`);
            console.log(`🔗 Processed ${processedLinks.length} additional pages`);
            console.log(`❌ Failed to process ${failedLinks.length} links`);

            return {
                standard: standardResult,
                structured: structuredJson,
                files: {
                    standard: standardFilename,
                    structured: structuredFilename
                }
            };

        } catch (error) {
            console.error('❌ Crawling failed:', error.message);
            return this.createErrorResult(url, error.message);
        }
    }

    createErrorResult(url, errorMessage) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const errorResult = {
            id: Utils.generateId(url),
            url: url,
            scraped_at: new Date().toISOString(),
            card: { name: null, bank: null, variant: null },
            rewards: { program: null, type: null, earning: { base_rate: null, categories: [] }, redemption: [] },
            benefits: [],
            current_offers: [],
            perks: [],
            partnerships: [],
            metadata: {
                last_updated: new Date().toISOString(),
                confidence_score: 0,
                missing_data: ["error_occurred"],
                processed_links: 0,
                failed_links: 0,
                error: errorMessage
            }
        };

        // Save error result
        const errorFilename = `error_${timestamp}.json`;
        fs.writeFileSync(errorFilename, JSON.stringify(errorResult, null, 2));
        console.log(`💾 Error result saved to: ${errorFilename}`);

        return {
            standard: errorResult,
            structured: this.aiProcessor.createFallbackStructuredFormat(url),
            files: {
                standard: errorFilename,
                structured: null
            }
        };
    }
}

module.exports = CardholderBenefitsCrawler;
