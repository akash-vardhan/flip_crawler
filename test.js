const { extractCardBenefits } = require('./index');
const Utils = require('./src/utils');
require('dotenv').config()

async function testCrawler() {
  const testUrls = [
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/pixel-play-credit-card'
  ];
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    console.error('❌ Please set your OpenAI API key');
    return;
  }
  
  for (const url of testUrls) {
    try {
      console.log(`\n${'='.repeat(100)}`);
      console.log(`🎯 Testing COMPREHENSIVE crawl: ${url}`);
      console.log(`🔥 Processing ALL relevant links found on homepage`);
      console.log(`${'='.repeat(100)}`);
      
      const startTime = Date.now();
      
      const result = await extractCardBenefits(url, apiKey, {
        maxLinks: 0, // No limit
        delayBetweenRequests: 1000 // 1 second delay
      });
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.log('\n📊 COMPREHENSIVE Results Summary:');
      console.log(`⏱️  Total processing time: ${duration} seconds`);
      console.log(`- Card: ${result.card?.name || 'Not found'}`);
      console.log(`- Bank: ${result.card?.bank || 'Not found'}`);
      console.log(`- Benefits: ${result.benefits?.length || 0}`);
      console.log(`- Current Offers: ${result.current_offers?.length || 0}`);
      console.log(`- Perks: ${result.perks?.length || 0}`);
      console.log(`- Partnerships: ${result.partnerships?.length || 0}`);
      console.log(`- Confidence: ${result.metadata?.confidence_score || 0}`);
      console.log(`- Links Processed: ${result.metadata?.processed_links || 0}`);
      
      // Save result to file
      const fs = require('fs');
      const filename = `${result.card?.bank}_${result.card?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'card'}.json`;
      fs.writeFileSync(filename, JSON.stringify(result, null, 2));
      console.log(`💾 Comprehensive results saved to ${filename}`);
      
    } catch (error) {
      console.error(`❌ Test failed for ${url}:`, error.message);
    }
  }
}

if (require.main === module) {
  testCrawler().catch(console.error);
}
