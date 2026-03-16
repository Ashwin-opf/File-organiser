// Utility to handle Electron IPC in both Electron and Browser environments

let ipcRendererMock = {
    invoke: async (channel, ...args) => {
        console.log(`[Mock IPC] Invoked: ${channel}`, args);
        if (channel === 'select-folder') {
            const mockPath = "/Users/mock/Documents/TestFolder";
            // Return a mock path for testing
            return confirm(`[Browser Mock] Simulate selecting folder: ${mockPath}?`) ? mockPath : null;
        }
        return null;
    },
    send: (channel, ...args) => {
        console.log(`[Mock IPC] Sent: ${channel}`, args);
    },
    on: (channel, func) => {
        console.log(`[Mock IPC] Listening on: ${channel}`);
    },
    removeListener: (channel, func) => {
        console.log(`[Mock IPC] Removed listener: ${channel}`);
    }
};

let ipcRenderer;
if (window.require) {
    try {
        const electron = window.require('electron');
        ipcRenderer = electron.ipcRenderer;
    } catch (e) {
        console.warn("Found window.require but failed to load electron. Using mock.");
        ipcRenderer = ipcRendererMock;
    }
} else {
    console.warn("Running in Browser Mode (No Electron). Using mock IPC.");
    ipcRenderer = ipcRendererMock;
}

export { ipcRenderer };
