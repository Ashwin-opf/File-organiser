const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fileRoutes = require('./routes/fileRoutes');
const fs = require('fs');
const path = require('path');
const watcherService = require('./services/watcher'); // Import Watcher
const { initErrorHandler } = require('./utils/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Global Error Handling
initErrorHandler();

// Middleware
app.use(cors({
    origin: '*', // Allow all origins (especially for file:// in Electron)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Database Connection (Placeholder for MVP)
// mongoose.connect('mongodb://localhost:27017/file_organizer', { useNewUrlParser: true, useUnifiedTopology: true })
//     .then(() => console.log('MongoDB Connected'))
//     .catch(err => console.log(err));

// Routes
app.use('/api/files', fileRoutes);

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('MERN AI File Organizer API is running');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize Watchers (Skip in Test Mode)
    if (process.env.NODE_ENV !== 'test') {
        watcherService.initWatchers();
    }
});
