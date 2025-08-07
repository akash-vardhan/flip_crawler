function decodeHtmlEntities(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&rsquo;/g, "'")
        .replace(/&lsquo;/g, "'")
        .replace(/&hellip;/g, '...')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&prime;/g, "'")
        .replace(/&Prime;/g, '"')
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '') // Remove zero-width spaces
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
}

function cleanText(rawText) {
    if (!rawText) return '';
    
    // Convert to string if it's not already
    const textToClean = typeof rawText === 'string' ? rawText : String(rawText);
    
    return decodeHtmlEntities(
        textToClean
            .replace(/<[^>]*>/g, '') // remove HTML tags
            .replace(/→/g, '->') // replace arrow symbols
            .replace(/–/g, '-') // replace en-dash with hyphen
            .replace(/—/g, '-') // replace em-dash with hyphen
            .replace(/[''"]/g, "'") // normalize quotes
            .replace(/["'"]/g, '"') // normalize double quotes
            .replace(/\u00A0/g, ' ') // non-breaking space
            .replace(/\s*-\s*$/, '') // remove trailing dashes
            .replace(/^-\s*/, '') // remove leading dashes
            .replace(/->/g, ' -> ') // Add spaces around arrows for better readability
            .replace(/\s+/g, ' ') // Normalize multiple spaces
            .trim()
    );
}

function formatPDFContent(pdfData) {
    if (pdfData.status === 'error') {
        return {
            type: 'pdf_document',
            source_url: pdfData.source_url,
            status: 'error',
            error: pdfData.error
        };
    }
    
    // Clean and format PDF content
    let cleanedContent = pdfData.content
        .map(paragraph => cleanText(paragraph))
        .filter(paragraph => paragraph && paragraph.length > 10);
    
    // Break down very long paragraphs for better readability
    const formattedContent = [];
    for (const paragraph of cleanedContent) {
        if (paragraph.length > 500) {
            // Split long paragraphs by sentences or logical breaks
            const sentences = paragraph
                .split(/(?<=[.!?])\s+/)
                .filter(s => s.trim().length > 0);
            
            if (sentences.length > 1) {
                formattedContent.push(...sentences);
            } else {
                formattedContent.push(paragraph);
            }
        } else {
            formattedContent.push(paragraph);
        }
    }
    
    return {
        type: 'pdf_document',
        source_url: pdfData.source_url,
        status: 'success',
        content: formattedContent.slice(0, 100) // Increase limit for better content
    };
}

function formatWebPageContent(webData) {
    if (webData.status === 'error') {
        return {
            type: 'webpage_document',
            source_url: webData.source_url,
            status: 'error',
            error: webData.error
        };
    }
    
    const formattedContent = [];
    
    for (const item of webData.content) {
        const cleanedText = cleanText(item.text);
        if (cleanedText && cleanedText.length > 5) {
            formattedContent.push({
                type: item.type,
                content: cleanedText,
                ...(item.level && { level: item.level })
            });
        }
    }
    
    return {
        type: 'webpage_document',
        source_url: webData.source_url,
        status: 'success',
        content: formattedContent
    };
}

// Function to remove duplicate items from arrays
function removeDuplicates(items) {
    const seen = new Set();
    return items.filter(item => {
        const key = typeof item === 'string' ? item : JSON.stringify(item);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function formatRewardsSection(items) {
    const formatted = [];
    let currentGroup = null;

    for (const item of items) {
        // Handle linked content
        if (item.type === 'pdf_content') {
            formatted.push(formatPDFContent(item));
            continue;
        }
        
        if (item.type === 'webpage_content') {
            formatted.push(formatWebPageContent(item));
            continue;
        }
        
        if (item.type === 'link') {
            formatted.push({
                type: 'reference_link',
                text: cleanText(item.text),
                url: item.url
            });
            continue;
        }
        
        if (item.type === 'link_error') {
            formatted.push({
                type: 'link_error',
                source_url: item.source_url,
                error: item.error
            });
            continue;
        }
        
        // Get text content based on item type
        let textContent = '';
        if (typeof item === 'string') {
            textContent = item;
        } else if (item.text) {
            textContent = item.text;
        } else if (item.main) {
            textContent = item.main;
        }
        
        const cleanItem = cleanText(textContent);
        
        // Skip empty items or certain link references
        if (!cleanItem || cleanItem.includes('click here') || cleanItem.includes('Click here')) {
            continue;
        }

        if (item.type === 'list_item_with_sub') {
            // This is a main reward category with sub-items
            const mainText = cleanText(item.main);
            const subItems = item.sub_items
                .map(sub => cleanText(sub))
                .filter(sub => sub && !sub.includes('click here'))
                .map(sub => sub.replace(/^-\s*/, '').trim());

            if (mainText) {
                if (subItems.length > 0) {
                    currentGroup = {
                        title: mainText.endsWith(':') ? mainText : `${mainText}:`,
                        items: subItems
                    };
                    formatted.push(currentGroup);
                } else {
                    formatted.push(mainText);
                }
            }
        } else if (item.type === 'list_item') {
            if (cleanItem) {
                formatted.push(cleanItem);
            }
        } else if (typeof item === 'string') {
            if (cleanItem) {
                formatted.push(cleanItem);
            }
        }
    }

    return removeDuplicates(formatted);
}

function formatStandardSection(items) {
    const formatted = [];

    for (const item of items) {
        // Handle linked content
        if (item.type === 'pdf_content') {
            formatted.push(formatPDFContent(item));
            continue;
        }
        
        if (item.type === 'webpage_content') {
            formatted.push(formatWebPageContent(item));
            continue;
        }
        
        if (item.type === 'link') {
            formatted.push({
                type: 'reference_link',
                text: cleanText(item.text),
                url: item.url
            });
            continue;
        }
        
        if (item.type === 'link_error') {
            formatted.push({
                type: 'link_error',
                source_url: item.source_url,
                error: item.error
            });
            continue;
        }

        if (typeof item === 'string') {
            const cleaned = cleanText(item);
            if (cleaned && !cleaned.includes('click here') && !cleaned.includes('Click here')) {
                formatted.push(cleaned);
            }
        } else if (item.type === 'paragraph' || item.type === 'text') {
            const cleaned = cleanText(item.text);
            if (cleaned && !cleaned.includes('click here') && !cleaned.includes('Click here')) {
                formatted.push(cleaned);
            }
        } else if (item.type === 'list_item') {
            const cleaned = cleanText(item.text);
            if (cleaned && !cleaned.includes('click here') && !cleaned.includes('Click here')) {
                formatted.push(cleaned);
            }
        } else if (item.type === 'list_item_with_sub') {
            const mainText = cleanText(item.main);
            const subItems = item.sub_items
                .map(sub => cleanText(sub))
                .filter(sub => sub && !sub.includes('click here') && !sub.includes('Click here'));

            if (mainText) {
                if (subItems.length > 0) {
                    const group = {
                        title: mainText.endsWith(':') ? mainText : `${mainText}:`,
                        items: subItems
                    };
                    formatted.push(group);
                } else {
                    formatted.push(mainText);
                }
            }
        }
    }

    return removeDuplicates(formatted);
}

function formatStepsSection(items) {
    const formatted = [];
    const steps = [];
    let currentStep = null;

    for (const item of items) {
        // Handle linked content
        if (item.type === 'pdf_content') {
            formatted.push(formatPDFContent(item));
            continue;
        }
        
        if (item.type === 'webpage_content') {
            formatted.push(formatWebPageContent(item));
            continue;
        }
        
        if (item.type === 'link') {
            formatted.push({
                type: 'reference_link',
                text: cleanText(item.text),
                url: item.url
            });
            continue;
        }

        if (item.type === 'link_error') {
            formatted.push({
                type: 'link_error',
                source_url: item.source_url,
                error: item.error
            });
            continue;
        }

        // Get text content based on item type
        let textContent = '';
        if (typeof item === 'string') {
            textContent = item;
        } else if (item.text) {
            textContent = item.text;
        } else if (item.main) {
            textContent = item.main;
        }
        
        const cleanItem = cleanText(textContent);
        if (!cleanItem) continue;

        // Check if this is a step (starts with "Step 1:", "Step 2:", etc.)
        const stepMatch = cleanItem.match(/^(Step \d+):\s*(.*)/i);
        if (stepMatch) {
            if (currentStep) {
                steps.push(currentStep);
            }

            currentStep = {
                step: stepMatch[1],
                description: stepMatch[2]
            };
        } else if (cleanItem.match(/^\d+\.\s/)) {
            // Numbered item
            formatted.push(cleanItem);
        } else if (currentStep && item.type === 'list_item_with_sub' && item.sub_items) {
            // Sub-items for current step
            currentStep.sub_items = item.sub_items
                .map(sub => cleanText(sub))
                .filter(sub => sub);
        } else if (!cleanItem.includes('click here') && !cleanItem.includes('Click here')) {
            formatted.push(cleanItem);
        }
    }

    if (currentStep) {
        steps.push(currentStep);
    }

    const result = steps.length > 0 ? [...formatted, ...steps] : formatted;
    return removeDuplicates(result);
}

function formatSections(rawSections) {
    const formatted = {};

    for (const [sectionTitle, items] of Object.entries(rawSections)) {
        let formattedItems;

        // Special handling for different section types
        switch (sectionTitle.toLowerCase()) {
            case 'rewards':
                formattedItems = formatRewardsSection(items);
                break;
            case 'how to apply?':
            case 'how to activate your pixel card?':
            case 'servicing via help center':
                formattedItems = formatStepsSection(items);
                break;
            default:
                formattedItems = formatStandardSection(items);
                break;
        }

        // Only include sections with meaningful content
        if (formattedItems.length > 0) {
            formatted[sectionTitle] = formattedItems;
        }
    }

    return formatted;
}

module.exports = formatSections;
