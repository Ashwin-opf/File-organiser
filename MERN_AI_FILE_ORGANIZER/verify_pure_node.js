const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'test_pure_node');
const PII_FILE = path.join(TEST_DIR, 'secret.txt');
const INVOICE_FILE = path.join(TEST_DIR, 'invoice_scan.png');
const NORMAL_FILE = path.join(TEST_DIR, 'vacation.png');

async function runTest() {
    console.log("--- Starting Pure Node.js Verification ---");

    // 0. Setup
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // 1. Create PII File
    fs.writeFileSync(PII_FILE, "My credit card is 4111-1111-1111-1111");
    // 2. Create "Image" (mock OCR will trigger "Invoice")
    if (!fs.existsSync(path.join(TEST_DIR, 'Images'))) fs.mkdirSync(path.join(TEST_DIR, 'Images'));
    // We need to create a file that triggers OCR logic. 
    // Since we removed mock, we need real OCR or dependent on ONNX.
    // Wait, verification depends on Tesseract working or mocked. 
    // I reverted the mock in ocr.js. Tesseract might fail on empty file.
    // Let's create a text file for ONNX classification instead of full OCR complexity for this quick check.

    // 2. Create Keyword File for ONNX (filename based)
    const INVOICE_PDF = path.join(TEST_DIR, 'invoice_2024.pdf');
    fs.writeFileSync(INVOICE_PDF, "dummy content");

    console.log("Test files created.");

    // 3. Call Organize API
    try {
        console.log("Sending organize request...");
        const response = await axios.post('http://localhost:5000/api/files/organize', {
            sourceFolder: TEST_DIR,
            command: '',
            options: { strategy: 'subfolders' }
        });

        console.log("Response:", JSON.stringify(response.data, null, 2));

        const results = response.data.results;

        // Check PII
        const piiResult = results.find(r => r.original_path.includes('secret.txt'));
        if (piiResult && piiResult.status === 'pii_secured') {
            console.log("✅ PII Detection Worked (Pure Node)");
        } else {
            console.error("❌ PII Failed");
        }

        // Check ONNX/Metadata (invoice.pdf -> Finance)
        const invoiceResult = results.find(r => r.original_path.includes('invoice_2024.pdf'));
        // ONNX or Metadata should catch "invoice" -> Finance
        // Metadata: .pdf -> Documents? Keyword "invoice" -> Finance (in metadata.js too)
        // Let's see what it does.
        if (invoiceResult && invoiceResult.new_path.includes("Finance")) {
            console.log("✅ Categorization Worked (Finance)");
        } else {
            console.error(`❌ Categorization Failed: ${invoiceResult ? invoiceResult.new_path : 'No Result'}`);
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) console.error("API Error:", error.response.data);
    }
}

runTest();
