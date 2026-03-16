
const db = require('./backend/db/database');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

async function testPhase2() {
    console.log("--- Testing Phase 2: SQLite & Workers ---");

    // 1. Test Database
    console.log("\n1. Testing SQLite Rules...");
    try {
        const insert = db.prepare('INSERT INTO rules (keyword, category) VALUES (?, ?)');
        insert.run('verif_test_keyword', 'TestCategory');

        const rule = db.prepare('SELECT * FROM rules WHERE keyword = ?').get('verif_test_keyword');
        if (rule && rule.category === 'TestCategory') {
            console.log("SUCCESS: Rule inserted and retrieved from DB.");
        } else {
            console.error("FAILURE: Rule not found in DB.");
        }

        // Clean up
        db.prepare('DELETE FROM rules WHERE keyword = ?').run('verif_test_keyword');

    } catch (err) {
        console.error("DB TEST FAILED:", err);
    }

    // 2. Test Worker
    console.log("\n2. Testing Hash Worker...");
    const testDir = path.join(__dirname, 'backend'); // Scan backend folder
    const workerPath = path.join(__dirname, 'backend/workers/hashWorker.js');

    try {
        const worker = new Worker(workerPath);
        worker.postMessage({ folderPath: testDir });

        await new Promise((resolve) => {
            worker.on('message', (msg) => {
                if (msg.status === 'success') {
                    console.log(`SUCCESS: Worker finished. Found ${msg.data.length} duplicate groups.`);
                } else {
                    console.error("FAILURE: Worker returned error:", msg.error);
                }
                worker.terminate();
                resolve();
            });
            worker.on('error', (err) => {
                console.error("FAILURE: Worker crashed:", err);
                worker.terminate();
                resolve();
            });
        });

    } catch (err) {
        console.error("WORKER TEST FAILED:", err);
    }
}

testPhase2();
