const axios = require('axios');
const cheerio = require('cheerio');

const TARGET_URL = 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/pixel-play-credit-card';

function extractContentFromElement($, element) {
  const content = [];
  
  // Extract paragraphs first
  $(element).find('p').each((_, p) => {
    const text = $(p).text().trim();
    if (text && text.length > 0) {
      content.push({
        type: 'paragraph',
        text: text
      });
    }
  });
  
  // Extract list items with their HTML structure
  $(element).find('ul li').each((_, li) => {
    const $li = $(li);
    const htmlContent = $li.html() || '';
    
    // Get the main text content
    let mainText = $li.clone().children().remove().end().text().trim();
    
    // If main text is empty, get all text
    if (!mainText) {
      mainText = $li.text().trim();
    }
    
    if (mainText) {
      // Check for sub-items (br tags or nested content)
      const hasBreaks = htmlContent.includes('<br');
      const hasSubContent = $li.find('*').length > 0;
      
      if (hasBreaks || hasSubContent) {
        // Split by br tags and clean up
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
            text: mainText
          });
        }
      } else {
        content.push({
          type: 'list_item',
          text: mainText
        });
      }
    }
  });
  
  // Extract any links
  $(element).find('a').each((_, link) => {
    const $link = $(link);
    const linkText = $link.text().trim();
    const href = $link.attr('href');
    
    if (linkText && href && !href.startsWith('javascript:')) {
      content.push({
        type: 'link',
        text: linkText,
        url: href
      });
    }
  });
  
  // If no structured content found, get all text
  if (content.length === 0) {
    const allText = $(element).text().trim();
    if (allText) {
      content.push({
        type: 'text',
        text: allText
      });
    }
  }
  
  return content;
}

async function fetchSections() {
  try {
    console.log('Fetching data from HDFC Bank...');
    const { data: html } = await axios.get(TARGET_URL);
    const $ = cheerio.load(html);
    const sections = {};
    let sectionCount = 0;

    // Find all content-body rows
    $('.row.content-body').each((_, row) => {
      const $row = $(row);
      const leftSection = $row.find('.left-section');
      const rightSection = $row.find('.right-section');
      
      // Get section title from left section
      const titleElement = leftSection.find('.row-name, h4').first();
      let sectionTitle = '';
      
      if (titleElement.length > 0) {
        sectionTitle = titleElement.text().trim();
        // Remove any zero-width characters
        sectionTitle = sectionTitle.replace(/[\u200B-\u200D\uFEFF]/g, '');
      }
      
      // Skip if no title found or title is empty
      if (!sectionTitle || sectionTitle.length === 0) {
        return;
      }
      
      // Extract content from right section
      const content = extractContentFromElement($, rightSection);
      
      if (content.length > 0) {
        sections[sectionTitle] = content;
        sectionCount++;
        console.log(`✓ Extracted: ${sectionTitle}`);
      }
    });

    console.log(`Total sections extracted: ${sectionCount}`);
    return sections;
    
  } catch (error) {
    console.error('Error fetching data:', error.message);
    throw error;
  }
}

module.exports = fetchSections;