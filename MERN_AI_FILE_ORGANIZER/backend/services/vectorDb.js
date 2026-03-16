const lancedb = require('@lancedb/lancedb');
const { pipeline } = require('@xenova/transformers');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let db = null;
let table = null;
let embedder = null;

const DB_PATH = path.join(__dirname, '../db/lancedb_data');

async function init() {
    if (table) return;

    try {
        db = await lancedb.connect(DB_PATH);

        logger.info("Loading Embedding Model (all-MiniLM-L6-v2)...");
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        logger.info("Embedding Model Loaded.");

        const tableNames = await db.tableNames();
        if (tableNames.includes('files_vectors')) {
            table = await db.openTable('files_vectors');
        } else {
            logger.info("Vector Table will be created on first insert.");
        }

    } catch (error) {
        logger.error(`Vector DB Init Failed: ${error.message}`);
    }
}

async function getEmbedding(text) {
    if (!embedder) await init();
    try {
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch (error) {
        logger.error(`Embedding generation failed: ${error.message}`);
        return null;
    }
}

async function upsertFile(fileObj) {
    if (!embedder) await init();

    try {
        const text = fileObj.text || fileObj.path;
        const vector = await getEmbedding(text);

        if (!vector) return;

        const record = {
            id: fileObj.path,
            path: fileObj.path,
            text: text.substring(0, 1000),
            category: fileObj.category || 'Uncategorized',
            vector: vector
        };

        if (!table) {
            const tableNames = await db.tableNames();
            if (tableNames.includes('files_vectors')) {
                table = await db.openTable('files_vectors');
            } else {
                table = await db.createTable('files_vectors', [record]);
                logger.info("Created 'files_vectors' table.");
                return;
            }
        }

        try {
            await table.delete(`path = '${fileObj.path.replace(/'/g, "''")}'`);
        } catch (e) { }

        await table.add([record]);
        logger.info(`Indexed ${path.basename(fileObj.path)} in Vector DB.`);

    } catch (error) {
        logger.error(`Vector Upsert Failed: ${error.message}`);
    }
}

async function search(queryText, limit = 5) {
    if (!embedder) await init();
    if (!table) return [];

    try {
        const queryVector = await getEmbedding(queryText);
        if (!queryVector) return [];

        let results;
        try {
            results = await table.search(queryVector)
                .limit(limit)
                .toArray();
        } catch (e) {
            logger.warn(`toArray failed, fallback to execute: ${e.message}`);
            const resultsGen = await table.search(queryVector)
                .limit(limit)
                .execute();
            results = [];
            for await (const row of resultsGen) {
                results.push(row);
            }
        }

        return results.map(r => ({
            path: r.path,
            category: r.category,
            snippet: r.text ? r.text.substring(0, 100) : "",
            score: r._score || 0
        }));

    } catch (error) {
        logger.error(`Vector Search Failed: ${error.message}`);
        return [];
    }
}

module.exports = { init, upsertFile, search };
