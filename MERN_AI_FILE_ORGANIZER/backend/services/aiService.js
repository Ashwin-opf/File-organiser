const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Import axios for HTTP requests
const malware = require('../utils/malware');
const pii = require('../utils/pii');
const ocr = require('../utils/ocr');

// Try to load ONNX, but make it optional
let onnx = null;
try {
    onnx = require('../utils/onnx_inference');
} catch (error) {
    console.warn('ONNX inference module not available - will skip ONNX predictions');
}

const metadata = require('../utils/metadata');
const logger = require('../utils/logger');

// Python AI Service URL
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001/analyze';

/**
 * Orchestrates the analysis of a single file.
 * Returns an Action object.
 * Tries to use the Python AI Service first, falls back to local logic.
 */
async function analyzeFile(filePath, contextText = null, options = {}) {
    logger.info(`Analyzing file: ${filePath}`);

    // --- STRATEGY 1: Python AI Service (Preferred) ---
    try {
        const payload = {
            command: options.command || "",
            file_paths: [filePath],
            context: contextText ? { [filePath]: contextText } : {},
            options: options,
            destination_override: options.destination_override
        };

        logger.info(`Delegating to Python AI Service: ${AI_SERVICE_URL}`);
        const response = await axios.post(AI_SERVICE_URL, payload);

        if (response.data && response.data.actions && response.data.actions.length > 0) {
            const action = response.data.actions[0];

            // Normalize action status if needed
            if (action.status === 'malware_detected') {
                logger.warn(`AI Service detected malware in ${filePath}`);
            } else if (action.status === 'pii_detected') {
                logger.warn(`AI Service detected PII in ${filePath}`);
            } else {
                logger.info(`AI Service decision for ${path.basename(filePath)}: ${action.destination_folder || 'Skip'}`);
            }

            return action;
        }
    } catch (error) {
        // Log but don't crash - fallback to local logic
        if (error.code === 'ECONNREFUSED') {
            logger.warn("Python AI Service unavailable (Connection Refused). Using local Node.js fallback.");
        } else {
            logger.warn(`Python AI Service error: ${error.message}. Using fallback.`);
        }
    }

    // --- STRATEGY 2: Local Node.js Logic (Fallback) ---
    logger.info("Executing local fallback analysis...");

    // 1. Security Check (Malware)
    const malwareResult = await malware.scanFile(filePath);
    if (malwareResult.is_malware) {
        return {
            file: filePath,
            status: 'malware_detected',
            operation: 'skip',
            threat: malwareResult.threat
        };
    }

    // 2. Privacy Check (PII)
    const piiResult = await pii.scanFile(filePath);
    if (piiResult.is_pii) {
        return {
            file: filePath,
            status: 'pii_detected',
            operation: 'move',
            threat: piiResult.type,
            destination_folder: path.join(path.dirname(filePath), "Secure_Vault")
        };
    }

    // 3. Categorization (Hybrid)
    let category = metadata.analyzeFileMetadata(filePath);
    let newFilename = null;

    // ML/AI Override
    // Only if ambiguous or we want deeper analysis
    if (['Documents', 'Others', 'Text', 'Images'].includes(category)) {
        try {
            // A. Content-Aware (OCR Text)
            const textToCheck = (contextText || "").toLowerCase();

            if (textToCheck) {
                if (textToCheck.includes("invoice") || textToCheck.includes("bill") || textToCheck.includes("receipt")) {
                    category = "Finance";
                    // Magic Rename
                    const ext = path.extname(filePath);
                    newFilename = `Invoice_${Math.floor(Date.now() / 1000)}${ext}`;
                } else if (textToCheck.includes("salary") || textToCheck.includes("offer letter")) {
                    category = "Career";
                }
            }

            // B. Filename-Based (ONNX) - Restored as Fallback
            if (onnx && onnx.ONNX_AVAILABLE && !newFilename && (category === 'Others' || category === 'Documents')) {
                const prediction = await onnx.predict(path.basename(filePath));
                if (prediction && prediction !== 'Others') {
                    category = prediction;
                    logger.info(`ONNX Predicted: ${path.basename(filePath)} -> ${category}`);
                }
            }
        } catch (error) {
            logger.error(`AI Analysis failed for ${filePath}: ${error.message}`);
        }
    }

    // 4. Construct Destination
    let baseDir = options.destination_override || path.dirname(filePath);
    let fullDestination = baseDir;

    // Strategy: Subfolders (default) vs Flat
    // If we have a category, append it
    if (category && category !== 'Others' && category !== '') {
        fullDestination = path.join(baseDir, category);
    }

    const action = {
        file: filePath,
        operation: 'move',
        destination_folder: fullDestination,
        status: 'success'
    };

    if (newFilename) {
        action.new_filename = newFilename;
    }

    return action;
}

module.exports = { analyzeFile };
