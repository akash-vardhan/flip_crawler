const CardholderBenefitsCrawler = require('./src/crawler');

async function extractCardBenefits(url, openaiApiKey, options = {}) {
  const crawler = new CardholderBenefitsCrawler(openaiApiKey, options);
  return await crawler.crawlCardBenefits(url);
}

module.exports = {
  extractCardBenefits
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node index.js <URL> <OPENAI_API_KEY>');
    process.exit(1);
  }
  
  extractCardBenefits(args[0], args[1])
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
