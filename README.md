# Flip Crawler

**Flip Crawler** is a robust Node.js tool for crawling, extracting, and structuring credit card data from banking websites and PDFs. It combines traditional crawling with OpenAI-powered content extraction to produce comprehensive, machine-friendly JSON outputs for use in databases, comparison engines, or analytics.

---

## Features

- **Dual Extraction Modes**: Scrape listing pages for multiple credit cards or extract details from individual card pages/PDFs.
- **PDF Support**: Detects, downloads, and parses PDFs for card details.
- **AI-Powered Structuring**: Converts raw content into two detailed JSON formats using OpenAI. The scope of AI is limted to the provided web and pdf data and the links present in that data. No information from any other source can be added by AI to ensure accuracy.
- **URL Validation & Filtering**: Validates URLs before processing to avoid errors and inefficiencies.
- **Rich Metadata**: Tracks processing confidence, token usage, validation stats, and more.
- **Flexible, Extensible Output**: JSON outputs have detailed schemas, making them highly usable for downstream applications.

---

## Directory & Code Structure

```
flip_crawler/
├── index.js             # CLI entry point, orchestrates extraction modes
├── test.js              # Automated/test runner for all features (see below)
├── src/
│   ├── aiProcessor.js   # AI prompt engineering, OpenAI response parsing
│   ├── crawler.js       # Main crawl and output logic
│   ├── linkProcessor.js # Link classification, PDF detection, content summarization
│   ├── listingCrawler.js# Listing page extraction, summaries
│   ├── utils.js         # Utility functions (timing, ID generation, etc.)
│   └── ...              # Other helpers/processors
├── console_logs.txt     # Example logs, workflow trace
└── ...                  # Configs, docs, etc.
```

---

## Packages Used

### 1. **axios**
   - **Purpose**: Making HTTP requests efficiently to web pages and PDF URLs.
   - **Why**: Handles redirects, timeouts, and custom headers well, crucial for scraping real-world bank sites.

### 2. **cheerio**
   - **Purpose**: Fast HTML parsing and DOM querying, similar to jQuery.
   - **Why**: Extracts links, card data, and structured content from listing and card pages reliably.

### 3. **pdf-parse**
   - **Purpose**: Extracting text and metadata from downloaded PDF files.
   - **Why**: Many credit card details are provided in PDF brochures or T&C documents; this package enables robust text extraction.

### 4. **openai**
   - **Purpose**: Communicating with the OpenAI API for AI-powered content structuring.
   - **Why**: Converts unstructured scraped content into rich, standardized JSON formats.

### 5. **dotenv**
   - **Purpose**: Loads environment variables (such as API keys) from `.env` files.
   - **Why**: Keeps sensitive credentials out of code and supports local/test automation.

### 6. **fs-extra**
   - **Purpose**: Enhanced file system operations (reading, writing, ensuring directories).
   - **Why**: Safely saves output JSON files and logs, supports async/await and atomic operations.

### 7. **node-fetch** (or **cross-fetch**)
   - **Purpose**: Fetching resources over HTTP/S for environments where axios is not preferred.
   - **Why**: Lightweight HTTP client for downloading PDFs or remote resources.

### 8. **yargs**
   - **Purpose**: Command-line argument parsing for index.js and test.js.
   - **Why**: Allows flexible CLI usage, mode selection (`--listing`, `--single`), and configuration.

### 9. **chalk**
   - **Purpose**: Colorizing console outputs for summaries, errors, and logs.
   - **Why**: Improves readability during development and test runs.

### 10. **moment** (or **date-fns**)
   - **Purpose**: Date/time formatting and manipulation.
   - **Why**: Handles timestamps for metadata, output files, and logs.

---

## Output Structure (Detailed Specification)

### Listing Mode Output
```json
{
  "id": "unique_listing_id",
  "listing_url": "https://bank.example.com/cards",
  "scraped_at": "2025-08-20T13:07:13Z",
  "listing_summary": {
    "total_urls_found": 34,
    "valid_urls_after_validation": 32,
    "invalid_urls_filtered": 2,
    "url_validation_success_rate": 0.94,
    "cards_processed": 32,
    "cards_failed": 0,
    "processing_success_rate": 1.0,
    "processing_mode": "listing"
  },
  "url_validation_summary": {
    "total_checked": 34,
    "valid_urls": 32,
    "invalid_urls": 2
  },
  "cards": [
    {
      // See "Card Output" below
    }
  ],
  "failed_cards": [
    {
      "name": "Invalid Card",
      "processing_error": "404 Not Found"
    }
  ],
  "invalid_urls": [
    {
      "url": "https://bank.example.com/404",
      "error_type": "404_NOT_FOUND"
    }
  ],
  "token_summary": {
    "totalInputTokens": 12000,
    "totalOutputTokens": 5000,
    "totalTokens": 17000
  },
  "metadata": {
    "last_updated": "2025-08-20T13:07:13Z",
    "average_confidence": 0.98
  }
}
```

### Card Output (`cards[]` or single card result)

**Standard Format:**
```json
{
  "card": {
    "name": "Pixel Play Credit Card",
    "bank": "HDFC Bank",
    "variant": "Rupay",
    "description": "A card for tech-savvy customers...",
    "target_audience": "Millennials"
  },
  "rewards": {
    "program": "MyRewards",
    "type": "Cashback",
    "earning": {
      "base_rate": 1.5,
      "categories": [
        {
          "name": "Online Shopping",
          "rate": 2,
          "cap": 1000,
          "description": "Extra cashback on ecommerce",
          "terms_and_conditions": "...",
          "how_to_earn": "Use online",
          "validity": "2025-12-31",
          "exclusions": "Gift cards"
        }
      ],
      "bonus_rates": [
        {
          "condition": "Festivals",
          "rate": 5,
          "validity": "2025-11-01 to 2025-11-15",
          "terms_and_conditions": "Only for select merchants"
        }
      ]
    },
    "redemption": [
      {
        "method": "Statement Credit",
        "value": 1,
        "process": "Apply online",
        "minimum": 500,
        "validity": "2026-01-01"
      }
    ]
  },
  "features": {
    "contactless_payments": true,
    "app_management": ["AppName"],
    "security_features": ["2FA", "Fraud Alerts"]
  },
  "benefits": [
    {
      "category": "Travel",
      "name": "Lounge Access",
      "description": "Free lounge visits at airports",
      "how_to_avail": "Show card at counter",
      "value": "2 visits/month"
    }
  ],
  "current_offers": [
    {
      "title": "Welcome Bonus",
      "description": "Get ₹1000 cashback",
      "validity": "2025-10-31",
      "terms_and_conditions": "Min spend ₹5000",
      "activation_required": true,
      "how_to_activate": "Register on app",
      "maximum_benefit": "₹1000",
      "offer_code": "WELCOME1000"
    }
  ],
  "perks": [
    {
      "name": "Movie Discounts",
      "description": "20% off at BookMyShow",
      "category": "Entertainment"
    }
  ],
  "partnerships": [
    {
      "partner": "Amazon",
      "benefit": "5% extra cashback",
      "category": "Shopping",
      "discount_percentage": "5"
    }
  ],
  "fees_and_charges": [
    {
      "type": "Annual Fee",
      "amount": 500,
      "waiver_conditions": "Spend ₹50,000/year",
      "frequency": "Yearly"
    }
  ],
  "metadata": {
    "confidence_score": 0.99,
    "extraction_completed_at": "2025-08-20T13:07:13Z",
    "processed_links": 4,
    "token_usage": {
      "input_tokens": 4000,
      "output_tokens": 1500,
      "total_tokens": 5500
    }
  }
}
```

**Structured Format:** (Database-ready, key-indexed)
```json
{
  "Metadata": {
    "PK": "CARD#HDFC_BANK",
    "SK": "METADATA",
    "card_name": "Pixel Play Credit Card",
    "issuer": "HDFC Bank",
    "network": ["Rupay"],
    "type": "Credit Card",
    "category": ["Cashback"]
  },
  "features": {
    "PK": "CARD#HDFC_BANK",
    "SK": "FEATURES",
    "digital_onboarding": true,
    "contactless_payments": true,
    "customization_options": { "color": "Blue" },
    "app_management": ["HDFC App"],
    "security_features": ["2FA", "Fraud Alerts"]
  },
  "rewards": {
    "PK": "CARD#HDFC_BANK",
    "SK": "REWARDS",
    "reward_currency": "Cashback",
    "cashback_program": ["MyRewards"],
    "earning_structure": [
      {
        "category": "Online Shopping",
        "rate": 2.0,
        "cap": 1000,
        "terms_and_conditions": "...",
        "how_to_earn": "Use online",
        "validity": "2025-12-31"
      }
    ],
    "redemption": {
      "method": "Statement Credit",
      "value": 1,
      "process": "Apply online",
      "minimum": 500,
      "validity": "2026-01-01"
    }
  },
  "benefits": [
    {
      "PK": "CARD#HDFC_BANK",
      "SK": "BENEFITS#TRAVEL",
      "name": "Lounge Access",
      "description": "Free lounge visits",
      "how_to_avail": "Show card",
      "value": "2/month"
    }
  ],
  "partnerships": [
    {
      "PK": "CARD#HDFC_BANK",
      "SK": "PARTNERSHIP#AMAZON",
      "partner": "Amazon",
      "benefit": "5% extra cashback",
      "category": "Shopping"
    }
  ],
  "fees_and_charges": [
    {
      "PK": "CARD#HDFC_BANK",
      "SK": "FEE#ANNUAL",
      "type": "Annual Fee",
      "amount": 500,
      "waiver_conditions": "Spend ₹50,000/year",
      "frequency": "Yearly"
    }
  ],
  "related_docs": {
    "PK": "CARD#HDFC_BANK",
    "SK": "PDFS",
    "pdfs": [
      "https://www.hdfcbank.com/Personal/Pay/Cards/Credit%20Card/Credit%20Card%20Landing%20Page/my-rewards-oct-17.pdf"
    ]
  }
}
```

---

## Output File Saving Mechanism

### **Where Are Files Saved?**

- **Directory:** All output files are saved in the `json_results/` directory inside the project root.
- **Automatic Creation:** If the directory does not exist, it is automatically created using `fs-extra` to ensure safe, atomic operations.

### **What Do the Files Contain?**

- **Standard Output File (`_standard.json`):**
  - Human-readable card details, rewards, features, benefits, offers, partnerships, fees, perks, and metadata.
  - Ideal for reviews, comparison tools, or front-end display.

- **Structured Output File (`_structured.json`):**
  - Key-indexed, hierarchical data suitable for database ingestion and downstream analytics.
  - Contains metadata, features, rewards, partnerships, and PDF references, using explicit primary/secondary keys.

### **Why Save in This Way?**

- **Dual Format:** Allows both direct user consumption and seamless backend integration.
- **Traceability:** File names map directly to their source URLs, making audit and troubleshooting easy.
- **Atomicity & Safety:** Use of `fs-extra` ensures data is never corrupted, even for concurrent crawls.
- **Extensibility:** New fields or formats can be added without breaking existing outputs.

### **Example File Names**

- `hdfc_pixelplaycreditcard_standard_timestamp.json`
- `hdfc_pixelplaycredit_card_structured_timestamp.json`

### **Significance of Files**

- **Audit:** Each file is a snapshot of a processed card or crawl, useful for audits and debugging.
- **Versioning:** Multiple crawls or updates result in new files, allowing historical comparison.
- **Integration:** The clear separation of formats and summary files enables easy downstream automation, ingestion, and reporting.
- **Filtering:** The bank and card name along with timestamp explicitly present in file name gives the ability to filter data even before reading the content.

---

## `test.js` File

The `test.js` file provides automated, scriptable tests for the crawler. It supports:

- **End-to-end validation** of all modes:
  - Smart detection and full crawl of a URL with validation and AI-powered extraction.
  - Listing-only mode: Extracts and validates all card URLs from a page.
  - Single-card mode: Extracts details from a specific card URL.
- **Detailed Console Summaries**:
  - Processing time, URL validation stats, error breakdowns, token usage, confidence scores.
  - Per-card details: bank, benefits, offers, perks, partnerships, metadata, link status.
- **Saving Results**:
  - Outputs validated listing results to JSON files for review.
- **Configurable Delays**:
  - Supports customizable delays between requests, cards, and validations for throttling.
- **Error Handling**:
  - Logs and summarizes failed cards and URLs.

**Usage**:
```bash
node test.js              # Runs smart detection test on hardcoded URLs
node test.js --listing    # Runs listing extraction test only
node test.js --single     # Runs single card extraction test only
```

---

## Setup: Running Flip Crawler Locally

Follow these steps to set up and run Flip Crawler on your local machine:

### 1. **Clone the Repository**

```bash
git clone https://github.com/akash-vardhan/flip_crawler.git
cd flip_crawler
```

### 2. **Install Dependencies**

Make sure you have Node.js (v14 or above) installed. Then run:

```bash
npm install
```

This will install all required packages, including:
- axios
- cheerio
- pdf-parse
- openai
- dotenv
- fs-extra
- node-fetch (or cross-fetch)
- yargs
- chalk
- moment (or date-fns)

### 3. **Configure Environment Variables**

Create a `.env` file in the root directory and add your OpenAI API key:

```
OPENAI_API_KEY=your-openai-key-here
```

You may add other configuration variables as required by your workflow.

### 4. **Run the Crawler**

**Single Card Extraction:**

```bash
node index.js "https://www.examplebank.com/card-details/abc123" <openai-api-key> --single
```

**Listing Extraction:**

```bash
node index.js "https://www.examplebank.com/credit-cards" <openai-api-key> --listing
```

**Smart Detection (auto mode):**

```bash
node index.js "https://www.examplebank.com/cards" <openai-api-key>
```

**Run Automated Tests:**

```bash
node test.js
```
or test specific modes:
```bash
node test.js --single
node test.js --listing
```

### 5. **Find Your Output**

Results (JSON files) will be saved in the `json_results/` directory, created automatically if it doesn't exist.

### 6. **(Optional) Troubleshooting**

- Ensure your OpenAI API key is correct and active.
- If you encounter npm errors, try deleting `node_modules` and running `npm install` again.
- For additional configuration, refer to comments in `index.js`, `test.js`, or the relevant files in `src/`.

---

## Typical Workflow

1. **Run the CLI** (`index.js` or `test.js`) with the target URL and OpenAI key.
2. **Choose mode**: Listing, Single, or Auto-detect.
3. **Validate URLs**: Ensure only live, relevant card pages/PDFs are processed.
4. **Extract and Structure Content**: Use AI to convert content into two rich JSON formats.
5. **Review Console Output**: Check summaries, errors, and token usage.
6. **Save Outputs**: Results are saved in files for further analysis or integration.

---

## Requirements

- **Node.js** (v14+)
- **OpenAI API Key** (set in `.env` file for tests)
- **Network Access** (for crawling and downloading)

---

## Example Commands

**Full crawl (smart detection):**
```bash
node index.js "https://www.examplebank.com/credit-cards" <openai-api-key>
```
**Listing only:**
```bash
node test.js --listing
```
**Single card extraction:**
```bash
node test.js --single
```

---
