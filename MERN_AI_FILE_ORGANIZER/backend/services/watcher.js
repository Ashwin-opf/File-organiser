const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const logger = require('../utils/logger');
// We will need to import the core organization logic later
// const { processFile } = require('../controllers/fileController'); 

// Store active watchers: { folderPath: FSWatcher }
const activeWatchers = {};

// Initialize watchers from DB on startup
const initWatchers = async () => {
    try {
        const folders = db.prepare('SELECT * FROM watched_folders WHERE is_active = 1').all();
        for (const folder of folders) {
            startWatching(folder.folder_path);
        }
        logger.info(`Initialized ${folders.length} watchers.`);
    } catch (err) {
        logger.error(`Failed to init watchers: ${err.message}`);
    }
};

const startWatching = (folderPath) => {
    if (activeWatchers[folderPath]) return; // Already watching

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
        logger.warn(`Cannot watch non-existent folder: ${folderPath}`);
        return;
    }

    logger.info(`Starting watcher for: ${folderPath}`);

    const watcher = chokidar.watch(folderPath, {
        persistent: true,
        ignoreInitial: true, // Don't process existing files on startup
        depth: 0, // Only watch top-level files in this folder
        usePolling: true, // Ensure we catch events in all environments
        interval: 100, // Polling interval
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher.on('add', async (filePath) => {
        logger.info(`New file detected: ${filePath}`);

        // Fetch strategy for this folder
        const folderConfig = db.prepare('SELECT conflict_strategy FROM watched_folders WHERE folder_path = ?').get(folderPath);
        const strategy = folderConfig ? folderConfig.conflict_strategy : 'smart_rename';

        try {
            const fileController = require('../controllers/fileController');
            // We need a specific function for single file
            await fileController.processSingleFile(filePath, folderPath, { conflictStrategy: strategy });
        } catch (err) {
            logger.error(`Error processing watched file ${filePath}: ${err.message}`);
        }
    });

    activeWatchers[folderPath] = watcher;
};

const stopWatching = (folderPath) => {
    if (activeWatchers[folderPath]) {
        activeWatchers[folderPath].close();
        delete activeWatchers[folderPath];
        logger.info(`Stopped watching: ${folderPath}`);
    }
};

const addFolder = (folderPath) => {
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO watched_folders (folder_path) VALUES (?)');
        stmt.run(folderPath);
        startWatching(folderPath);
        return true;
    } catch (err) {
        logger.error(`Error adding watcher: ${err.message}`);
        throw err;
    }
};

const removeFolder = (folderPath) => {
    try {
        db.prepare('DELETE FROM watched_folders WHERE folder_path = ?').run(folderPath);
        stopWatching(folderPath);
        return true;
    } catch (err) {
        logger.error(`Error removing watcher: ${err.message}`);
        throw err;
    }
};

const listFolders = () => {
    return db.prepare('SELECT * FROM watched_folders').all();
};

const updateStatus = (folderPath, isActive) => {
    db.prepare('UPDATE watched_folders SET is_active = ? WHERE folder_path = ?')
        .run(isActive ? 1 : 0, folderPath);

    if (isActive) startWatching(folderPath);
    else stopWatching(folderPath);
};

const updateStrategy = (folderPath, strategy) => {
    db.prepare('UPDATE watched_folders SET conflict_strategy = ? WHERE folder_path = ?')
        .run(strategy, folderPath);
    logger.info(`Updated strategy for ${folderPath} to ${strategy}`);
};

module.exports = {
    initWatchers,
    addFolder,
    removeFolder,
    listFolders,
    updateStatus,
    updateStrategy
};
