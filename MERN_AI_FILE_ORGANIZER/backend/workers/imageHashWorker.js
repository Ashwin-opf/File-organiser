const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// dHash implementation: Resize to 9x8, grayscale, compare adjacent pixels
async function computeDHash(filePath) {
    try {
        const buffer = await sharp(filePath)
            .resize(9, 8, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        let hash = '';
        // 8 rows
        for (let y = 0; y < 8; y++) {
            // 8 columns comparisons (9 pixels width)
            for (let x = 0; x < 8; x++) {
                const left = buffer[y * 9 + x];
                const right = buffer[y * 9 + x + 1];
                hash += (left > right ? '1' : '0');
            }
        }
        return parseInt(hash, 2).toString(16);
    } catch (err) {
        return null;
    }
}

// Simple Hamming Distance
function hammingDistance(hash1, hash2) {
    let val = BigInt(`0x${hash1}`) ^ BigInt(`0x${hash2}`);
    let dist = 0;
    while (val > 0n) {
        dist += Number(val & 1n);
        val >>= 1n;
    }
    return dist;
}

parentPort.on('message', async (data) => {
    try {
        const { folderPath } = data;
        const result = await scanImageDuplicates(folderPath);
        parentPort.postMessage({ status: 'success', data: result });
    } catch (err) {
        parentPort.postMessage({ status: 'error', error: err.message });
    }
});

async function scanImageDuplicates(dir) {
    const images = [];

    async function scan(currentDir) {
        let dirents;
        try {
            dirents = await fs.promises.readdir(currentDir, { withFileTypes: true });
        } catch (e) { return; }

        for (const dirent of dirents) {
            if (['node_modules', '.git', 'dist'].includes(dirent.name)) continue;
            if (dirent.name.startsWith('.')) continue;

            const fullPath = path.join(currentDir, dirent.name);
            if (dirent.isDirectory()) {
                await scan(fullPath);
            } else if (dirent.isFile()) {
                const ext = path.extname(dirent.name).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.webp', '.tiff'].includes(ext)) {
                    images.push(fullPath);
                }
            }
        }
    }

    await scan(dir);

    const hashes = [];
    for (const img of images) {
        const hash = await computeDHash(img);
        if (hash) {
            hashes.push({ path: img, hash });
        }
    }

    // Compare all pairs (O(n^2), okay for small batch, maybe limit size)
    // For MVP, simple pair check
    const similarGroups = [];
    const seen = new Set();

    // Naive implementation
    /*
    Better: Map hash to list.
    But dHash allows "similar" so exact match isn't enough.
    We need Hamming Distance < threshold (e.g. 5).
    */

    for (let i = 0; i < hashes.length; i++) {
        if (seen.has(i)) continue;

        const group = [hashes[i]];
        seen.add(i);

        for (let j = i + 1; j < hashes.length; j++) {
            if (seen.has(j)) continue;

            // Hamming check
            if (hashes[i].hash && hashes[j].hash) {
                // Check if hashes are valid hex
                try {
                    const dist = hammingDistance(hashes[i].hash, hashes[j].hash);
                    if (dist <= 5) { // Threshold 5 bits different
                        group.push(hashes[j]);
                        seen.add(j);
                    }
                } catch (e) { }
            }
        }

        if (group.length > 1) {
            similarGroups.push({
                base: group[0].path,
                duplicates: group.slice(1).map(g => g.path),
                similarity: "High"
            });
        }
    }

    return similarGroups;
}
