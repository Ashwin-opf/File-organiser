const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');

// POST /api/files/organize
// POST /api/files/organize
router.post('/organize', fileController.organizeFiles);

// POST /api/files/undo
router.post('/undo', fileController.undoLastOperation);

// GET /api/files/history
router.get('/history', fileController.getHistory);

// POST /api/files/scan-duplicates
router.post('/scan-duplicates', fileController.scanDuplicates);

// POST /api/files/delete
router.post('/delete', fileController.deleteFiles);

// POST /api/rules/ (Actually let's keep it under /files or make a new route file? Keeping it here for simplicity)
router.get('/rules', fileController.getRules);
router.post('/rules', fileController.saveRules);

// POST /api/files/stats
router.post('/stats', fileController.getFolderStats);

// GET /api/files/search
router.get('/search', fileController.searchFiles);

// POST /api/files/duplicates (Exact)
router.post('/duplicates', fileController.scanDuplicates);

// POST /api/files/duplicates/images (Smart)
router.post('/duplicates/images', fileController.scanImageDuplicates);

// Watcher Routes
const watcherService = require('../services/watcher');

router.get('/watch/list', (req, res) => {
    try {
        const folders = watcherService.listFolders();
        res.json({ folders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/watch/add', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: "Folder path required" });
        watcherService.addFolder(folderPath);
        res.json({ message: "Watcher added" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/watch/remove', (req, res) => {
    try {
        const { folderPath } = req.body;
        watcherService.removeFolder(folderPath);
        res.json({ message: "Watcher removed" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/watch/toggle', (req, res) => {
    try {
        const { folderPath, isActive } = req.body;
        watcherService.updateStatus(folderPath, isActive);
        res.json({ message: "Watcher status updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/watch/strategy', (req, res) => {
    try {
        const { folderPath, strategy } = req.body;
        watcherService.updateStrategy(folderPath, strategy);
        res.json({ message: "Watcher strategy updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
