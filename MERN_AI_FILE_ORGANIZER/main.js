const { app, BrowserWindow, ipcMain, dialog, session } = require('electron'); // Import session
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater'); // Import autoUpdater

let mainWindow;
let backendProcess;
let aiProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true, // Enable Node.js integration
            contextIsolation: false, // Disable context isolation for window.require
            sandbox: false, // Disable sandbox
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Content Security Policy (CSP)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:* ws://localhost:* file: data:;"
                ]
            }
        });
    });

    // Load the web app
    // For development, we might want to load localhost, but for "Full App" feel
    // we should load the built file. Let's try to load localhost first if running dev,
    // or build file.
    // For this MVP step, let's load the URL first to verify connectivity.
    // mainWindow.loadURL('http://localhost:5174'); 
    // BUT, we want it standalone. So we should create the window and wait for services.

    // Let's assume production-ish: Load local index.html
    // We need to build frontend first.
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));

    mainWindow.on('close', function (event) {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
        mainWindow = null;
    });

    // Open DevTools for debugging
    mainWindow.webContents.openDevTools();
}

// Process Management
const services = {
    backend: { process: null, restartTimer: null, isRestarting: false },
    ai: { process: null, restartTimer: null, isRestarting: false }
};

function getBackendPath() {
    const isPackaged = app.isPackaged;
    const basePath = isPackaged ? process.resourcesPath : __dirname;
    return path.join(basePath, 'backend/server.js');
}

function getAiInfo() {
    const isPackaged = app.isPackaged;
    const basePath = isPackaged ? process.resourcesPath : __dirname;
    if (isPackaged) {
        return {
            command: path.join(process.resourcesPath, 'ai-service', 'app_ai'),
            args: [],
            cwd: path.join(process.resourcesPath, 'ai-service')
        };
    } else {
        return {
            command: process.platform === 'win32' ? 'python' : 'python3',
            args: [path.join(basePath, 'ai-service/app_ai.py')],
            cwd: path.join(basePath, 'ai-service')
        };
    }
}

function startBackend() {
    if (services.backend.process || services.backend.isRestarting) return;

    const isPackaged = app.isPackaged;
    const basePath = isPackaged ? process.resourcesPath : __dirname;
    const backendScript = getBackendPath();
    const nodeCmd = isPackaged ? '/usr/local/bin/node' : 'node';

    console.log(`[Main] Starting Backend from ${backendScript}`);

    services.backend.process = spawn(nodeCmd, [backendScript], {
        cwd: path.join(basePath, 'backend'),
        env: { ...process.env, PORT: 5000, PATH: process.env.PATH + ':/usr/local/bin' },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    services.backend.process.stdout.on('data', (data) => console.log(`[Backend] ${data}`));
    services.backend.process.stderr.on('data', (data) => console.error(`[Backend ERR] ${data}`));

    services.backend.process.on('error', (err) => {
        console.error(`[Main] Backend Failed to start: ${err.message}`);
        dialog.showErrorBox("Backend Error", `Failed to start: ${err.message}`);
    });

    services.backend.process.on('exit', (code, signal) => {
        services.backend.process = null;
        if (!isQuitting) {
            console.error(`[Main] Backend exited (Code: ${code}, Signal: ${signal}). Restarting in 3s...`);
            services.backend.isRestarting = true;
            services.backend.restartTimer = setTimeout(() => {
                services.backend.isRestarting = false;
                startBackend();
            }, 3000);
        }
    });
}

function startAiService() {
    if (services.ai.process || services.ai.isRestarting) return;

    const { command, args, cwd } = getAiInfo();
    console.log(`[Main] Starting AI Service: ${command} ${args.join(' ')}`);

    services.ai.process = spawn(command, args, {
        cwd: cwd,
        env: { ...process.env, PORT: 5001 },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    services.ai.process.stdout.on('data', (data) => console.log(`[AI] ${data}`));
    services.ai.process.stderr.on('data', (data) => console.error(`[AI ERR] ${data}`));

    services.ai.process.on('error', (err) => {
        console.error(`[Main] AI Service Failed to start: ${err.message}`);
    });

    services.ai.process.on('exit', (code, signal) => {
        services.ai.process = null;
        if (!isQuitting) {
            console.warn(`[Main] AI Service exited (Code: ${code}, Signal: ${signal}).`);
            // Optional: Restart AI service automatically? Let's do it.
            services.ai.isRestarting = true;
            services.ai.restartTimer = setTimeout(() => {
                services.ai.isRestarting = false;
                startAiService();
            }, 5000);
        }
    });
}

function startServices() {
    startBackend();
    startAiService();
}

function killServices() {
    isQuitting = true;
    if (services.backend.process) services.backend.process.kill();
    if (services.ai.process) services.ai.process.kill();
    if (services.backend.restartTimer) clearTimeout(services.backend.restartTimer);
    if (services.ai.restartTimer) clearTimeout(services.ai.restartTimer);
}

const Store = require('electron-store');
const store = new Store();

// Tray Logic
const { Tray, Menu, nativeImage } = require('electron');
let tray = null;
let isQuitting = false;

app.whenReady().then(() => {
    // Tray Setup
    try {
        const icon = nativeImage.createEmpty();
        tray = new Tray(icon);

        const updateContextMenu = () => {
            const settings = store.get('userSettings', {});
            const isAutoLaunch = settings.autoLaunch || false;

            const contextMenu = Menu.buildFromTemplate([
                { label: 'Start on Boot', type: 'checkbox', checked: isAutoLaunch, click: () => toggleAutoLaunch() },
                { type: 'separator' },
                { label: 'Show App', click: () => mainWindow.show() },
                { type: 'separator' },
                {
                    label: 'Quit', click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]);
            tray.setContextMenu(contextMenu);
        };

        const toggleAutoLaunch = () => {
            const settings = store.get('userSettings', {});
            const newState = !settings.autoLaunch;
            store.set('userSettings', { ...settings, autoLaunch: newState });

            app.setLoginItemSettings({
                openAtLogin: newState,
                openAsHidden: true // Optional: start minimized
            });

            updateContextMenu();
        };

        updateContextMenu(); // Initial render

        // Sync on load
        const settings = store.get('userSettings', {});
        if (settings.autoLaunch) {
            app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
        }

        tray.setToolTip('MERN AI File Organizer');
    } catch (e) {
        console.error("Tray error:", e);
    }

    // IPC Handlers for Settings
    ipcMain.handle('get-settings', () => {
        return store.get('userSettings', { checkMalware: true, strategy: 'subfolders' });
    });

    ipcMain.handle('save-settings', (event, settings) => {
        store.set('userSettings', settings);
        return true;
    });

    // Existing Folder Selection Handler
    ipcMain.handle('select-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (canceled) {
            return null;
        } else {
            return filePaths[0]; // Logic: return the first selected path
        }
    });

    // Open Folder in Explorer/Finder
    const { shell } = require('electron');
    ipcMain.handle('open-folder', async (event, folderPath) => {
        if (!folderPath) return false;
        const error = await shell.openPath(folderPath);
        if (error) {
            console.error(`Failed to open folder: ${error}`);
            return false;
        }
        return true;
    });

    startServices();
    // Give services a moment to start?
    setTimeout(createWindow, 2000);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else mainWindow.show();
    });
});

app.on('window-all-closed', function () {
    killServices();
    if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
    killServices();
});

// --- Auto-Updater Logic ---
autoUpdater.on('update-available', () => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: 'A new version is available. Downloading now...'
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. Restart now to install?',
        buttons: ['Restart', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

// Check for updates once window is ready
app.whenReady().then(() => {
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.log('Update check failed:', err);
        });
    }
});
