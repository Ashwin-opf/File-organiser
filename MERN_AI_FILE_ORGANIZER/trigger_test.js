const fs = require('fs');
const path = require('path');
const axios = require('axios');

const testDir = path.join(__dirname, 'test_dataset');
const destDir = path.join(__dirname, 'test_organized');

function createTestDataset() {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(testDir);
    fs.mkdirSync(destDir);

    const files = {
        'invoice_jan.txt': 'Dummy invoice text content for billing',
        'script.js': 'console.log("hello");',
        'unknown_file.xyz': 'Unknown format data',
        'tax_return.txt': 'Dummy tax return text document',
        'app_log.log': 'Error: system failure at line 100',
        'data.json': '{"name": "test", "type": "data"}',
        'project_budget.csv': 'id,amount,description\n1,500,software',
        'meeting_notes.md': '# Sync Meeting\nDiscussed architecture',
        'vector_graphic.svg': '<svg><circle cx="50" cy="50" r="40" /></svg>',
        'database_dump.sql': 'SELECT * FROM users;',
        'resume_final.txt': 'Experience: 5 years in software engineering. Education: BS CS.',
        'passwords.txt': 'admin123!@#',
        'movie_clip.mp4': 'dummy mp4 content here',
        'audio_song.mp3': 'dummy mp3 data',
        'backup_archive.zip': 'PK\x03\x04 zip file content',
        'server_logs.7z': '7z header dummy'
    };

    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(testDir, name), content);
    }
    console.log('Test dataset created.');
}

async function runTest() {
    createTestDataset();
    console.log('Sending request to organize...');
    try {
        const response = await axios.post('http://127.0.0.1:5000/api/files/organize', {
            sourceFolder: testDir,
            destinationFolder: destDir,
            options: { checkMalware: false, strategy: 'subfolders', dryRun: false }
        });
        console.log('Organization Result:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error('API Error:', err.response?.data || err.message);
    }
}

runTest();
