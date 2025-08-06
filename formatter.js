function decodeHtmlEntities(text) {
  if (!text) return '';
  
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '') // Remove zero-width spaces
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

function cleanText(rawText) {
  if (!rawText) return '';
  
  return decodeHtmlEntities(
    rawText
      .replace(/<[^>]*>/g, '') // remove HTML tags
      .replace(/→/g, '->') // replace arrow symbols
      .replace(/–/g, '-') // replace en-dash with hyphen
      .replace(/—/g, '-') // replace em-dash with hyphen
      .replace(/[''"]/g, "'") // normalize quotes
      .replace(/["'"]/g, '"') // normalize double quotes
      .replace(/\u00A0/g, ' ') // non-breaking space
      .replace(/\s*-\s*$/, '') // remove trailing dashes
      .replace(/^-\s*/, '') // remove leading dashes
      .trim()
  );
}

function formatRewardsSection(items) {
  const formatted = [];
  let currentGroup = null;

  for (const item of items) {
    const cleanItem = cleanText(item.text || item.main || item);
    
    // Skip empty items or links/references
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
      // Regular list item
      if (cleanItem) {
        formatted.push(cleanItem);
      }
    } else if (typeof item === 'string') {
      // Simple string item
      if (cleanItem) {
        formatted.push(cleanItem);
      }
    }
  }

  return formatted;
}

function formatStandardSection(items) {
  const formatted = [];

  for (const item of items) {
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

  return formatted;
}

function formatStepsSection(items) {
  const formatted = [];
  const steps = [];
  let currentStep = null;

  for (const item of items) {
    const cleanItem = cleanText(item.text || item.main || item);
    
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

  return steps.length > 0 ? [...formatted, ...steps] : formatted;
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