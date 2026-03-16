import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ipcRenderer } from '../utils/electronUtils';

const AutomationTab = () => {
    const [watchedFolders, setWatchedFolders] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:5000/api/files/watch/list');
            setWatchedFolders(res.data.folders);
        } catch (err) {
            console.error("Failed to fetch watched folders", err);
        }
    };

    const handleAddFolder = async () => {
        try {
            const folderPath = await ipcRenderer.invoke('select-folder');
            if (folderPath) {
                await axios.post('http://127.0.0.1:5000/api/files/watch/add', { folderPath });
                fetchFolders();
            }
        } catch (err) {
            alert("Failed to add folder: " + (err.response?.data?.error || err.message));
        }
    };

    const handleToggle = async (folderPath, currentStatus) => {
        try {
            await axios.post('http://127.0.0.1:5000/api/files/watch/toggle', {
                folderPath,
                isActive: !currentStatus
            });
            fetchFolders();
        } catch (err) {
            alert("Failed to toggle status: " + err.message);
        }
    };

    const handleRemove = async (folderPath) => {
        if (!confirm("Stop watching this folder?")) return;
        try {
            await axios.post('http://127.0.0.1:5000/api/files/watch/remove', { folderPath });
            fetchFolders();
        } catch (err) {
            alert("Failed to remove: " + err.message);
        }
    };

    const handleStrategyChange = async (folderPath, newStrategy) => {
        try {
            await axios.post('http://127.0.0.1:5000/api/files/watch/strategy', {
                folderPath,
                strategy: newStrategy
            });
            fetchFolders();
        } catch (err) {
            alert("Failed to update strategy: " + err.message);
        }
    };

    const handleOpenFolder = async (folderPath) => {
        try {
            await ipcRenderer.invoke('open-folder', folderPath);
        } catch (err) {
            console.error("Failed to open folder", err);
        }
    };

    return (
        <div style={{ padding: '20px' }} className="animate-fade-in">
            <h2 className="text-xl font-bold mb-2">📂 Real-Time Automation</h2>
            <p className="text-sm opacity-75 mb-6">Automatically organize files as soon as they appear in these folders.</p>

            <button
                onClick={handleAddFolder}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm mb-6 flex items-center gap-2"
            >
                <span>+</span> Add Folder to Watch
            </button>

            <div className="space-y-4">
                {watchedFolders.length === 0 && <p className="opacity-50 italic">No folders being watched.</p>}

                {watchedFolders.map((folder) => (
                    <div key={folder.id} className="p-4 glass-card flex flex-col md:flex-row justify-between items-center gap-4 transition-all hover:scale-[1.01]">
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-lg truncate dark:text-gray-100 text-gray-800">{folder.folder_path.split('/').pop()}</div>
                            <div className="text-xs font-mono opacity-60 truncate" title={folder.folder_path}>{folder.folder_path}</div>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap justify-end">
                            {/* Strategy Dropdown */}
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase font-bold opacity-50 mb-1">Conflict Strategy</span>
                                <select
                                    value={folder.conflict_strategy || 'smart_rename'}
                                    onChange={(e) => handleStrategyChange(folder.folder_path, e.target.value)}
                                    className="text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 outline-none focus:ring-2 ring-indigo-500"
                                >
                                    <option value="smart_rename">Smart Rename</option>
                                    <option value="skip">Skip File</option>
                                    <option value="overwrite">Overwrite</option>
                                </select>
                            </div>

                            {/* Toggle Switch */}
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] uppercase font-bold opacity-50 mb-1">{folder.is_active ? 'Active' : 'Paused'}</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={!!folder.is_active}
                                        onChange={() => handleToggle(folder.folder_path, folder.is_active)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            <button
                                onClick={() => handleOpenFolder(folder.folder_path)}
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded-lg transition-colors"
                                title="Open Folder"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </button>

                            <button
                                onClick={() => handleRemove(folder.folder_path)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                                title="Stop Watching"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AutomationTab;
