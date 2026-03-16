const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

const testDir = path.join(__dirname, 'test_dataset');
const destDir = path.join(__dirname, 'test_organized');

// 1. Setup Data Set
function createTestDataset() {
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir);
    fs.mkdirSync(destDir);

    const files = {
        'invoice_jan.pdf': 'Dummy invoice PDF content',
        'holiday_pic.txt': 'Dummy pic text content',
        'script.py': 'print("hello")',
        'script2.txt': 'var x = 10; // testing another text developer file',
        'unknown_file.xyz': 'Unknown format data',
        'tax_return.docx': 'Dummy tax return document',
        'receipt_101.txt': 'Dummy receipt text content'
    };

    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(testDir, name), content);
    }
    console.log('Test dataset created.');
}

// 2. Start Services
async function runTest() {
    createTestDataset();

    const BACKEND_PORT = 5002;
    const AI_PORT = 5003;
    const testDbPath = path.join(__dirname, 'backend', 'test_file_organizer.db');

    // Cleanup old test DB
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }

    console.log(`Starting backend service on port ${BACKEND_PORT}...`);
    const backend = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, 'backend'),
        env: {
            ...process.env,
            PORT: BACKEND_PORT,
            AI_SERVICE_URL: `http://127.0.0.1:${AI_PORT}/analyze`,
            DB_PATH: testDbPath,
            NODE_ENV: 'test'
        }
    });

    console.log(`Starting AI service on port ${AI_PORT}...`);
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const aiService = spawn(pythonCmd, ['app_ai.py'], {
        cwd: path.join(__dirname, 'ai-service'),
        env: { ...process.env, PORT: AI_PORT }
    });

    let backendReady = false;
    let aiReady = false;

    backend.stdout.on('data', (d) => {
        const str = d.toString();
        process.stdout.write(`[Backend] ${str}`);
        if (str.includes('Server running')) backendReady = true;
    });
    backend.stderr.on('data', (d) => process.stderr.write(`[Backend ERR] ${d.toString()}`));

    aiService.stdout.on('data', (d) => {
        const str = d.toString();
        process.stdout.write(`[AI] ${str}`);
        if (str.includes('Running on')) aiReady = true;
    });
    aiService.stderr.on('data', (d) => process.stderr.write(`[AI ERR] ${d.toString()}`));

    // Polling for readiness
    console.log('Waiting for services to be ready...');
    for (let i = 0; i < 30; i++) {
        if (backendReady && aiReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!backendReady || !aiReady) {
        console.warn('One or both services might not be ready, but proceeding anyway...');
    } else {
        console.log('Services ready! Triggering organize...');
    }

    // Wrap API call in a retry loop to handle transient ECONNRESET
    let response;
    let attempts = 0;
    while (attempts < 5) {
        try {
            response = await axios.post(`http://127.0.0.1:${BACKEND_PORT}/api/files/organize`, {
                sourceFolder: testDir,
                destinationFolder: destDir,
                options: { checkMalware: false, strategy: 'subfolders', dryRun: false }
            });
            break; // Success!
        } catch (err) {
            attempts++;
            console.error(`Attempt ${attempts} failed: ${err.message}`);
            if (attempts >= 5) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (response) {
        console.log('Organization Result:', JSON.stringify(response.data, null, 2));

        // Verification of organized files
        if (response.data && response.data.results) {
            const results = response.data.results;
            let allGood = true;
            results.forEach(r => {
                if (r.new_path) {
                    const exists = fs.existsSync(r.new_path);
                    console.log(`Verification: ${r.file} -> ${r.new_path} : ${exists ? 'OK' : 'MISSING'}`);
                    if (!exists) allGood = false;
                }
            });
            console.log('Verification Result:', allGood ? 'SUCCESS' : 'FAILURE');
        }
    }

    console.log('Killing test services...');
    backend.kill();
    aiService.kill();
}

runTest();
