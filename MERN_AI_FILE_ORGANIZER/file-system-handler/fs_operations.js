const fs = require('fs');
const path = require('path');
const util = require('util');
const crypto = require('crypto');
const logger = require('../backend/utils/logger'); // Import Logger

// Promisify fs functions for async/await
const rename = util.promisify(fs.rename);
const mkdir = util.promisify(fs.mkdir);
const stat = util.promisify(fs.stat);
const copyFile = util.promisify(fs.copyFile);
const unlink = util.promisify(fs.unlink);
const access = util.promisify(fs.access);
const readFile = util.promisify(fs.readFile);
const appendFile = util.promisify(fs.appendFile);

/**
 * Calculate SHA-256 Checksum of a file
 * @param {string} filePath 
 * @returns {Promise<string>} Hex hash
 */
async function calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}

/**
 * Log operation for Rollback
 * @param {object} entry 
 */
async function logRollback(entry) {
    try {
        const logPath = path.join(path.dirname(__dirname), 'backend', 'rollback.log');
        const logEntry = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
        await appendFile(logPath, logEntry);
    } catch (err) {
        logger.error(`Failed to write to rollback log: ${err.message}`);
    }
}

/**
 * Smart Rename: If file exists, append (1), (2), etc.
 * @param {string} filePath - Original destination path
 * @returns {Promise<string>} - Unique path
 */
async function getUniquePath(filePath) {
    let dirname = path.dirname(filePath);
    let ext = path.extname(filePath);
    let basename = path.basename(filePath, ext);

    let newPath = filePath;
    let counter = 1;

    try {
        while (true) {
            try {
                await access(newPath); // Check if exists
                // If we are here, it exists. Prepare next name.
                newPath = path.join(dirname, `${basename} (${counter})${ext}`);
                counter++;
            } catch (err) {
                if (err.code === 'ENOENT') return newPath;
                throw err;
            }
        }
    } catch (err) {
        throw err;
    }
}

/**
 * Safe Atomic Move: Copy -> Verify -> Delete
 * @param {string} sourcePath 
 * @param {string} destPath 
 * @returns {Promise<{newPath: string, originalPath: string, renamed: boolean}>}
 */
const os = require('os');

/**
 * Shadow Backup: Save a copy before modification
 */
async function createShadowBackup(sourcePath) {
    try {
        const backupBase = path.join(os.homedir(), 'Documents', '.mern_ai_shadow_backup');
        const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const backupDir = path.join(backupBase, dateFolder);

        if (!fs.existsSync(backupDir)) {
            await mkdir(backupDir, { recursive: true });
        }

        const fileName = path.basename(sourcePath);
        const backupPath = path.join(backupDir, `${Date.now()}_${fileName}`); // Timestamp to avoid overwrite

        await copyFile(sourcePath, backupPath);
        // logger.info(`Shadow backup created: ${backupPath}`); // Verbose log
    } catch (err) {
        logger.warn(`Shadow backup failed for ${sourcePath}: ${err.message}`);
        // Non-blocking: continue even if backup fails? 
        // For "Industrial Strength", maybe we should block. But let's log warn for now.
    }
}

/**
 * Safe Atomic Move: Copy -> Verify -> Delete
 * @param {string} sourcePath 
 * @param {string} destPath 
 * @returns {Promise<{newPath: string, originalPath: string, renamed: boolean}>}
 */
async function safeMove(sourcePath, destPath) {
    try {
        // 1. Ensure absolute paths
        sourcePath = path.resolve(sourcePath);
        destPath = path.resolve(destPath);

        // --- SHADOW BACKUP ---
        await createShadowBackup(sourcePath);
        // ---------------------

        // 2. Resolve conflicts (Smart Rename)
        const finalDestPath = await getUniquePath(destPath);

        // Ensure dest directory exists
        const destDir = path.dirname(finalDestPath);
        if (!fs.existsSync(destDir)) {
            await mkdir(destDir, { recursive: true });
        }

        logger.info(`Starting atomic move: ${sourcePath} -> ${finalDestPath}`);

        // 3. Calculate Source Checksum (Pre-Copy)
        const sourceChecksum = await calculateChecksum(sourcePath);

        // 4. Copy File
        await copyFile(sourcePath, finalDestPath);

        // 5. Verify Copy (Checksum check)
        const destChecksum = await calculateChecksum(finalDestPath);

        if (sourceChecksum !== destChecksum) {
            logger.error(`Copy verification failed for ${sourcePath}. Checksums do not match.`);
            // Rollback: Delete partial copy
            await unlink(finalDestPath).catch(() => { });
            throw new Error("File copy verification failed (checksum mismatch).");
        }

        // 6. Delete Original (The "Move" part)
        await unlink(sourcePath);

        // 7. Log to Rollback Log
        await logRollback({
            action: 'move',
            source: sourcePath,
            destination: finalDestPath,
            checksum: sourceChecksum
        });

        logger.info(`Atomic move successful: ${path.basename(sourcePath)} -> ${path.basename(finalDestPath)}`);

        return { newPath: finalDestPath, originalPath: sourcePath, renamed: finalDestPath !== destPath };

    } catch (error) {
        logger.error(`Safe move failed for ${sourcePath}: ${error.message}`);
        throw error;
    }
}

/**
 * Legacy wrapper to maintain compatibility but use safeMove internally
 */
async function organizeFile(sourcePath, destFolder) {
    if (!sourcePath || !destFolder) {
        throw new Error("Source path and destination folder are required.");
    }

    const fileName = path.basename(sourcePath);
    const destPath = path.join(destFolder, fileName);

    return safeMove(sourcePath, destPath);
}

module.exports = {
    organizeFile,
    safeMove,
    getUniquePath,
    calculateChecksum
};
