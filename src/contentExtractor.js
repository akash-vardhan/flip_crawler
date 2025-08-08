const puppeteer = require('puppeteer');
const config = require('../config/config');
const Utils = require('./utils');

class ContentExtractor {
  constructor() {
    this.config = config.crawler;
  }

  /**
   * Extract content using Puppeteer with browser window
   */
  async extractFromUrl(url) {
    let browser;
    try {
      console.log(`🔍 Extracting content from: ${url}`);
      
      browser = await puppeteer.launch({
        headless: false, // Browser window will open
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();
      
      // Set realistic user agent and headers
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      });

      // Set timeouts
      await page.setDefaultNavigationTimeout(300000);
      await page.setDefaultTimeout(300000);

      // Navigate and wait for complete loading
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 300000
      });

      // Wait for JavaScript execution
      await this.delay(5000);

      // Extract content with proper link handling
      const result = await page.evaluate(() => {
        // Remove unwanted elements
        const unwanted = document.querySelectorAll('script, style, nav, header, footer, .advertisement, .ads, .social-media, .navigation, .menu, .sidebar, .cookie-banner, .popup, iframe, object, embed, .breadcrumb');
        unwanted.forEach(el => el.remove());

        const extractedContent = {
          title: document.title || document.querySelector('h1')?.textContent?.trim() || 'No title found',
          html: document.body.innerHTML,
          text: document.body.textContent.replace(/\s+/g, ' ').trim(),
          links: []
        };

        // Extract all links with proper href and title attributes
        const links = document.querySelectorAll('a[href]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent.trim();
          const title = link.getAttribute('title');
          
          if (href && text && !href.startsWith('javascript:') && text.length > 2) {
            extractedContent.links.push({
              href: href,
              text: text,
              title: title,
              fullUrl: href.startsWith('http') ? href : new URL(href, window.location.origin).href
            });
          }
        });

        return extractedContent;
      });

      console.log(`✅ Successfully extracted content from: ${url}`);
      console.log(`📊 Found ${result.links.length} links`);

      await browser.close();

      return {
        url: url,
        title: result.title,
        content: {
          html: result.html,
          text: result.text
        },
        links: result.links,
        success: true
      };

    } catch (error) {
      console.error(`❌ Failed to extract content from ${url}: ${error.message}`);
      
      if (browser) {
        await browser.close();
      }
      
      return {
        url: url,
        title: null,
        content: null,
        links: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ContentExtractor;
