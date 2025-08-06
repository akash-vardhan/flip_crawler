const fetchSections = require('./fetcher');
const formatSections = require('./formatter');

function displayResults(formatted) {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 HDFC BANK PIXEL PLAY CREDIT CARD DETAILS');
  console.log('='.repeat(60));
  
  const sectionNames = Object.keys(formatted);
  console.log(`📋 Found ${sectionNames.length} sections:\n`);
  
  sectionNames.forEach((name, index) => {
    console.log(`${(index + 1).toString().padStart(2, '0')}. ${name}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('📄 FORMATTED JSON OUTPUT:');
  console.log('='.repeat(60));
  
  return JSON.stringify(formatted, null, 2);
}

function generateSummary(formatted) {
  let totalItems = 0;
  const summary = {};
  
  for (const [section, items] of Object.entries(formatted)) {
    let itemCount = 0;
    
    for (const item of items) {
      if (typeof item === 'object' && item.title) {
        itemCount += 1 + (item.items?.length || 0);
      } else {
        itemCount += 1;
      }
    }
    
    summary[section] = itemCount;
    totalItems += itemCount;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 EXTRACTION SUMMARY:');
  console.log('='.repeat(60));
  console.log(`Total sections: ${Object.keys(formatted).length}`);
  console.log(`Total items extracted: ${totalItems}`);
  console.log('\nItems per section:');
  
  for (const [section, count] of Object.entries(summary)) {
    console.log(`  • ${section}: ${count} items`);
  }
  
  return summary;
}

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting HDFC Bank data extraction...\n');
    
    // Step 1: Fetch raw data
    const rawSections = await fetchSections();
    
    if (Object.keys(rawSections).length === 0) {
      throw new Error('No sections found. The page structure might have changed.');
    }
    
    console.log('\n🔄 Processing and formatting data...');
    
    // Step 2: Format the data
    const formattedSections = formatSections(rawSections);
    
    // Step 3: Display results
    const jsonOutput = displayResults(formattedSections);
    
    // Step 4: Generate summary
    generateSummary(formattedSections);
    
    // Step 5: Output the JSON
    console.log('\n' + jsonOutput);
    
    const endTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Extraction completed successfully in ${endTime - startTime}ms`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error occurred during extraction:');
    console.error(`   ${error.message}`);
    
    if (error.code === 'ENOTFOUND') {
      console.error('   Check your internet connection and try again.');
    } else if (error.response?.status) {
      console.error(`   HTTP ${error.response.status}: ${error.response.statusText}`);
    }
    
    process.exit(1);
  }
})();