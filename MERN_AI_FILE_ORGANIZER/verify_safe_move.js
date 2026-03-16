
const { safeMove } = require('./file-system-handler/fs_operations');
const fs = require('fs');
const path = require('path');

async function testSafeMove() {
    const testDir = path.join(__dirname, 'verification_results');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

    const src = path.join(testDir, 'test_src.txt');
    const dest = path.join(testDir, 'test_dest.txt');

    // Setup
    fs.writeFileSync(src, 'Hello World content');
    // Ensure dest exists to trigger rename
    fs.writeFileSync(dest, 'Existing content');

    console.log("Starting Safe Move Test...");
    try {
        const result = await safeMove(src, dest);
        console.log("Result:", result);

        if (result.renamed && result.newPath.includes('test_dest (1).txt')) {
            console.log("SUCCESS: Smart Rename worked!");
        } else {
            console.log("FAILURE: File was not renamed correctly.");
        }

        if (!fs.existsSync(src)) {
            console.log("SUCCESS: Source file deleted.");
        } else {
            console.log("FAILURE: Source file still exists.");
        }

    } catch (err) {
        console.error("TEST FAILED:", err);
    }
}

testSafeMove();
