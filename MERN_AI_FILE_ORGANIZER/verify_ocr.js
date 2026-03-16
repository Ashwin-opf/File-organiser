const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'test_ocr_source');
const TEST_FILE = path.join(TEST_DIR, 'magic_rename_test.png');

async function runTest() {
    console.log("--- Starting OCR Renaming Verification ---");

    // 1. Setup
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE, "fake image content");
    console.log(`Created test file at: ${TEST_FILE}`);

    // 2. Call Organize API
    try {
        console.log("Sending organize request...");
        const response = await axios.post('http://localhost:5000/api/files/organize', {
            sourceFolder: TEST_DIR,
            command: '',
            options: { strategy: 'subfolders' }
        });

        console.log("Response:", JSON.stringify(response.data, null, 2));

        const result = response.data.results[0];
        if (!result) {
            console.error("❌ No result returned");
            return;
        }

        // Check if renamed
        const newPath = result.new_path;
        const newName = path.basename(newPath);

        if (newName.startsWith('Invoice_') && newName.endsWith('.png')) {
            console.log(`✅ Magic Renaming Successful: ${newName}`);
        } else {
            console.error(`❌ Renaming failed. Expected Invoice_..., got: ${newName}`);
        }

        // Check if categorized as Finance
        // The path should be .../test_ocr_source/Finance/Invoice_...
        // Wait, app_ai.py output: destination_folder = base_dir / "Finance"
        // But safeMove/organizeFile puts the file INSIDE.
        // So new_path should contain "Finance".

        if (newPath.includes('Finance')) {
            console.log("✅ Categorization Successful: Moved to Finance");
        } else {
            console.error(`❌ Categorization failed. Path: ${newPath}`);
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) console.error("API Error:", error.response.data);
    }
}

runTest();
