const puppeteer = require('puppeteer');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const config = require('../config/config');
const Utils = require('./utils');

class ContentExtractor {
    constructor() {
        this.config = config.crawler;
    }

    /**
     * Main extraction method that detects PDF vs web content
     */
    async extractFromUrl(url) {
        // Check if the URL is a PDF first
        if (this.isPdfUrl(url)) {
            console.log(`📄 Detected PDF URL: ${url}`);
            return await this.extractPdfContent(url);
        }

        // Otherwise, extract as web content
        return await this.extractWebContent(url);
    }

    /**
     * Check if URL is a PDF
     */
    isPdfUrl(url) {
        const urlLower = url.toLowerCase();
        return urlLower.includes('.pdf') || 
               urlLower.includes('/repositories/') || 
               urlLower.includes('?path=') ||
               urlLower.includes('content-type=application/pdf') ||
               urlLower.includes('/assets/') && urlLower.includes('.pdf') ||
               urlLower.includes('/documents/') ||
               urlLower.includes('/uploads/') && urlLower.includes('.pdf');
    }

    /**
     * Extract PDF content
     */
    async extractPdfContent(url) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                console.log(`📄 Extracting PDF content from: ${url} (Attempt ${retryCount + 1}/${maxRetries})`);
                
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

                // Try both URLs if different
                const urlsToTry = [url, finalUrl].filter((u, i, arr) => arr.indexOf(u) === i);
                
                for (const tryUrl of urlsToTry) {
                    try {
                        console.log(`🔄 Trying PDF URL: ${tryUrl}`);
                        
                        const response = await axios.get(tryUrl, {
                            responseType: 'arraybuffer',
                            timeout: 90000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'application/pdf,application/octet-stream,*/*',
                                'Cache-Control': 'no-cache',
                                'Referer': tryUrl.includes('hdfcbank.com') ? 'https://www.hdfcbank.com/' : undefined
                            },
                            maxRedirects: 10,
                            validateStatus: function (status) {
                                return status >= 200 && status < 300;
                            }
                        });

                        console.log(`✅ PDF downloaded: ${response.data.length} bytes, Content-Type: ${response.headers['content-type']}`);
                        
                        // Verify it's actually a PDF
                        if (response.headers['content-type'] && !response.headers['content-type'].includes('pdf')) {
                            console.log(`⚠️ Response is not a PDF: ${response.headers['content-type']}`);
                            continue;
                        }

                        const data = await pdfParse(response.data, {
                            max: 0, // Parse all pages
                            version: 'v1.10.100'
                        });
                        
                        const cleanText = data.text
                            .replace(/\n\s*\n/g, '\n')
                            .replace(/\s+/g, ' ')
                            .replace(/\u0000/g, '')
                            .trim();
                        
                        // Extract title from PDF metadata or first line
                        let title = data.info?.Title || 'PDF Document';
                        if (!title || title === 'PDF Document' || title.trim() === '') {
                            const firstLine = cleanText.split('\n')[0];
                            if (firstLine && firstLine.length > 0 && firstLine.length < 200) {
                                title = firstLine.trim();
                            } else {
                                title = `PDF Document from ${new URL(tryUrl).hostname}`;
                            }
                        }

                        console.log(`📄 Successfully extracted PDF content: ${cleanText.length} characters, ${data.numpages} pages`);
                        
                        return {
                            url: url,
                            title: title,
                            content: {
                                text: cleanText,
                                html: null
                            },
                            links: [],
                            success: true,
                            contentType: 'pdf',
                            extractionError: null,
                            metadata: {
                                pages: data.numpages,
                                info: data.info,
                                actualUrl: tryUrl
                            }
                        };
                        
                    } catch (urlError) {
                        console.log(`❌ Failed with ${tryUrl}: ${urlError.message}`);
                        if (urlError.response) {
                            console.log(`📊 Response status: ${urlError.response.status}, headers:`, urlError.response.headers);
                        }
                        continue;
                    }
                }
                
                throw new Error('All PDF extraction attempts failed');
                
            } catch (error) {
                console.error(`❌ Attempt ${retryCount + 1} failed for PDF ${url}: ${error.message}`);
                
                retryCount++;
                
                if (retryCount < maxRetries) {
                    console.log(`🔄 Retrying PDF extraction in 3 seconds...`);
                    await Utils.sleep(3000);
                } else {
                    return {
                        url: url,
                        title: 'PDF Extraction Failed',
                        content: {
                            text: '',
                            html: null
                        },
                        links: [],
                        success: false,
                        contentType: 'pdf',
                        error: error.message
                    };
                }
            }
        }
    }

    /**
     * Extract web content using Puppeteer
     */
    async extractWebContent(url) {
        let browser;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                console.log(`🔍 Extracting web content from: ${url} (Attempt ${retryCount + 1}/${maxRetries})`);
                
                browser = await puppeteer.launch({
                    headless: "new",
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        '--disable-dev-shm-usage',
                        '--disable-extensions',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-features=VizDisplayCompositor',
                        '--no-first-run',
                        '--disable-default-apps',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-gpu',
                        '--no-zygote',
                        '--single-process'
                    ],
                    defaultViewport: { width: 1366, height: 768 },
                    timeout: 120000
                });

                const page = await browser.newPage();

                // Enhanced stealth measures
                await page.evaluateOnNewDocument(() => {
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Remove automation indicators
                    delete window.chrome;
                    window.chrome = { runtime: {} };
                    
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5],
                    });
                    
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                });

                // Set realistic user agent and headers
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await page.setExtraHTTPHeaders({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none'
                });

                // Set timeouts
                await page.setDefaultNavigationTimeout(120000);
                await page.setDefaultTimeout(120000);

                // Handle dialogs and popups
                page.on('dialog', async dialog => {
                    console.log(`🚨 Dialog appeared: ${dialog.message()}`);
                    await dialog.dismiss();
                });

                // Navigate with multiple fallback strategies
                const result = await this.navigateWithFallbacks(page, url);
                
                await browser.close();
                return {
                    ...result,
                    contentType: 'web'
                };

            } catch (error) {
                console.error(`❌ Attempt ${retryCount + 1} failed for ${url}: ${error.message}`);
                
                if (browser) {
                    try {
                        await browser.close();
                    } catch (closeError) {
                        console.log('⚠️ Error closing browser:', closeError.message);
                    }
                }

                retryCount++;
                
                if (retryCount < maxRetries) {
                    console.log(`🔄 Retrying in 5 seconds...`);
                    await Utils.sleep(5000);
                } else {
                    return {
                        url: url,
                        title: null,
                        content: null,
                        links: [],
                        success: false,
                        contentType: 'web',
                        error: error.message
                    };
                }
            }
        }
    }

    /**
     * Navigate with multiple fallback strategies
     */
    async navigateWithFallbacks(page, url) {
        const strategies = [
            { waitUntil: 'networkidle2', timeout: 60000 },
            { waitUntil: 'domcontentloaded', timeout: 30000 },
            { waitUntil: 'load', timeout: 45000 },
            { waitUntil: 'networkidle0', timeout: 90000 }
        ];

        let lastError;
        
        for (let i = 0; i < strategies.length; i++) {
            try {
                console.log(`📄 Trying navigation strategy ${i + 1}: ${strategies[i].waitUntil}`);
                
                const response = await page.goto(url, strategies[i]);
                
                // Check if response is valid
                if (response && response.status() >= 400) {
                    throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
                }
                
                await this.waitForContent(page);
                const result = await this.extractPageContent(page, url);
                
                if (result.content && (result.content.text.length > 100 || result.links.length > 0)) {
                    console.log(`✅ Successfully extracted content using strategy ${i + 1}`);
                    return result;
                }
                
                console.log(`⚠️ Strategy ${i + 1} loaded page but found minimal content`);
                
            } catch (error) {
                console.log(`❌ Strategy ${i + 1} failed: ${error.message}`);
                lastError = error;
                continue;
            }
        }

        throw lastError || new Error('All navigation strategies failed');
    }

    /**
     * Wait for content to load with multiple checks
     */
    async waitForContent(page) {
        // Initial wait
        await Utils.sleep(3000);

        try {
            // Wait for common content indicators
            await page.waitForFunction(() => {
                const body = document.body;
                if (!body) return false;
                
                const textLength = body.textContent.trim().length;
                const linkCount = document.querySelectorAll('a[href]').length;
                const imageCount = document.querySelectorAll('img').length;
                
                // Consider page loaded if it has reasonable content
                return textLength > 500 || linkCount > 10 || imageCount > 5;
            }, { timeout: 15000 });
            
            console.log('📄 Content indicators detected');
        } catch (error) {
            console.log('⚠️ Content indicators timeout, proceeding anyway');
        }

        // Additional wait for dynamic content
        await Utils.sleep(2000);

        // Try to wait for specific elements that might indicate the page is ready
        try {
            await page.waitForSelector('body', { timeout: 5000 });
            await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
        } catch (error) {
            console.log('⚠️ Page readiness check timeout, proceeding anyway');
        }

        // Wait for any remaining async operations
        try {
            await page.waitForLoadState?.('networkidle');
        } catch (error) {
            // Ignore if waitForLoadState is not available
        }
    }

    /**
     * Extract content with enhanced error handling
     */
    async extractPageContent(page, url) {
        const result = await page.evaluate(() => {
            try {
                // Remove unwanted elements
                const unwantedSelectors = [
                    'script', 'style', 'nav', 'header', 'footer', 
                    '.advertisement', '.ads', '.social-media', '.navigation', 
                    '.menu', '.sidebar', '.cookie-banner', '.popup', 
                    'iframe', 'object', 'embed', '.breadcrumb',
                    '.modal', '.overlay', '.loading', '.spinner',
                    '[style*="display: none"]', '[style*="visibility: hidden"]'
                ];
                
                unwantedSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            if (el && el.remove) {
                                el.remove();
                            }
                        });
                    } catch (e) {
                        // Ignore errors in cleanup
                    }
                });

                const extractedContent = {
                    title: '',
                    html: '',
                    text: '',
                    links: []
                };

                // Extract title
                extractedContent.title = document.title || 
                                       document.querySelector('h1')?.textContent?.trim() || 
                                       document.querySelector('.title')?.textContent?.trim() ||
                                       document.querySelector('[data-title]')?.textContent?.trim() ||
                                       'No title found';

                // Try to get content from body
                const body = document.body;
                if (body) {
                    extractedContent.html = body.innerHTML;
                    extractedContent.text = body.textContent.replace(/\s+/g, ' ').trim();
                } else {
                    // Fallback to documentElement
                    extractedContent.html = document.documentElement.innerHTML;
                    extractedContent.text = document.documentElement.textContent.replace(/\s+/g, ' ').trim();
                }

                // Extract all links with proper href and title attributes
                const links = document.querySelectorAll('a[href]');
                links.forEach((link, index) => {
                    try {
                        const href = link.getAttribute('href');
                        const text = link.textContent?.trim() || '';
                        const title = link.getAttribute('title') || '';
                        const ariaLabel = link.getAttribute('aria-label') || '';

                        if (href && 
                            text && 
                            !href.startsWith('javascript:') && 
                            !href.startsWith('mailto:') &&
                            !href.startsWith('tel:') &&
                            text.length > 2 && 
                            text.length < 500) {
                            
                            let fullUrl = href;
                            try {
                                if (!href.startsWith('http')) {
                                    fullUrl = new URL(href, window.location.origin).href;
                                }
                            } catch (e) {
                                // Keep original href if URL construction fails
                            }

                            extractedContent.links.push({
                                href: href,
                                text: text,
                                title: title,
                                ariaLabel: ariaLabel,
                                fullUrl: fullUrl,
                                index: index
                            });
                        }
                    } catch (linkError) {
                        // Skip problematic links
                    }
                });

                // Deduplicate links
                const seenUrls = new Set();
                extractedContent.links = extractedContent.links.filter(link => {
                    if (seenUrls.has(link.fullUrl)) {
                        return false;
                    }
                    seenUrls.add(link.fullUrl);
                    return true;
                });

                return extractedContent;
            } catch (error) {
                return {
                    title: 'Extraction Error',
                    html: '',
                    text: '',
                    links: [],
                    extractionError: error.message
                };
            }
        });

        console.log(`✅ Successfully extracted content from: ${url}`);
        console.log(`📊 Found ${result.links.length} links, ${result.text.length} characters of text`);

        return {
            url: url,
            title: result.title,
            content: {
                html: result.html,
                text: result.text
            },
            links: result.links,
            success: true,
            extractionError: result.extractionError
        };
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ContentExtractor;
