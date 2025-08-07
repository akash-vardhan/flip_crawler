const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const puppeteer = require('puppeteer');
const { URL } = require('url');

const TARGET_URL = 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/pixel-play-credit-card';
const BASE_URL = 'https://www.hdfcbank.com';

// Cache for processed URLs to avoid duplicates
const processedUrls = new Set();

// Generic delay function compatible with all Puppeteer versions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSectionsWithPuppeteerAdvanced() {
    let browser;
    try {
        console.log('🔄 Using enhanced Puppeteer to capture actual repository URLs...');
        
        browser = await puppeteer.launch({ 
            headless: false, // Set to true for production, false to see what's happening
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
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set extra headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document'
        });
        
        // Set longer timeouts
        await page.setDefaultNavigationTimeout(300000); // 5 minutes
        await page.setDefaultTimeout(300000);
        
        console.log('🌐 Loading page and waiting for complete rendering...');
        
        await page.goto(TARGET_URL, { 
            waitUntil: 'networkidle0', // Wait until no network activity for 500ms
            timeout: 300000
        });
        
        // Wait extra time for dynamic content and JavaScript to fully execute
        console.log('⏱️  Waiting for JavaScript execution and dynamic content...');
        await delay(10000); // Wait 10 seconds for all JS to execute
        
        // Wait for specific elements to ensure page is fully loaded
        try {
            await page.waitForSelector('.row.content-body', { timeout: 30000 });
            console.log('✅ Content sections loaded successfully');
        } catch (e) {
            console.log('⚠️  Content sections selector timeout, proceeding anyway...');
        }
        
        console.log('🔍 Extracting sections with actual repository URLs...');
        
        const sections = await page.evaluate(() => {
            const extractedSections = {};
            
            // Find all content-body rows
            const contentRows = document.querySelectorAll('.row.content-body');
            console.log(`Found ${contentRows.length} content rows`);
            
            for (let i = 0; i < contentRows.length; i++) {
                const row = contentRows[i];
                const leftSection = row.querySelector('.left-section');
                const rightSection = row.querySelector('.right-section');
                
                if (!leftSection || !rightSection) continue;
                
                // Get section title
                const titleElement = leftSection.querySelector('.row-name, h4');
                if (!titleElement) continue;
                
                const sectionTitle = titleElement.textContent.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
                if (!sectionTitle) continue;
                
                console.log(`Processing section: ${sectionTitle}`);
                
                const content = [];
                
                // Extract paragraphs
                const paragraphs = rightSection.querySelectorAll('p');
                paragraphs.forEach(p => {
                    const text = p.textContent.trim();
                    if (text && text.length > 0) {
                        content.push({
                            type: 'paragraph',
                            text: text
                        });
                    }
                });
                
                // Extract list items
                const listItems = rightSection.querySelectorAll('ul li');
                listItems.forEach(li => {
                    const text = li.textContent.trim();
                    if (text && text.length > 0) {
                        const htmlContent = li.innerHTML || '';
                        
                        if (htmlContent.includes('<br')) {
                            const parts = htmlContent
                                .split(/<br\s*\/?>/gi)
                                .map(part => part.replace(/<\/?[^>]+(>|$)/g, '').trim())
                                .filter(part => part && part.length > 0);
                            
                            if (parts.length > 1) {
                                content.push({
                                    type: 'list_item_with_sub',
                                    main: parts[0],
                                    sub_items: parts.slice(1)
                                });
                            } else {
                                content.push({
                                    type: 'list_item',
                                    text: text
                                });
                            }
                        } else {
                            content.push({
                                type: 'list_item',
                                text: text
                            });
                        }
                    }
                });
                
                // Extract links with proper repository URLs
                const links = rightSection.querySelectorAll('a');
                console.log(`Found ${links.length} links in section: ${sectionTitle}`);
                
                links.forEach((link, linkIndex) => {
                    const linkText = link.textContent.trim();
                    const href = link.getAttribute('href');
                    const title = link.getAttribute('title');
                    
                    console.log(`Link ${linkIndex + 1}: text="${linkText}", href="${href}", title="${title}"`);
                    
                    if (linkText && href && !href.startsWith('javascript:')) {
                        content.push({
                            type: 'link',
                            text: linkText,
                            url: href,
                            title: title,
                            raw_href: href // Store the raw href for debugging
                        });
                    }
                });
                
                if (content.length > 0) {
                    extractedSections[sectionTitle] = content;
                }
            }
            
            return extractedSections;
        });
        
        console.log('📊 Extraction completed');
        return sections;
        
    } catch (error) {
        console.error('❌ Enhanced Puppeteer extraction failed:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function extractPDFContentFromRepository(url) {
    console.log(`   📄 Extracting PDF from repository URL: ${url}`);
    
    try {
        let finalUrl = url;
        
        // Handle repository URLs by extracting the path parameter
        if (url.includes('/content/bbp/repositories/') && url.includes('path=')) {
            try {
                const urlObj = new URL(url);
                const pathParam = urlObj.searchParams.get('path');
                
                if (pathParam) {
                    // Decode the path parameter
                    const decodedPath = decodeURIComponent(pathParam);
                    finalUrl = BASE_URL + decodedPath;
                    console.log(`   🔧 Repository URL converted:`);
                    console.log(`       Original: ${url}`);
                    console.log(`       Final: ${finalUrl}`);
                }
            } catch (e) {
                console.log(`   ⚠️  Could not parse repository URL: ${url}`);
                console.log(`   ⚠️  Error: ${e.message}`);
            }
        }
        
        // Try the repository URL first, then the converted URL
        const urlsToTry = [url, finalUrl].filter((u, i, arr) => arr.indexOf(u) === i); // Remove duplicates
        
        for (const tryUrl of urlsToTry) {
            try {
                console.log(`   🔄 Trying URL: ${tryUrl}`);
                
                const response = await axios.get(tryUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/pdf,*/*',
                        'Referer': TARGET_URL,
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    maxRedirects: 10,
                    validateStatus: function (status) {
                        return status >= 200 && status < 400;
                    }
                });
                
                console.log(`   ✅ PDF downloaded successfully from: ${tryUrl}`);
                console.log(`   📊 File size: ${response.data.length} bytes`);
                
                const data = await pdfParse(response.data);
                const cleanText = data.text.replace(/\n\s*\n/g, '\n').replace(/\s+/g, ' ').trim();
                const paragraphs = cleanText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20).slice(0, 50);
                
                console.log(`   📄 Successfully extracted ${paragraphs.length} paragraphs from PDF`);
                
                return {
                    type: 'pdf_content',
                    source_url: tryUrl,
                    original_url: url,
                    status: 'success',
                    content: paragraphs
                };
                
            } catch (urlError) {
                console.log(`   ❌ Failed with ${tryUrl}: HTTP ${urlError.response?.status || 'Network Error'} - ${urlError.message}`);
                continue; // Try next URL
            }
        }
        
        // If all URLs failed
        throw new Error(`All PDF extraction attempts failed for: ${url}`);
        
    } catch (error) {
        console.log(`   ❌ Complete PDF extraction failure: ${error.message}`);
        
        return {
            type: 'pdf_content',
            source_url: url,
            status: 'error',
            error: error.message
        };
    }
}

async function extractWebPageContent(url) {
    console.log(`   🌐 Extracting webpage content from: ${url}`);
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.setDefaultNavigationTimeout(120000);
        
        await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 120000 
        });
        
        const content = await page.evaluate(() => {
            const extractedContent = [];
            
            const unwanted = document.querySelectorAll('script, style, nav, header, footer');
            unwanted.forEach(el => el.remove());
            
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
                const text = heading.textContent.trim();
                if (text && text.length > 3) {
                    extractedContent.push({
                        type: 'heading',
                        level: heading.tagName.toLowerCase(),
                        text: text
                    });
                }
            });
            
            document.querySelectorAll('p').forEach(p => {
                const text = p.textContent.trim();
                if (text && text.length > 20) {
                    extractedContent.push({
                        type: 'paragraph',
                        text: text
                    });
                }
            });
            
            document.querySelectorAll('li').forEach(li => {
                const text = li.textContent.trim();
                if (text && text.length > 10) {
                    extractedContent.push({
                        type: 'list_item',
                        text: text
                    });
                }
            });
            
            return extractedContent.slice(0, 40);
        });
        
        console.log(`   ✅ Extracted ${content.length} items from webpage`);
        
        return {
            type: 'webpage_content',
            source_url: url,
            status: 'success',
            content: content
        };
        
    } catch (error) {
        console.log(`   ❌ Failed to extract webpage: ${error.message}`);
        return {
            type: 'webpage_content',
            source_url: url,
            status: 'error',
            error: error.message
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function followLink(url) {
    if (processedUrls.has(url)) {
        console.log(`   ⏭️  Skipping already processed URL: ${url}`);
        return null;
    }
    
    processedUrls.add(url);
    
    let finalUrl = url;
    
    // Don't modify repository URLs - use them as-is
    if (!url.startsWith('http') && !url.includes('/content/bbp/repositories/')) {
        finalUrl = BASE_URL + url;
    }
    
    const urlLower = finalUrl.toLowerCase();
    
    if (urlLower.includes('.pdf') || urlLower.includes('pdf') || finalUrl.includes('/content/bbp/repositories/')) {
        return await extractPDFContentFromRepository(finalUrl);
    } else {
        return await extractWebPageContent(finalUrl);
    }
}

async function processLinksInContent(content) {
    const processedContent = [];
    
    for (const item of content) {
        processedContent.push(item);
        
        if (item.type === 'link') {
            console.log(`  🔗 Following link: "${item.text}" -> ${item.url}`);
            if (item.raw_href && item.raw_href !== item.url) {
                console.log(`      Raw href: ${item.raw_href}`);
            }
            
            try {
                const linkContent = await followLink(item.url);
                if (linkContent) {
                    processedContent.push(linkContent);
                }
            } catch (error) {
                console.log(`  ❌ Error processing link ${item.url}: ${error.message}`);
                processedContent.push({
                    type: 'link_error',
                    source_url: item.url,
                    error: error.message
                });
            }
            
            await delay(2000);
        }
    }
    
    return processedContent;
}

async function fetchSections() {
    try {
        console.log('Fetching data from HDFC Bank...');
        
        const rawSections = await fetchSectionsWithPuppeteerAdvanced();
        
        if (Object.keys(rawSections).length === 0) {
            throw new Error('No sections found. The page structure might have changed.');
        }
        
        console.log(`Found ${Object.keys(rawSections).length} content sections to process`);
        
        const sections = {};
        let sectionCount = 0;
        
        for (const [sectionTitle, content] of Object.entries(rawSections)) {
            console.log(`\n🔍 Processing section: ${sectionTitle}`);
            console.log(`  📝 Found ${content.length} items in section`);
            
            const processedContent = await processLinksInContent(content);
            
            sections[sectionTitle] = processedContent;
            sectionCount++;
            console.log(`  ✅ Section "${sectionTitle}" completed with ${processedContent.length} total items`);
        }

        console.log(`\n🎉 Total sections extracted: ${sectionCount}`);
        console.log(`🔗 Total unique links processed: ${processedUrls.size}`);
        
        return sections;
        
    } catch (error) {
        console.error('Error fetching data:', error.message);
        throw error;
    }
}

module.exports = fetchSections;
