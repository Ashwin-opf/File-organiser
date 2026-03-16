const fs = require('fs');
const AhoCorasick = require('./aho_corasick');

const PII_PATTERNS = {
    "Email": /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    "Credit Card": /\b(?:\d{4}[-\s]?){3}\d{4}\b/,
    "Indian Phone": /(?:\+91[\-\s]?)?[6-9]\d{9}\b/,
    "Passport": /\b[A-Z][0-9]{7}\b/
};

// Static PII Keywords for Fast Scanning
const PII_KEYWORDS = [
    "Confidential", "Private", "Secret", "SSN", "Social Security",
    "Passport Number", "Credit Card Number", "DOB", "Date of Birth"
];
const acScanner = new AhoCorasick(PII_KEYWORDS);

const TEXT_EXTENSIONS = ['.txt', '.csv', '.log', '.md', '.json', '.xml', '.html', '.js', '.py'];

async function scanFile(filePath) {
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();

    if (!TEXT_EXTENSIONS.includes(ext)) return { is_pii: false };

    try {
        // Read first 512KB
        const handle = await fs.promises.open(filePath, 'r');
        const buffer = Buffer.alloc(512 * 1024);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        await handle.close();

        const content = buffer.toString('utf8', 0, bytesRead);

        // 1. Fast Keyword Scan (Aho-Corasick)
        const matches = acScanner.search(content);
        if (matches.length > 0) {
            return { is_pii: true, type: `Keyword: ${matches[0].keyword}` };
        }

        // 2. Regex Scan (Details)
        for (const [type, regex] of Object.entries(PII_PATTERNS)) {
            if (regex.test(content)) {
                return { is_pii: true, type: type };
            }
        }
    } catch (error) {
        console.error(`PII Scan Error for ${filePath}: ${error.message}`);
    }

    return { is_pii: false };
}

module.exports = { scanFile };
