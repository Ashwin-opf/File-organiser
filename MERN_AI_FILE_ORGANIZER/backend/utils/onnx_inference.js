// Try to load ONNX runtime, but make it optional
let onnx = null;
let ONNX_AVAILABLE = false;

try {
    onnx = require('onnxruntime-node');
    ONNX_AVAILABLE = true;
} catch (error) {
    console.warn('ONNX Runtime not available - native bindings failed to load. ONNX-based predictions will be skipped.');
    console.warn(`ONNX Error: ${error.message}`);
}

const path = require('path');
const logger = require('./logger');

let session = null;

async function loadModel() {
    if (!ONNX_AVAILABLE) {
        logger.warn('ONNX Runtime not available - skipping model load');
        return;
    }

    if (session) return;

    try {
        const modelPath = path.join(__dirname, '../models/file_organizer.onnx');
        session = await onnx.InferenceSession.create(modelPath);
        logger.info(`ONNX Model loaded from ${modelPath}`);
    } catch (error) {
        logger.error(`Failed to load ONNX model: ${error.message}`);
        // Don't throw - just log and continue without ONNX
    }
}

async function predict(filename) {
    if (!ONNX_AVAILABLE) {
        logger.debug('ONNX not available - returning null prediction');
        return null;
    }

    if (!session) await loadModel();

    // If model still didn't load, return null
    if (!session) {
        return null;
    }

    try {
        // Prepare input
        // ONNX model expects shape [N, 1] string tensor
        const inputName = session.inputNames[0];
        const outputName = session.outputNames[0];

        const inputTensor = new onnx.Tensor('string', [filename], [1, 1]);

        const feeds = {};
        feeds[inputName] = inputTensor;

        // Run inference
        const results = await session.run(feeds);
        const output = results[outputName];

        // Output is a String Tensor
        const category = output.data[0];
        return category;

    } catch (error) {
        logger.error(`Inference failed for ${filename}: ${error.message}`);
        return null;
    }
}

module.exports = { predict, loadModel, ONNX_AVAILABLE };
