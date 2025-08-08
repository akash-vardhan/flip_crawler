module.exports = {
  crawler: {
    timeout: 30000,
    maxRedirects: 5,
    maxLinksToProcess: 0, // 0 = no limit
    delayBetweenRequests: 1000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  openai: {
    model: 'gpt-4.1-mini',
    temperature: 0.1,
    maxTokens: 10000
  },
  content: {
    maxContentLength: 45000,
    unwantedSelectors: [
      'script', 'style', 'nav', 'header', 'footer', 
      '.advertisement', '.ads', '.social-media', '.navigation', 
      '.menu', '.sidebar', '.cookie-banner', '.popup', 
      'iframe', 'object', 'embed', '.breadcrumb',
      '[class*="header"]', '[class*="footer"]', '[class*="nav"]',
      '.social-share', '.newsletter', '.related-links'
    ]
  }
};
