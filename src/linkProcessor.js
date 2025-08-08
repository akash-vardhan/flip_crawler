const axios = require('axios');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const Utils = require('./utils');
const { URL } = require('url');

class LinkProcessor {
  constructor(config = {}) {
    this.maxLinks = config.maxLinks || 0; // 0 = no limit
    this.delayBetweenRequests = config.delayBetweenRequests || 2000;
    this.processedUrls = new Set();
  }

  /**
   * Extract links from Puppeteer result
   */
  extractLinks(puppeteerContent, baseUrl) {
    const links = [];
    const seenUrls = new Set();
    
    console.log(`🔍 Processing ${puppeteerContent.links.length} links from Puppeteer extraction...`);
    
    puppeteerContent.links.forEach(link => {
      const { href, text, title, fullUrl } = link;
      
      if (this.isRelevantLink(text, href, baseUrl)) {
        const finalUrl = fullUrl || href;
        
        if (!seenUrls.has(finalUrl)) {
          seenUrls.add(finalUrl);
          links.push({
            url: finalUrl,
            text: text.substring(0, 150),
            title: title,
            originalHref: href,
            type: this.classifyLink(href, text)
          });
        }
      }
    });
    
    console.log(`📊 Found ${links.length} relevant links to process`);
    return this.prioritizeLinks(links);
  }

  /**
   * Helper method to get domain from URL
   */
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return null;
    }
  }

  /**
   * Much more restrictive link relevance check with PDF priority
   */
  isRelevantLink(text, href, baseUrl) {
    const textLower = text.toLowerCase();
    const hrefLower = href.toLowerCase();
    
    // PRIORITY 1: Always include PDFs - check multiple indicators
    const pdfIndicators = [
      hrefLower.includes('.pdf'),
      hrefLower.includes('/repositories/'),
      hrefLower.includes('?path='),
      textLower.includes('pdf'),
      textLower.includes('terms') && textLower.includes('condition'),
      textLower.includes('click here') && (textLower.includes('terms') || textLower.includes('condition') || textLower.includes('faq')),
      textLower.includes('detailed terms'),
      textLower.includes('t&c'),
      textLower.includes('tnc')
    ];
    
    if (pdfIndicators.some(indicator => indicator)) {
      console.log(`📄 PDF link found: "${text}" -> ${href}`);
      return true;
    }
    
    // STRICT irrelevant patterns - expanded to catch more noise
    const irrelevantPatterns = [
      // Navigation & Generic Pages
      /^home$/i, /^contact$/i, /^about$/i, /^privacy/i, /^sitemap$/i,
      /^help$/i, /^support$/i, /^customer/i, /^faq$/i,
      
      // Banking Generic Services (not card-specific)
      /netbanking/i, /net.?banking/i, /online.?banking/i, /digital.?banking/i,
      /business.?banking/i, /sme/i, /corporate/i, /wealth/i,
      /loan(?!.*card)/i, /deposit/i, /investment/i, /mutual.?fund/i,
      /insurance(?!.*card)/i, /life.?insurance/i, /health.?insurance/i,
      /vehicle.?insurance/i, /travel.?insurance/i, /cyber.?insurance/i,
      /personal.?accident/i, /mediclaim/i, /critical.?illness/i,
      
      // Generic Bill Payments & Services
      /bill.?payment/i, /premium.?payment/i, /utility/i, /electricity/i,
      /gas.?bill/i, /water.?bill/i, /mobile.?recharge/i, /dth/i,
      /broadband/i, /landline/i, /donation/i, /religious/i,
      
      // Login & Account Management
      /login/i, /sign.?in/i, /sign.?up/i, /register/i, /forgot.?password/i,
      /reset.?password/i, /otp/i, /verify/i, /activate/i, /enroll/i,
      
      // Security & Generic Banking Features  
      /netsafe/i, /verified.?by.?visa/i, /mastercard.?securecode/i,
      /3d.?secure/i, /fraud/i, /security(?!.*card)/i, /alert/i,
      /statement(?!.*card)/i, /passbook/i, /cheque/i, /dd/i,
      
      // Generic Learning & Resources
      /learning.?centre/i, /education/i, /tutorial/i, /guide(?!.*card)/i,
      /calculator/i, /emi.?calculator/i, /loan.?calculator/i,
      /blog(?!.*card)/i, /news/i, /press/i, /media/i,
      
      // Social Media & External
      /facebook\.com/i, /twitter\.com/i, /instagram\.com/i, 
      /linkedin\.com/i, /youtube\.com/i, /whatsapp/i, /telegram/i,
      
      // Career & Corporate
      /career/i, /job/i, /investor/i, /csr/i, /sustainability/i,
      
      // Prepaid cards (not credit cards)
      /prepaid(?!.*credit)/i, /gift.?card/i, /forex.?card/i,
      
      // Generic financial planning
      /financial.?planning/i, /retirement/i, /pension/i, /tax/i,
      /goal.?planning/i, /save.?money/i, /emergency.?fund/i,
      
      // Mobile apps (not card-specific)
      /mobile.?app(?!.*card)/i, /download.?app/i, /app.?store/i, /play.?store/i
    ];
    
    // Quick rejection for clearly irrelevant content (but PDFs were already allowed above)
    if (irrelevantPatterns.some(pattern => pattern.test(textLower) || pattern.test(hrefLower))) {
      return false;
    }
    
    // STRICT relevant patterns - only highly relevant card content
    const strictRelevantPatterns = [
      // Card-specific content
      /credit.?card/i, /pixel/i, /card.?benefit/i, /card.?offer/i, /card.?reward/i,
      /card.?perk/i, /card.?feature/i, /card.?advantage/i, /cardholder/i,
      
      // Rewards & Benefits
      /cashback/i, /cash.?back/i, /reward.?point/i, /redeem/i, /earn.?point/i,
      /loyalty/i, /milestone/i, /accelerated/i, /bonus.?point/i,
      
      // Offers & Deals
      /offer/i, /deal/i, /discount/i, /saving/i, /promo/i, /campaign/i,
      /flat.*%/i, /\d+%.*off/i, /\d+%.*cashback/i, /\d+x.*point/i,
      
      // Partnerships & Merchants
      /partner/i, /merchant/i, /smartbuy/i, /smart.?buy/i,
      /dining/i, /restaurant/i, /food/i, /travel/i, /hotel/i, /flight/i,
      /shopping/i, /fashion/i, /grocery/i, /fuel/i, /petrol/i, /gas.?station/i,
      /entertainment/i, /movie/i, /bookmyshow/i, /zomato/i, /swiggy/i,
      /makemytrip/i, /uber/i, /ola/i, /amazon/i, /flipkart/i,
      /myntra/i, /nykaa/i, /croma/i, /reliance/i,
      
      // Card Management & Digital Features
      /payzapp/i, /pay.?zapp/i, /my.?card/i, /card.?control/i,
      /emi/i, /installment/i, /pay.?in.?part/i, /convert.?to.?emi/i,
      /contactless/i, /tap.?pay/i, /scan.?pay/i, /upi.*card/i,
      
      // Terms & Documentation (card-specific)
      /terms.*card/i, /condition.*card/i, /fee.*card/i, /charge.*card/i,
      /eligibility.*card/i, /apply.*card/i,
      
      // PDFs and Documents
      /\.pdf/i, /document.*card/i, /brochure.*card/i, /guide.*card/i,
      
      // Specific offer text patterns
      /click.*here.*card/i, /know.*more.*card/i, /learn.*more.*card/i,
      /detail.*card/i, /feature.*card/i, /benefit.*card/i
    ];
    
    const isStrictlyRelevant = strictRelevantPatterns.some(pattern => 
      pattern.test(textLower) || pattern.test(hrefLower)
    );
    
    // Only allow if strictly relevant
    if (!isStrictlyRelevant) {
      return false;
    }
    
    // Domain filtering - only same domain, known financial domains, or PDFs
    const sameDomain = this.getDomain(href) === this.getDomain(baseUrl);
    const isPdf = hrefLower.includes('.pdf') || hrefLower.includes('repositories');
    const knownCardDomains = [
      'hdfcbank.com', 'smartbuy.hdfcbank.com', 'offers.hdfcbank.com',
      'mycards.hdfcbank.com', 'pixel.hdfcbank.com'
    ];
    const isCardDomain = knownCardDomains.some(domain => hrefLower.includes(domain));
    
    return sameDomain || isPdf || isCardDomain;
  }

  /**
   * Enhanced classification with better PDF detection
   */
  classifyLink(href, text) {
    const hrefLower = href.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Enhanced PDF detection
    const pdfIndicators = [
      hrefLower.includes('.pdf'),
      hrefLower.includes('/repositories/'),
      hrefLower.includes('?path='),
      textLower.includes('pdf'),
      (textLower.includes('click here') || textLower.includes('click')) && 
      (textLower.includes('terms') || textLower.includes('condition') || textLower.includes('faq')),
      textLower.includes('detailed terms'),
      textLower.includes('t&c'),
      textLower.includes('tnc')
    ];
    
    if (pdfIndicators.some(indicator => indicator)) {
      console.log(`📄 Classifying as PDF: "${text}" -> ${href}`);
      return 'pdf';
    }
    
    // Terms and conditions
    if ((textLower.includes('term') || textLower.includes('condition') || textLower.includes('faq')) 
        && (textLower.includes('card') || hrefLower.includes('card'))) {
      return 'terms';
    }
    
    // Card-specific offers
    if ((textLower.includes('offer') || textLower.includes('deal') || textLower.includes('promo'))
        && (textLower.includes('card') || hrefLower.includes('card') || hrefLower.includes('smartbuy'))) {
      return 'offers';
    }
    
    // Card rewards and benefits
    if ((textLower.includes('reward') || textLower.includes('point') || textLower.includes('cashback') 
         || textLower.includes('benefit') || textLower.includes('perk'))
        && (textLower.includes('card') || hrefLower.includes('card'))) {
      return 'rewards';
    }
    
    // Partnerships and merchants
    if (textLower.includes('partner') || textLower.includes('merchant') || hrefLower.includes('smartbuy')
        || textLower.includes('dining') || textLower.includes('travel') || textLower.includes('shopping')) {
      return 'partnerships';
    }
    
    // Card-specific features
    if ((textLower.includes('card') && (textLower.includes('feature') || textLower.includes('control') 
         || textLower.includes('manage') || textLower.includes('payzapp') || textLower.includes('emi')))) {
      return 'card_features';
    }
    
    // Only allow very specific general links
    if (textLower.includes('pixel') && textLower.includes('card')) {
      return 'general';
    }
    
    // If it passed isRelevantLink but doesn't fit above categories, 
    // it's probably still card-related
    return 'general';
  }

  /**
   * Prioritize links based on type
   */
  prioritizeLinks(links) {
    const priority = {
      'pdf': 10,
      'terms': 9,
      'benefits': 8,
      'offers': 8,
      'rewards': 7,
      'card_features': 6,
      'partnerships': 5,
      'general': 3
    };
    
    const sortedLinks = links.sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));
    
    console.log(`📋 Link breakdown by type:`);
    const typeCounts = {};
    sortedLinks.forEach(link => {
      typeCounts[link.type] = (typeCounts[link.type] || 0) + 1;
    });
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} links`);
    });
    
    return sortedLinks;
  }

  /**
   * Process all links with PDF extraction
   */
  async processLinks(links) {
    const processedLinks = [];
    const failedLinks = [];
    let successCount = 0;
    
    console.log(`🔗 Processing ALL ${links.length} relevant links...`);
    
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      
      if (this.processedUrls.has(link.url)) {
        continue;
      }
      
      this.processedUrls.add(link.url);
      
      try {
        console.log(`📄 [${i + 1}/${links.length}] Processing: ${link.type} - ${link.url}`);
        
        if (link.type === 'pdf') {
          const pdfContent = await this.extractPDFContent(link.url);
          processedLinks.push({
            ...link,
            content: pdfContent.content,
            summary: pdfContent.summary
          });
          successCount++;
        } else {
          const webContent = await this.extractWebContent(link.url);
          if (webContent.success) {
            processedLinks.push({
              ...link,
              content: webContent.content,
              summary: this.createSummary(webContent)
            });
            successCount++;
          } else {
            failedLinks.push({
              url: link.url,
              type: link.type,
              error: webContent.error,
              text: link.text
            });
          }
        }
        
        // Progress update
        if ((i + 1) % 5 === 0) {
          console.log(`📊 Progress: ${i + 1}/${links.length} processed (${successCount} success, ${failedLinks.length} failed)`);
        }
        
        // Delay between requests
        await Utils.sleep(this.delayBetweenRequests);
        
      } catch (error) {
        failedLinks.push({
          url: link.url,
          type: link.type,
          error: error.message,
          text: link.text
        });
        console.log(`⚠️ Failed to process link: ${link.url} - ${error.message}`);
      }
    }
    
    console.log(`✅ Completed processing: ${successCount} successful, ${failedLinks.length} failed`);
    
    // Display failed links
    if (failedLinks.length > 0) {
      console.log(`\n🚨 FAILED LINKS SUMMARY:`);
      failedLinks.forEach((failed, index) => {
        console.log(`   ${index + 1}. [${failed.type}] ${failed.url}`);
        console.log(`      Error: ${failed.error}`);
      });
    }
    
    return { processedLinks, failedLinks };
  }

  /**
   * Extract PDF content using the approach from your fetcher.js
   */
  async extractPDFContent(url) {
    console.log(`📄 Extracting PDF from: ${url}`);
    
    try {
      let finalUrl = url;
      
      // Handle repository URLs
      if (url.includes('/content/bbp/repositories/') && url.includes('path=')) {
        try {
          const urlObj = new URL(url);
          const pathParam = urlObj.searchParams.get('path');
          if (pathParam) {
            const decodedPath = decodeURIComponent(pathParam);
            finalUrl = 'https://www.hdfcbank.com' + decodedPath;
            console.log(`🔧 Repository URL converted: ${finalUrl}`);
          }
        } catch (e) {
          console.log(`⚠️ Could not parse repository URL: ${e.message}`);
        }
      }
      
      // Try both URLs
      const urlsToTry = [url, finalUrl].filter((u, i, arr) => arr.indexOf(u) === i);
      
      for (const tryUrl of urlsToTry) {
        try {
          console.log(`🔄 Trying PDF URL: ${tryUrl}`);
          
          const response = await axios.get(tryUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/pdf,*/*',
              'Cache-Control': 'no-cache'
            },
            maxRedirects: 10
          });
          
          console.log(`✅ PDF downloaded: ${response.data.length} bytes`);
          
          const data = await pdfParse(response.data);
          const cleanText = data.text.replace(/\n\s*\n/g, '\n').replace(/\s+/g, ' ').trim();
          const paragraphs = cleanText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20).slice(0, 50);
          
          console.log(`📄 Extracted ${paragraphs.length} paragraphs from PDF`);
          
          return {
            content: { text: paragraphs.join('\n'), html: null },
            summary: `PDF: ${paragraphs[0]?.substring(0, 200)}...`
          };
          
        } catch (urlError) {
          console.log(`❌ Failed with ${tryUrl}: ${urlError.message}`);
          continue;
        }
      }
      
      throw new Error('All PDF extraction attempts failed');
      
    } catch (error) {
      console.log(`❌ PDF extraction failed: ${error.message}`);
      return {
        content: null,
        summary: `PDF extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Extract web content using Puppeteer
   */
  async extractWebContent(url) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true, // Use headless for linked pages
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setDefaultNavigationTimeout(60000);
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      const content = await page.evaluate(() => {
        // Remove unwanted elements
        const unwanted = document.querySelectorAll('script, style, nav, header, footer');
        unwanted.forEach(el => el.remove());
        
        return {
          text: document.body.textContent.replace(/\s+/g, ' ').trim(),
          html: document.body.innerHTML
        };
      });
      
      await browser.close();
      
      return {
        success: true,
        content: content
      };
      
    } catch (error) {
      if (browser) await browser.close();
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create content summary
   */
  createSummary(content) {
    if (content.content?.text) {
      return `Content: ${Utils.truncateText(content.content.text, 200)}`;
    }
    return 'No content summary available';
  }
}

module.exports = LinkProcessor;
