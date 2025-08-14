const fs = require('fs');
const path = require('path');
const ContentExtractor = require('./contentExtractor');
const LinkProcessor = require('./linkProcessor');
const AIProcessor = require('./aiProcessor');
const Utils = require('./utils');

class CardholderBenefitsCrawler {
    constructor(openaiApiKey, options = {}) {
        this.contentExtractor = new ContentExtractor();
        this.linkProcessor = new LinkProcessor({
            maxLinks: options.maxLinks || 0,
            delayBetweenRequests: options.delayBetweenRequests || 2000
        });
        this.aiProcessor = new AIProcessor(openaiApiKey);
        this.options = options;
        
        this.outputDir = path.join(process.cwd(), 'json_results');
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        console.log('🚀 CardholderBenefitsCrawler initialized');
        console.log(`📁 Output directory: ${this.outputDir}`);
    }

    /**
     * Main crawling method
     */
    async crawlCardBenefits(url) {
        const startTime = Date.now();
        
        try {
            console.log(`🚀 Crawling: ${url}`);
            console.log('=' .repeat(80));
            
            // STEP-1: Extract main content (now handles PDFs automatically)
            console.log('📥 STEP 1: Extracting main content...');
            const mainContent = await this.contentExtractor.extractFromUrl(url);
            
            if (!mainContent.success) {
                throw new Error(`Failed to extract main content: ${mainContent.error}`);
            }

            console.log(`✅ Main content extracted: ${mainContent.contentType} format`);

            // Check if main content is a PDF
            if (mainContent.contentType === 'pdf') {
                console.log('📄 Root URL is a PDF - processing as PDF document');
                return await this.processPdfDocument(mainContent, url, startTime);
            }

            // STEP-2: Process web content
            console.log('🔗 STEP 2: Processing linked content...');
            const links = this.linkProcessor.extractLinks(mainContent, url);
            console.log(`📊 Found ${links.length} potential links to process`);
            
            const { processedLinks, failedLinks } = await this.linkProcessor.processLinks(links);
            console.log(`✅ Successfully processed ${processedLinks.length} links`);
            console.log(`❌ Failed to process ${failedLinks.length} links`);

            // STEP-3: AI Processing
            console.log('🤖 STEP 3: AI processing...');
            const { standardJson, structuredJson } = 
                await this.aiProcessor.processContent(mainContent, processedLinks, url);

            // STEP-4: Assemble standard result
            console.log('📋 STEP 4: Assembling results...');
            const standardResult = {
                id: Utils.generateId(url),
                url,
                scraped_at: new Date().toISOString(),
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
                ...standardJson
            };

            // Add metadata
            standardResult.metadata = standardResult.metadata || {};
            standardResult.metadata.failed_links = failedLinks.length;
            standardResult.metadata.failed_link_details = failedLinks;
            standardResult.metadata.content_type = 'web';
            standardResult.metadata.total_links_found = links.length;
            standardResult.metadata.links_processed = processedLinks.length;

            // STEP-5: Check data completeness
            console.log('🔍 STEP 5: Validating data completeness...');
            if (!this.isDataComplete(standardResult)) {
                console.warn('⚠️ Incomplete data detected');
                return {
                    valid: false,
                    reason: 'incomplete_data',
                    standard: standardResult,
                    structured: structuredJson,
                    processing_time_seconds: Math.round((Date.now() - startTime) / 1000)
                };
            }

            // STEP-6: Save files
            console.log('💾 STEP 6: Saving results...');
            return await this.saveResults(standardResult, structuredJson, url, false, startTime);

        } catch (err) {
            console.error('❌ Crawling failed:', err.message);
            console.error('Stack trace:', err.stack);
            return this.createErrorResult(url, err.message, 'web', startTime);
        }
    }

    /**
     * Process PDF document as main content
     */
    async processPdfDocument(pdfContent, url, startTime) {
        try {
            console.log('📄 Processing PDF document with AI...');
            
            // For PDFs, we don't have linked content, so pass empty array
            const { standardJson, structuredJson } = 
                await this.aiProcessor.processContent(pdfContent, [], url);

            const standardResult = {
                id: Utils.generateId(url),
                url,
                scraped_at: new Date().toISOString(),
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
                ...standardJson
            };

            // Add PDF-specific metadata
            standardResult.metadata = standardResult.metadata || {};
            standardResult.metadata.content_type = 'pdf';
            standardResult.metadata.processed_links = 0;
            standardResult.metadata.failed_links = 0;
            standardResult.metadata.total_links_found = 0;
            standardResult.metadata.pdf_info = {
                title: pdfContent.title,
                text_length: pdfContent.content?.text?.length || 0,
                pages: pdfContent.metadata?.pages || 0,
                actual_url: pdfContent.metadata?.actualUrl || url
            };

            // For PDFs, we're more lenient with data completeness
            const isComplete = this.isPdfDataComplete(standardResult);
            
            if (!isComplete) {
                console.warn('⚠️ PDF contains minimal extractable data');
                standardResult.metadata.data_quality = 'minimal';
            } else {
                standardResult.metadata.data_quality = 'complete';
            }

            // Save results (always save PDF results, even if minimal)
            return await this.saveResults(standardResult, structuredJson, url, true, startTime);

        } catch (error) {
            console.error('❌ PDF processing failed:', error.message);
            return this.createErrorResult(url, error.message, 'pdf', startTime);
        }
    }

    /**
     * Check if data is complete for web pages
     */
    isDataComplete(data) {
        try {
            const namePresent = !!data.card?.name && 
                               data.card.name !== 'Not found' &&
                               !/unknown|not found|error/i.test(data.card.name);
            
            const bankPresent = !!data.card?.bank && 
                               data.card.bank !== 'Not found' &&
                               !/unknown|not found|error/i.test(data.card.bank);
            
            const hasBenefits = (data.benefits?.length || 0) > 0;
            const hasOffers = (data.current_offers?.length || 0) > 0;
            const hasPerks = (data.perks?.length || 0) > 0;
            const hasEarnCats = (data.rewards?.earning?.categories?.length || 0) > 0;
            const hasContent = hasBenefits || hasOffers || hasPerks || hasEarnCats;

            console.log(`📊 Data completeness check:`);
            console.log(`   - Card name: ${namePresent ? '✅' : '❌'} (${data.card?.name})`);
            console.log(`   - Bank: ${bankPresent ? '✅' : '❌'} (${data.card?.bank})`);
            console.log(`   - Benefits: ${hasBenefits ? '✅' : '❌'} (${data.benefits?.length || 0})`);
            console.log(`   - Offers: ${hasOffers ? '✅' : '❌'} (${data.current_offers?.length || 0})`);
            console.log(`   - Perks: ${hasPerks ? '✅' : '❌'} (${data.perks?.length || 0})`);
            console.log(`   - Earning categories: ${hasEarnCats ? '✅' : '❌'} (${data.rewards?.earning?.categories?.length || 0})`);

            return namePresent && bankPresent && hasContent;
        } catch (error) {
            console.error('❌ Error checking data completeness:', error.message);
            return false;
        }
    }

    /**
     * Check PDF data completeness (more lenient than web pages)
     */
    isPdfDataComplete(data) {
        try {
            const hasContent = (data.content?.text?.length || 0) > 100;
            const hasTitle = !!data.title && 
                            data.title !== 'PDF Extraction Failed' && 
                            data.title !== 'Extraction Error';
            
            const hasMinimalCardInfo = data.card && (
                (data.card.name && !/(not found|unknown|error)/i.test(data.card.name)) ||
                (data.card.bank && !/(not found|unknown|error)/i.test(data.card.bank))
            );

            console.log(`📊 PDF completeness check:`);
            console.log(`   - Has content: ${hasContent ? '✅' : '❌'} (${data.content?.text?.length || 0} chars)`);
            console.log(`   - Has title: ${hasTitle ? '✅' : '❌'} (${data.title})`);
            console.log(`   - Has card info: ${hasMinimalCardInfo ? '✅' : '❌'}`);
            
            return hasContent && hasTitle;
        } catch (error) {
            console.error('❌ Error checking PDF completeness:', error.message);
            return false;
        }
    }

    /**
     * Save results to files
     */
    async saveResults(standardResult, structuredJson, url, isPdf = false, startTime = Date.now()) {
        try {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const cardSlug = (standardResult.card?.name || 'document')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
            const bankSlug = (standardResult.card?.bank || 'unknown')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
            
            const prefix = isPdf ? 'pdf_' : '';
            const standardFilename = `${prefix}${bankSlug}_${cardSlug}_standard_${ts}.json`;
            const structuredFilename = `${prefix}${bankSlug}_${cardSlug}_structured_${ts}.json`;
            
            // Add final metadata
            standardResult.metadata = standardResult.metadata || {};
            standardResult.metadata.files_generated = {
                standard: standardFilename,
                structured: structuredFilename
            };
            standardResult.metadata.extraction_completed_at = new Date().toISOString();

            // Write files
            fs.writeFileSync(
                path.join(this.outputDir, standardFilename), 
                JSON.stringify(standardResult, null, 2)
            );
            fs.writeFileSync(
                path.join(this.outputDir, structuredFilename), 
                JSON.stringify(structuredJson, null, 2)
            );

            console.log(`💾 Saved: json_results/${standardFilename}`);
            console.log(`💾 Saved: json_results/${structuredFilename}`);
            console.log(`⏱️ Total processing time: ${Math.round((Date.now() - startTime) / 1000)} seconds`);

            return {
                valid: true,
                standard: standardResult,
                structured: structuredJson,
                files: {
                    standard: path.join(this.outputDir, standardFilename),
                    structured: path.join(this.outputDir, structuredFilename)
                },
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000)
            };
        } catch (error) {
            console.error('❌ Error saving results:', error.message);
            throw error;
        }
    }

    /**
     * Create error result
     */
    createErrorResult(url, errorMessage, contentType = 'web', startTime = Date.now()) {
        try {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const result = {
                id: Utils.generateId(url),
                url,
                scraped_at: new Date().toISOString(),
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
                card: { 
                    name: null, 
                    bank: null, 
                    variant: null 
                },
                rewards: { 
                    program: null, 
                    type: null, 
                    earning: { 
                        base_rate: null, 
                        categories: [] 
                    }, 
                    redemption: [] 
                },
                benefits: [],
                current_offers: [],
                perks: [],
                partnerships: [],
                metadata: {
                    last_updated: new Date().toISOString(),
                    confidence_score: 0,
                    missing_data: ['error_occurred'],
                    processed_links: 0,
                    failed_links: 0,
                    total_links_found: 0,
                    content_type: contentType,
                    data_quality: 'error',
                    error: errorMessage,
                    extraction_completed_at: new Date().toISOString()
                }
            };

            const prefix = contentType === 'pdf' ? 'pdf_' : '';
            const errorFilename = `${prefix}error_${ts}.json`;
            
            fs.writeFileSync(
                path.join(this.outputDir, errorFilename), 
                JSON.stringify(result, null, 2)
            );
            
            console.log(`💾 Error details stored: json_results/${errorFilename}`);
            
            return { 
                valid: false, 
                reason: 'extraction_error',
                standard: result, 
                structured: {}, 
                files: { 
                    standard: path.join(this.outputDir, errorFilename) 
                },
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
                error: errorMessage
            };
        } catch (saveError) {
            console.error('❌ Error creating error result:', saveError.message);
            return {
                valid: false,
                reason: 'critical_error',
                error: `${errorMessage} | Save error: ${saveError.message}`,
                processing_time_seconds: Math.round((Date.now() - startTime) / 1000)
            };
        }
    }

    /**
     * Get crawler statistics
     */
    getStats() {
        const files = fs.readdirSync(this.outputDir);
        const pdfFiles = files.filter(f => f.startsWith('pdf_')).length;
        const webFiles = files.filter(f => !f.startsWith('pdf_') && !f.startsWith('error_')).length;
        const errorFiles = files.filter(f => f.startsWith('error_')).length;

        return {
            total_files: files.length,
            pdf_extractions: pdfFiles,
            web_extractions: webFiles,
            errors: errorFiles,
            success_rate: webFiles + pdfFiles > 0 ? 
                Math.round(((webFiles + pdfFiles) / (webFiles + pdfFiles + errorFiles)) * 100) : 0
        };
    }
}

module.exports = CardholderBenefitsCrawler;
