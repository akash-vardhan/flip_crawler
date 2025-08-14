const fs                = require('fs');
const path              = require('path');
const { URL }           = require('url');
const ContentExtractor  = require('./contentExtractor');
const AIProcessor       = require('./aiProcessor');
const CardCrawler       = require('./crawler');
const Utils             = require('./utils');

class ListingCrawler {
  constructor (openaiKey, options = {}) {
    this.contentExtractor = new ContentExtractor();
    this.aiProcessor      = new AIProcessor(openaiKey);
    this.cardCrawler      = new CardCrawler(openaiKey, options);
    this.options = {
      delayBetweenCards     : options.delayBetweenCards     || 5_000,
      delayBetweenValidation: options.delayBetweenValidation||   500,
      ...options
    };

    /* output directory */
    this.outputDir = path.join(process.cwd(), 'json_results');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /* ------------------------------------------------------ */
  async crawlCardListing (listingUrl) {
    try {
      console.log(`\n=== LISTING CRAWL : ${listingUrl} ===`);

      /* 1 — pull listing page */
      const listingContent = await this.contentExtractor.extractFromUrl(listingUrl);
      if (!listingContent.success) {
        throw new Error(`Listing extraction failed: ${listingContent.error}`);
      }

      /* 2 — let GPT find / validate card urls  */
      const listingData = await this.aiProcessor.extractCardUrls(listingContent, listingUrl);
      if (!listingData.cards?.length) {
        return this.emptyListingResult(listingUrl, listingData);
      }

      /* 3 — iterate over validated card urls   */
      const processedCards = [];
      const failedCards    = [];

      for (let i = 0; i < listingData.cards.length; i++) {
        const cardMeta = listingData.cards[i];
        console.log(`\n[${i + 1}/${listingData.cards.length}] → ${cardMeta.name}`);

        try {
          const cardRes = await this.cardCrawler.crawlCardBenefits(cardMeta.url);

          /* skip in-complete results */
          if (!cardRes.valid) {
            console.warn(`⏩  Skipping – incomplete data for ${cardMeta.url}`);
            failedCards.push({ ...cardMeta, reason: 'incomplete_data' });
          } else {
            /* attach origin-meta & push */
            cardRes.standard.listing_info = {
              extracted_from: listingUrl,
              url_validation: {
                status       : cardMeta.validation_status,
                response_code: cardMeta.response_code
              }
            };
            processedCards.push(cardRes.standard);
          }

        } catch (err) {
          console.error('❌  Card processing failed:', err.message);
          failedCards.push({ ...cardMeta, error: err.message });
        }

        /* polite delay between cards  */
        if (i < listingData.cards.length - 1) {
          await Utils.sleep(this.options.delayBetweenCards);
        }
      }

      /* 4 — build listing-summary object  */
      const summary = this.buildListingSummary(listingUrl, listingData, processedCards, failedCards);

      /* 5 — persist listing-level json      */
      const ts        = new Date().toISOString().replace(/[:.]/g, '-');
      const hostSlug  = new URL(listingUrl).hostname.replace(/\./g, '_');
      const stdFile   = `${hostSlug}_listing_standard_${ts}.json`;
      const outPath   = path.join(this.outputDir, stdFile);

      fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
      console.log(`\n💾  Listing summary saved → json_results/${stdFile}`);

      return summary;

    } catch (err) {
      console.error('❌  Listing crawl failed:', err.message);
      return this.errorListingResult(listingUrl, err.message);
    }
  }

  /* ------------------------------------------------------ */
  buildListingSummary (listingUrl, gptListingData, okCards, failed) {
    const attempted = okCards.length + failed.length;
    return {
      id           : Utils.generateId(listingUrl),
      listing_url  : listingUrl,
      scraped_at   : new Date().toISOString(),
      url_validation_summary : gptListingData.validation_summary || {},
      listing_summary        : {
        total_urls_found       : gptListingData.original_count || 0,
        valid_urls_after_validation: gptListingData.total_cards_found,
        cards_processed        : okCards.length,
        cards_failed           : failed.length,
        processing_success_rate: attempted ? +(okCards.length / attempted).toFixed(2) : 0
      },
      cards        : okCards,
      failed_cards : failed,
      metadata     : { last_updated: new Date().toISOString() }
    };
  }

  /* ------------------------------------------------------ */
  emptyListingResult (url, gptData) {
    return {
      id          : Utils.generateId(url),
      listing_url : url,
      scraped_at  : new Date().toISOString(),
      url_validation_summary: gptData.validation_summary || {},
      listing_summary: {
        total_urls_found : gptData.original_count || 0,
        valid_urls_after_validation: 0,
        cards_processed  : 0,
        cards_failed     : 0,
        processing_success_rate: 0
      },
      cards        : [],
      failed_cards : [],
      metadata     : { last_updated: new Date().toISOString(), message: 'no valid card urls' }
    };
  }

  errorListingResult (url, msg) {
    return {
      id          : Utils.generateId(url),
      listing_url : url,
      scraped_at  : new Date().toISOString(),
      listing_summary: {},
      cards        : [],
      failed_cards : [],
      metadata     : { last_updated: new Date().toISOString(), error: msg }
    };
  }
}

module.exports = ListingCrawler;
