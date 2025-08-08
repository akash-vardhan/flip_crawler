const ContentExtractor = require('./contentExtractor');
const LinkProcessor = require('./linkProcessor');
const AIProcessor = require('./aiProcessor');
const Utils = require('./utils');
const config = require('../config/config');

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
   * Main crawling method using Puppeteer
   */
  async crawlCardBenefits(url) {
    try {
      console.log(`🚀 Starting Puppeteer-based comprehensive crawl for: ${url}`);
      console.log(`🔥 Browser window will open for proper link extraction`);
      
      // Step 1: Extract main page content using Puppeteer
      const mainContent = await this.contentExtractor.extractFromUrl(url);
      if (!mainContent.success) {
        throw new Error(`Failed to extract main content: ${mainContent.error}`);
      }
      
      // Step 2: Process all extracted links
      const links = this.linkProcessor.extractLinks(mainContent, url);
      console.log(`🔍 Found ${links.length} relevant links to process`);
      
      const { processedLinks, failedLinks } = await this.linkProcessor.processLinks(links);
      
      // Step 3: Process all content with AI
      console.log('🤖 Processing all content with OpenAI...');
      const extractedData = await this.aiProcessor.processContent(
        mainContent, 
        processedLinks, 
        url
      );
      
      // Step 4: Create final result
      const result = {
        id: Utils.generateId(url),
        url: url,
        scraped_at: new Date().toISOString(),
        ...extractedData
      };
      
      // Add metadata about processing
      result.metadata.failed_links = failedLinks.length;
      result.metadata.failed_link_details = failedLinks;
      
      console.log('✅ Puppeteer crawling completed successfully');
      console.log(`📈 Confidence Score: ${result.metadata?.confidence_score || 0}`);
      console.log(`🔗 Processed ${processedLinks.length} additional pages`);
      console.log(`❌ Failed to process ${failedLinks.length} links`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Puppeteer crawling failed:', error.message);
      return this.createErrorResult(url, error.message);
    }
  }

  createErrorResult(url, errorMessage) {
    return {
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
  }
}

module.exports = CardholderBenefitsCrawler;
