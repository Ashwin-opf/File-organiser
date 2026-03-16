const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff'];
const PDF_EXTENSIONS = ['.pdf'];

async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
        if (IMAGE_EXTENSIONS.includes(ext)) {
            logger.info(`Starting OCR on image: ${filePath}`);

            const worker = await Tesseract.createWorker('eng');
            try {
                const { data: { text } } = await worker.recognize(filePath);
                await worker.terminate();
                return text.trim();
            } catch (tesseractErr) {
                logger.error(`Tesseract OCR failed specifically for ${filePath}: ${tesseractErr.message}`);
                try { await worker.terminate(); } catch (e) { }
                return null;
            }
        }
        else if (PDF_EXTENSIONS.includes(ext)) {
            logger.info(`Starting PDF parsing on: ${filePath}`);
            const dataBuffer = fs.readFileSync(filePath);

            let pdfFunc;
            try {
                // Dynamic import to handle ESM package correctly in CJS environment
                const pdfModule = await import('pdf-parse');
                pdfFunc = pdfModule.default || pdfModule;
            } catch (importErr) {
                pdfFunc = pdfParse;
            }

            if (typeof pdfFunc !== 'function') {
                pdfFunc = pdfFunc.default || pdfFunc.pdf || pdfFunc;
            }

            if (typeof pdfFunc === 'function') {
                const data = await pdfFunc(dataBuffer);
                return (data.text || '').substring(0, 2000).trim();
            } else {
                logger.warn(`pdf-parse is not a function for ${filePath}. Skipping content extraction.`);
                return null;
            }
        }
    } catch (error) {
        logger.error(`OCR/Text Extraction failed for ${filePath}: ${error.message}`);
    }

    return null;
}

module.exports = { extractText };
