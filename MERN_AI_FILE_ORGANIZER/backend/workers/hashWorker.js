const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Worker receives folderPath via workerData or postMessage
parentPort.on('message', async (data) => {
    try {
        const { folderPath } = data;
        const result = await scanDuplicates(folderPath);
        parentPort.postMessage({ status: 'success', data: result });
    } catch (err) {
        parentPort.postMessage({ status: 'error', error: err.message });
    }
});

async function scanDuplicates(dir) {
    const fileHashMaps = {}; // Hash -> [ {path, size, name} ]

    async function scan(currentDir) {
        const dirents = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const dirent of dirents) {
            // SKIP node_modules, etc to avoid huge scans
            if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(dirent.name)) continue;
            if (dirent.name.startsWith('.')) continue;

            const fullPath = path.join(currentDir, dirent.name);

            if (dirent.isDirectory()) {
                await scan(fullPath);
            } else if (dirent.isFile()) {
                try {
                    const hash = crypto.createHash('md5');
                    const stream = fs.createReadStream(fullPath);

                    await new Promise((resolve, reject) => {
                        stream.on('data', chunk => hash.update(chunk));
                        stream.on('end', () => resolve());
                        stream.on('error', err => reject(err));
                    });

                    const digest = hash.digest('hex');
                    const stats = await fs.promises.stat(fullPath);

                    if (!fileHashMaps[digest]) fileHashMaps[digest] = [];
                    fileHashMaps[digest].push({
                        path: fullPath,
                        name: dirent.name,
                        size: stats.size
                    });
                } catch (fileErr) {
                    // Ignore read errors
                }
            }
        }
    }

    await scan(dir);

    // Filter Logic
    const duplicates = [];
    for (const [hash, group] of Object.entries(fileHashMaps)) {
        if (group.length > 1) {
            duplicates.push({
                hash: hash,
                files: group
            });
        }
    }

    return duplicates;
}
