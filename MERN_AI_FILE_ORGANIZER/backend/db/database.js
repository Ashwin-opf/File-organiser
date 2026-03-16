const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

// Database path (store in backend/db/data.db or user data folder)
// For now, let's keep it in the project directory for simplicity, 
// but in production it should be app.getPath('userData')
const dbPath = process.env.DB_PATH || path.join(__dirname, 'file_organizer.db');

let db;

try {
    db = new Database(dbPath, { verbose: (msg) => logger.info(`DB: ${msg}`) });
    logger.info(`Connected to SQLite database at ${dbPath}`);
} catch (err) {
    logger.error(`Failed to connect to database: ${err.message}`);
    throw err;
}

// Initialize Schema
const initSchema = () => {
    // 1. Files Table (Track organized files)
    db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_path TEXT NOT NULL,
            new_path TEXT NOT NULL,
            hash TEXT,
            size INTEGER,
            organized_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. Rules Table (Replace CSV)
    db.exec(`
        CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 3. History Table (Replace in-memory transaction log for Undo)
    db.exec(`
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id TEXT NOT NULL,
            action_type TEXT NOT NULL, -- 'move', 'delete'
            original_path TEXT NOT NULL,
            new_path TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 4. Watched Folders Table (For Real-Time Automation)
    db.exec(`
        CREATE TABLE IF NOT EXISTS watched_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            is_active INTEGER DEFAULT 1, -- 1 = active, 0 = paused
            conflict_strategy TEXT DEFAULT 'smart_rename', -- 'smart_rename', 'skip', 'overwrite'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration for existing tables (if needed)
    try {
        db.prepare("ALTER TABLE watched_folders ADD COLUMN conflict_strategy TEXT DEFAULT 'smart_rename'").run();
    } catch (err) {
        // Column likely exists
    }

    logger.info("Database schema initialized.");
};

initSchema();

module.exports = db;
