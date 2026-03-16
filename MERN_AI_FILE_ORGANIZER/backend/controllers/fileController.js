const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const logger = require('../utils/logger');
const db = require('../db/database');
const ocr = require('../utils/ocr');
const fileSystem = require('../../file-system-handler/fs_operations');
const aiService = require('../services/aiService');
const vectorDb = require('../services/vectorDb'); // Import Vector DB

// Core logic extracted for reusability (Watcher & API)
async function processOrganization(files, sourceFolder, destinationFolder, options = {}) {
    if (!files || files.length === 0) return { results: [] };

    logger.info(`Processing ${files.length} files from ${sourceFolder}`);

    // OCR / Text Extraction
    const context = {};
    for (const file of files) {
        try {
            const text = await ocr.extractText(file);
            if (text) {
                logger.info(`Extracted text from ${path.basename(file)}: ${text.substring(0, 50)}...`);
                const absPath = path.resolve(file);
                context[file] = text;
                context[absPath] = text;
            }
        } catch (e) {
            logger.warn(`OCR skipped for ${file}: ${e.message}`);
        }
    }

    // Native AI Analysis
    const actions = [];
    for (const file of files) {
        try {
            const action = await aiService.analyzeFile(file, context[file], {
                destination_override: destinationFolder,
                ...options
            });
            actions.push(action);
        } catch (error) {
            logger.error(`AI Analysis failed for ${file}: ${error.message}`);
            actions.push({ file: file, status: 'error', error: error.message });
        }
    }

    const results = [];
    const batchId = Date.now().toString();

    // Prepare DB statements
    const insertHistory = db.prepare('INSERT INTO history (batch_id, action_type, original_path, new_path) VALUES (?, ?, ?, ?)');
    const insertFile = db.prepare('INSERT INTO files (original_path, new_path) VALUES (?, ?)');

    for (const action of actions) {
        if (action.status === 'malware_detected') {
            const threatMsg = `Blocked: ${action.threat}`;
            insertHistory.run(batchId, 'malware', action.file, threatMsg);
            results.push({ file: action.file, status: 'malware_detected', error: 'Malware detected', threat: action.threat });
            continue;
        }
        if (action.status === 'pii_detected') {
            logger.warn(`PII Detected (${action.threat}) in ${action.file}. Moving to Secure Vault.`);
        }

        if (action.status === 'skipped') {
            results.push({ file: action.file, status: 'skipped', error: action.error });
            continue;
        }

        if (action.operation === 'move' && action.destination_folder) {
            try {
                let targetFile = action.file;
                let finalPath = path.join(action.destination_folder, path.basename(targetFile));

                // Magic Renaming Logic (Simulation)
                if (action.new_filename) {
                    finalPath = path.join(action.destination_folder, action.new_filename);
                }

                // DRY RUN CHECK
                if (options.dryRun) {
                    results.push({
                        file: action.file,
                        original_path: action.file,
                        new_path: finalPath, // Simulated path
                        status: 'dry_run',
                        threat: action.threat,
                        category: path.basename(action.destination_folder)
                    });
                    continue; // Skip actual move
                }

                // ... Actual Move Logic ...

                // Magic Renaming: If AI suggests a new name
                if (action.new_filename) {
                    const tempPath = path.join(path.dirname(action.file), action.new_filename);
                    if (tempPath !== action.file) {
                        try {
                            const renameResult = await fileSystem.safeMove(action.file, tempPath);
                            targetFile = renameResult.newPath;
                            logger.info(`Magic Rename: ${path.basename(action.file)} -> ${action.new_filename}`);
                        } catch (renameErr) {
                            logger.warn(`Magic Rename failed, proceeding with original name: ${renameErr.message}`);
                        }
                    }
                }

                // Use organizeFile to handle folder+filename construction
                const moveResult = await fileSystem.organizeFile(targetFile, action.destination_folder);

                // DB Log
                insertHistory.run(batchId, 'move', action.file, moveResult.newPath);
                insertFile.run(action.file, moveResult.newPath);

                // --- VECTOR DB INDEXING ---
                try {
                    const originalText = context[action.file] || "";
                    const category = path.basename(action.destination_folder); // Infer category from folder
                    await vectorDb.upsertFile({
                        path: moveResult.newPath,
                        text: originalText + " " + path.basename(moveResult.newPath), // Index text + filename
                        category: category
                    });
                } catch (vecErr) {
                    logger.warn(`Vector Indexing failed (non-critical): ${vecErr.message}`);
                }
                // ---------------------------

                results.push({
                    file: action.file,
                    original_path: action.file,
                    new_path: moveResult.newPath,
                    status: action.status === 'pii_detected' ? 'pii_secured' : 'success',
                    threat: action.threat
                });
            } catch (fsError) {
                logger.error(`Move failed for ${action.file}: ${fsError.message}`);
                insertHistory.run(batchId, 'error', action.file, fsError.message);
                results.push({ file: action.file, status: 'error', error: fsError.message });
            }
        } else {
            results.push({ file: action.file, status: 'skipped', error: 'No valid action' });
        }
    }

    return {
        intent: "organize",
        results: results
    };
}

// ... (Rest of processSingleFile, organizeFiles) ...

exports.getHistory = async (req, res) => {
    try {
        const history = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 50').all();
        res.json({ history });
    } catch (error) {
        logger.error(`Get History error: ${error.message}`);
        res.status(500).json({ error: "Failed to fetch history" });
    }
};

// ... (Rest of exports) ...

// Single file processor for Watcher
async function processSingleFile(filePath, sourceFolder) {
    // Wait a bit for file write to complete (debounce hack)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if file still exists
    if (!fs.existsSync(filePath)) return;

    return processOrganization([filePath], sourceFolder, null, { command: '' });
}

// Controller to handle file organization request
exports.organizeFiles = async (req, res) => {
    try {
        const { command, sourceFolder, destinationFolder, options } = req.body;

        if (!sourceFolder) {
            return res.status(400).json({ error: "Source folder is required" });
        }

        // 1. Scan the directory
        let files;
        try {
            const dirEnts = await fs.promises.readdir(sourceFolder, { withFileTypes: true });
            files = dirEnts
                .filter(dirent => dirent.isFile() && !dirent.name.startsWith('.') && dirent.name !== 'node_modules')
                .map(dirent => path.join(sourceFolder, dirent.name));
        } catch (readErr) {
            logger.error(`Error reading directory: ${readErr}`);
            return res.status(500).json({ error: `Could not read folder: ${readErr.message}` });
        }

        if (files.length === 0) {
            return res.json({ intent: "no_files", results: [], message: "No files found." });
        }

        // 2. Delegate to core logic
        const result = await processOrganization(files, sourceFolder, destinationFolder, { ...options, command });
        res.json(result);

    } catch (error) {
        logger.error(`Error in organizeFiles: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.processSingleFile = processSingleFile;

// Search Files (Semantic)
exports.searchFiles = async (req, res) => {
    try {
        const { query } = req.query; // GET /search?query=...
        if (!query) return res.status(400).json({ error: "Query required" });

        const results = await vectorDb.search(query);
        res.json({ results });
    } catch (error) {
        logger.error(`Search error: ${error.message}`);
        res.status(500).json({ error: "Search failed" });
    }
};

// Undo using SQLite History
exports.undoLastOperation = async (req, res) => {
    try {
        // Get last batch ID
        const lastEntry = db.prepare('SELECT batch_id FROM history ORDER BY id DESC LIMIT 1').get();

        if (!lastEntry) {
            return res.status(400).json({ message: "Nothing to undo" });
        }

        const batchId = lastEntry.batch_id;
        const actions = db.prepare('SELECT * FROM history WHERE batch_id = ? ORDER BY id DESC').all(batchId);

        const stats = { restored: 0, errors: 0, details: [] };

        for (const action of actions) {
            try {
                if (action.action_type === 'move') {
                    const targetDir = path.dirname(action.original_path);
                    await fs.promises.mkdir(targetDir, { recursive: true });
                    await fs.promises.rename(action.new_path, action.original_path);
                    stats.restored++;
                    stats.details.push(`Restored: ${path.basename(action.new_path)}`);
                }
            } catch (err) {
                logger.error(`Undo failed for ${action.new_path}: ${err.message}`);
                stats.errors++;
                stats.details.push(`Failed: ${path.basename(action.new_path)}`);
            }
        }

        // Clean up history
        db.prepare('DELETE FROM history WHERE batch_id = ?').run(batchId);

        res.json({ message: `Undo complete. Restored ${stats.restored} files.`, stats });

    } catch (error) {
        logger.error(`Undo error: ${error.message}`);
        res.status(500).json({ error: "Undo operation failed" });
    }
};

// Scan for duplicates using Worker Thread
exports.scanDuplicates = async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: "Folder path required" });

        logger.info(`Starting duplicate scan for: ${folderPath}`);

        // Spawn Worker
        const workerPath = path.join(__dirname, '../workers/hashWorker.js');
        const worker = new Worker(workerPath);

        worker.postMessage({ folderPath });

        worker.on('message', (message) => {
            if (message.status === 'success') {
                logger.info(`Worker scan complete. Found ${message.data.length} duplicates.`);
                res.json({ duplicates: message.data });
            } else {
                logger.error(`Worker error: ${message.error}`);
                res.status(500).json({ error: message.error });
            }
            worker.terminate();
        });

        worker.on('error', (err) => {
            logger.error(`Worker thread error: ${err.message}`);
            res.status(500).json({ error: err.message });
            worker.terminate();
        });

    } catch (error) {
        logger.error(`Duplicate scan launch error: ${error.message}`);
        res.status(500).json({ error: "Failed to start scan" });
    }
};

// Delete files
exports.deleteFiles = async (req, res) => {
    try {
        const { files } = req.body;
        if (!files || !Array.isArray(files)) return res.status(400).json({ error: "Invalid file list" });

        const results = [];
        for (const filePath of files) {
            try {
                await fs.promises.unlink(filePath);
                results.push({ file: filePath, status: "deleted" });
            } catch (err) {
                results.push({ file: filePath, status: "error", error: err.message });
            }
        }
        res.json({ results });
    } catch (error) {
        logger.error(`Delete error: ${error.message}`);
        res.status(500).json({ error: "Delete failed" });
    }
};

// Get Folder Stats
exports.getFolderStats = async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: "Folder path required" });

        const stats = { totalFiles: 0, totalSize: 0, byType: {}, security: { malwareBlocked: 0, piiFiles: 0 } };

        // 1. Get Malware Count from DB (Global count or per folder? Let's do Global for now as threats are threats)
        // Or if we want per folder, we'd need to track source folder in history. 
        // For MVP, let's show total threats blocked system-wide as it's more impressive/useful context.
        const malwareResult = db.prepare("SELECT COUNT(*) as count FROM history WHERE action_type = 'malware'").get();
        stats.security.malwareBlocked = malwareResult ? malwareResult.count : 0;

        // 2. Get PII Count (Files in Secure_Vault inside the selected folder)
        const vaultPath = path.join(folderPath, 'Secure_Vault');
        if (fs.existsSync(vaultPath)) {
            try {
                const vaultFiles = await fs.promises.readdir(vaultPath);
                // Filter out system files like .DS_Store
                const realFiles = vaultFiles.filter(f => !f.startsWith('.'));
                stats.security.piiFiles = realFiles.length;
            } catch (err) {
                // Ignore error if vault is not readable
            }
        }

        async function scanStats(dir) {
            const files = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const dirent of files) {
                if (['node_modules', '.git'].includes(dirent.name)) continue;
                if (dirent.name.startsWith('.')) continue;

                const fullPath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    await scanStats(fullPath);
                } else if (dirent.isFile()) {
                    const { size } = await fs.promises.stat(fullPath);
                    const ext = path.extname(dirent.name).toLowerCase() || 'unknown';
                    stats.totalFiles++;
                    stats.totalSize += size;
                    stats.byType[ext] = (stats.byType[ext] || 0) + 1;
                }
            }
        }

        await scanStats(folderPath);
        res.json({ stats });
    } catch (error) {
        logger.error(`Stats error: ${error.message}`);
        res.status(500).json({ error: "Failed to get stats" });
    }
};

// Get Rules from DB
exports.getRules = async (req, res) => {
    try {
        const rules = db.prepare('SELECT keyword as text, category FROM rules').all();
        res.json({ rules });
    } catch (error) {
        logger.error(`Get Rules error: ${error.message}`);
        res.status(500).json({ error: "Failed to load rules" });
    }
};

// Save Rules to DB
exports.saveRules = async (req, res) => {
    try {
        const { rules } = req.body;
        if (!rules || !Array.isArray(rules)) return res.status(400).json({ error: "Invalid rules" });

        const deleteStmt = db.prepare('DELETE FROM rules');
        const insertStmt = db.prepare('INSERT INTO rules (keyword, category) VALUES (?, ?)');

        const transaction = db.transaction((rules) => {
            deleteStmt.run();
            for (const rule of rules) {
                if (rule.text && rule.category) {
                    insertStmt.run(rule.text.trim(), rule.category.trim());
                }
            }
        });

        transaction(rules);
        logger.info('Rules updated in DB');
        res.json({ message: "Rules saved successfully" });
    } catch (error) {
        logger.error(`Save Rules error: ${error.message}`);
        res.status(500).json({ error: "Failed to save rules" });
    }
};

// Image Deduplication (Perceptual Hash)
exports.scanImageDuplicates = async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: "Folder path required" });

        logger.info(`Starting Image Deduplication Scan for: ${folderPath}`);

        const worker = new Worker(path.join(__dirname, '../workers/imageHashWorker.js'));

        worker.postMessage({ folderPath });

        worker.on('message', (msg) => {
            if (msg.status === 'success') {
                res.json({ duplicates: msg.data });
            } else {
                res.status(500).json({ error: msg.error });
            }
            worker.terminate();
        });

        worker.on('error', (err) => {
            logger.error(`Image Worker Error: ${err.message}`);
            res.status(500).json({ error: err.message });
            worker.terminate();
        });

    } catch (error) {
        logger.error(`Image Deduplication Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};
