const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEST_DIR = path.join(__dirname, 'test_pii_source');
const VAULT_DIR = path.join(TEST_DIR, 'Secure_Vault');
const TEST_FILE = path.join(TEST_DIR, 'secret_plans.txt');

// Fake PII Data
const PII_CONTENT = `
Project X Plans
Contact: john.doe@example.com
Budget: $1,000,000
Credit Card for Expenses: 4532-1234-5678-9012
Do not share!
`;

async function runTest() {
    console.log("--- Starting PII Verification ---");

    // 1. Setup
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE, PII_CONTENT);
    console.log(`Created PII file at: ${TEST_FILE}`);

    // 2. Call Organize API (Assuming server is running)
    try {
        console.log("Sending organize request...");
        const response = await axios.post('http://localhost:5000/api/files/organize', {
            sourceFolder: TEST_DIR,
            command: '', // Auto
            options: { checkMalware: true }
        });

        console.log("Response:", JSON.stringify(response.data, null, 2));

        const result = response.data.results.find(r => r.original_path === TEST_FILE);

        if (!result) {
            console.error("❌ File was not processed.");
            return;
        }

        if (result.status === 'pii_secured') {
            console.log("✅ Status is 'pii_secured'");
        } else {
            console.error(`❌ Expected status 'pii_secured', got '${result.status}'`);
        }

        if (result.threat === 'Credit Card') {
            console.log("✅ Detected threat type 'Credit Card'");
        } else {
            console.error(`❌ Expected threat 'Credit Card', got '${result.threat}'`);
        }

        const expectedPath = path.join(VAULT_DIR, 'secret_plans.txt');
        if (fs.existsSync(expectedPath)) {
            console.log("✅ File successfully moved to Secure_Vault");
        } else {
            console.error(`❌ File not found in Secure_Vault. Checked: ${expectedPath}`);
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) console.error("API Error:", error.response.data);
    }
}

runTest();
