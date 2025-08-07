const fetchSections = require('./fetcher');
const formatSections = require('./formatter');
const fs = require('fs').promises;

function displayResults(formatted) {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 HDFC BANK PIXEL PLAY CREDIT CARD DETAILS');
    console.log('='.repeat(70));

    const sectionNames = Object.keys(formatted);
    console.log(`📋 Found ${sectionNames.length} sections:\n`);

    sectionNames.forEach((name, index) => {
        const itemCount = formatted[name].length;
        const linkContent = formatted[name].filter(item => 
            typeof item === 'object' && 
            (item.type === 'pdf_document' || item.type === 'webpage_document' || item.type === 'reference_link')
        ).length;
        
        console.log(`${(index + 1).toString().padStart(2, '0')}. ${name} (${itemCount} items${linkContent > 0 ? `, ${linkContent} linked content` : ''})`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('📄 ENHANCED JSON OUTPUT WITH LINKED CONTENT:');
    console.log('='.repeat(70));

    return JSON.stringify(formatted, null, 2);
}

function generateEnhancedSummary(formatted) {
    let totalItems = 0;
    let totalLinkedContent = 0;
    let totalPDFs = 0;
    let totalWebPages = 0;
    let totalErrors = 0;
    
    const summary = {};

    for (const [section, items] of Object.entries(formatted)) {
        let itemCount = 0;
        let linkedCount = 0;
        let pdfCount = 0;
        let webPageCount = 0;
        let errorCount = 0;

        for (const item of items) {
            if (typeof item === 'object' && item.title) {
                itemCount += 1 + (item.items?.length || 0);
            } else if (typeof item === 'object') {
                if (item.type === 'pdf_document') {
                    linkedCount++;
                    pdfCount++;
                    if (item.status === 'error') errorCount++;
                } else if (item.type === 'webpage_document') {
                    linkedCount++;
                    webPageCount++;
                    if (item.status === 'error') errorCount++;
                } else if (item.type === 'reference_link' || item.type === 'link_error') {
                    linkedCount++;
                    if (item.type === 'link_error') errorCount++;
                }
                itemCount += 1;
            } else {
                itemCount += 1;
            }
        }

        summary[section] = {
            total_items: itemCount,
            linked_content: linkedCount,
            pdfs: pdfCount,
            webpages: webPageCount,
            errors: errorCount
        };
        
        totalItems += itemCount;
        totalLinkedContent += linkedCount;
        totalPDFs += pdfCount;
        totalWebPages += webPageCount;
        totalErrors += errorCount;
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 ENHANCED EXTRACTION SUMMARY:');
    console.log('='.repeat(70));
    console.log(`Total sections: ${Object.keys(formatted).length}`);
    console.log(`Total items extracted: ${totalItems}`);
    console.log(`Total linked content processed: ${totalLinkedContent}`);
    console.log(`├── PDF documents: ${totalPDFs}`);
    console.log(`├── Web pages: ${totalWebPages}`);
    console.log(`└── Processing errors: ${totalErrors}`);

    console.log('\nDetailed breakdown by section:');
    for (const [section, stats] of Object.entries(summary)) {
        console.log(`\n📂 ${section}:`);
        console.log(`   ├── Total items: ${stats.total_items}`);
        if (stats.linked_content > 0) {
            console.log(`   ├── Linked content: ${stats.linked_content}`);
            if (stats.pdfs > 0) console.log(`   │   ├── PDFs: ${stats.pdfs}`);
            if (stats.webpages > 0) console.log(`   │   ├── Web pages: ${stats.webpages}`);
            if (stats.errors > 0) console.log(`   │   └── Errors: ${stats.errors}`);
        }
    }

    return summary;
}

async function saveToFile(data, filename) {
    try {
        await fs.writeFile(filename, data, 'utf8');
        console.log(`\n💾 Data saved to: ${filename}`);
    } catch (error) {
        console.error(`❌ Error saving file: ${error.message}`);
    }
}

(async () => {
    const startTime = Date.now();
    
    try {
        console.log('🚀 Starting Enhanced HDFC Bank Data Extraction...\n');
        console.log('🔗 This will follow links and extract content from PDFs and web pages');
        console.log('⏱️  Please note: This process may take several minutes due to link processing\n');

        // Step 1: Fetch raw data with link following
        console.log('📡 Phase 1: Fetching main page and following links...');
        const rawSections = await fetchSections();

        if (Object.keys(rawSections).length === 0) {
            throw new Error('No sections found. The page structure might have changed.');
        }

        console.log('\n🔄 Phase 2: Processing and formatting enhanced data...');
        
        // Step 2: Format the data
        const formattedSections = formatSections(rawSections);

        // Step 3: Display results
        const jsonOutput = displayResults(formattedSections);

        // Step 4: Generate enhanced summary
        generateEnhancedSummary(formattedSections);

        // Step 5: Save to file
        const filename = `hdfc_pixel_enhanced_${new Date().toISOString().split('T')[0]}.json`;
        await saveToFile(jsonOutput, filename);

        // Step 6: Output the JSON to console
        console.log('\n' + jsonOutput);

        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        console.log('\n' + '='.repeat(70));
        console.log(`✅ Enhanced extraction completed successfully in ${duration}s`);
        console.log('🎉 All linked content has been processed and included!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Error occurred during enhanced extraction:');
        console.error(`   ${error.message}`);
        
        if (error.code === 'ENOTFOUND') {
            console.error('   Check your internet connection and try again.');
        } else if (error.response?.status) {
            console.error(`   HTTP ${error.response.status}: ${error.response.statusText}`);
        }

        process.exit(1);
    }
})();
