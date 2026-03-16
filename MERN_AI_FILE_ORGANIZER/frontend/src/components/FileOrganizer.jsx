import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ActivityLog from './ActivityLog';
import Toast from './Toast';
import Dashboard from './Dashboard';
import AutomationTab from './AutomationTab';

// IPC Renderer for Electron
// IPC Renderer for Electron (Browser Compatible)
import { ipcRenderer } from '../utils/electronUtils';

const FileOrganizer = ({ isDarkMode }) => {
    const [activeTab, setActiveTab] = useState('organize');

    // -- Organize Tab State --
    const [command, setCommand] = useState('');
    const [selectedFolder, setSelectedFolder] = useState('');
    const [destinationFolder, setDestinationFolder] = useState('');
    const [checkMalware, setCheckMalware] = useState(true);
    const [strategy, setStrategy] = useState('subfolders');
    const [dryRun, setDryRun] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [undoAvailable, setUndoAvailable] = useState(false);

    // -- Cleanup Tab State --
    const [cleanupMode, setCleanupMode] = useState('exact'); // 'exact' or 'images'
    const [scanningDuplicates, setScanningDuplicates] = useState(false);
    const [duplicateResult, setDuplicateResult] = useState(null);
    const [selectedDuplicates, setSelectedDuplicates] = useState(new Set());

    // -- Settings Tab State --
    const [rules, setRules] = useState([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [loadingRules, setLoadingRules] = useState(false);

    // Toast State
    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success', action = null) => {
        setToast({ message: msg, type, action });
    };

    // -- Global Search State --
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleGlobalSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setActiveTab('dashboard'); // Switch to dashboard to show results
        setIsSearching(true);
        try {
            const response = await axios.get(`http://127.0.0.1:5000/api/files/search?query=${encodeURIComponent(searchQuery)}`);
            setSearchResults(response.data.results || []);
        } catch (err) {
            console.error("Search failed:", err);
            showToast("Search failed: " + err.message, "error");
        } finally {
            setIsSearching(false);
        }
    };

    // Activity Log Trigger
    const [refreshLog, setRefreshLog] = useState(0);

    // -- Effects --
    useEffect(() => {
        if (activeTab === 'settings') {
            fetchRules();
        }
    }, [activeTab]);

    const fetchRules = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:5000/api/files/rules');
            setRules(res.data.rules || []);
        } catch (err) {
            console.error("Failed to fetch rules", err);
        }
    };

    // -- Handlers --

    const handleSelectFolder = async () => {
        try {
            const path = await ipcRenderer.invoke('select-folder');
            if (path) setSelectedFolder(path);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelectDestination = async () => {
        try {
            const path = await ipcRenderer.invoke('select-folder');
            if (path) setDestinationFolder(path);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const path = e.dataTransfer.files[0].path;
            setSelectedFolder(path);
        }
    };

    const handleOrganize = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            if (!selectedFolder) throw new Error("Please select a source folder.");

            const response = await axios.post('http://127.0.0.1:5000/api/files/organize', {
                command: command,
                sourceFolder: selectedFolder,
                destinationFolder: destinationFolder,
                options: { checkMalware, strategy, dryRun }
            });

            setResult(response.data);

            if (dryRun) {
                showToast("Dry Run Complete. No files were moved.", "info");
            } else {
                setUndoAvailable(true);
                setRefreshLog(prev => prev + 1);
                showToast("Organization Complete!", "success", {
                    label: "Undo",
                    onClick: handleUndo
                });
            }

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || err.message || "An error occurred");
            showToast("Organization Failed", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleUndo = async () => {
        if (!confirm("Are you sure you want to undo the last operation?")) return;
        setLoading(true);
        try {
            const response = await axios.post('http://127.0.0.1:5000/api/files/undo');
            showToast(response.data.message, "success");
            setUndoAvailable(false);
            setResult(null);
            setRefreshLog(prev => prev + 1);
        } catch (err) {
            showToast("Undo failed: " + (err.response?.data?.error || err.message), "error");
        } finally {
            setLoading(false);
        }
    };

    // -- Duplicate Handlers --
    const handleScanDuplicates = async () => {
        if (!selectedFolder) return;
        setScanningDuplicates(true);
        setDuplicateResult(null);
        setSelectedDuplicates(new Set());

        try {
            let res;
            if (cleanupMode === 'images') {
                res = await axios.post('http://127.0.0.1:5000/api/files/duplicates/images', { folderPath: selectedFolder });

                // Normalize Image Result to match Exact Result structure
                // Image Result is: [{ base: path, duplicates: [path, ...], similarity: "High" }]
                // Target Structure: [{ hash: id, files: [{ path, name, size }] }]

                const normalized = res.data.duplicates.map((group, idx) => ({
                    hash: `similar-${idx}`,
                    similarity: group.similarity,
                    files: [
                        { path: group.base, name: group.base.split('/').pop(), size: 0, isOriginal: true },
                        ...group.duplicates.map(p => ({ path: p, name: p.split('/').pop(), size: 0, isOriginal: false }))
                    ]
                }));
                setDuplicateResult(normalized);

            } else {
                // Exact Match
                res = await axios.post('http://127.0.0.1:5000/api/files/scan-duplicates', { folderPath: selectedFolder });
                setDuplicateResult(res.data.duplicates || []);
            }

        } catch (err) {
            showToast("Scan failed: " + (err.response?.data?.error || err.message), "error");
        } finally {
            setScanningDuplicates(false);
        }
    };

    const handleDeleteDuplicates = async () => {
        if (selectedDuplicates.size === 0) return;
        if (!confirm(`Delete ${selectedDuplicates.size} files permanently?`)) return;

        try {
            await axios.post('http://127.0.0.1:5000/api/files/delete', { files: Array.from(selectedDuplicates) });
            showToast("Files deleted successfully", "success");
            setDuplicateResult(null);
            setSelectedDuplicates(new Set());
        } catch (err) {
            showToast("Delete failed", "error");
        }
    };

    // -- Rule Handlers --
    const handleAddRule = () => {
        if (!newKeyword || !newCategory) return;
        setRules([...rules, { text: newKeyword, category: newCategory }]);
        setNewKeyword('');
        setNewCategory('');
    };

    const handleDeleteRule = (idx) => {
        const newRules = [...rules];
        newRules.splice(idx, 1);
        setRules(newRules);
    };

    const handleSaveRules = async () => {
        setLoadingRules(true);
        try {
            await axios.post('http://127.0.0.1:5000/api/files/rules', { rules });
            showToast("Rules saved successfully", "success");
        } catch (err) {
            showToast("Failed to save rules", "error");
        } finally {
            setLoadingRules(false);
        }
    };

    // Helper for size
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className={`max-w-4xl mx-auto mt-10 p-6 rounded-3xl transition-all duration-300 glass`}>
            {/* Toast Notification */}
            {toast && <Toast message={toast.message} type={toast.type} action={toast.action} onClose={() => setToast(null)} />}

            {/* Header & Global Search */}
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-between items-center">
                    <h2 className={`text-3xl font-bold tracking-tight flex items-center gap-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        AI File Organizer
                        <div className="flex gap-2">
                            <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${isDarkMode ? 'bg-purple-900/30 border-purple-500/30 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-700'}`}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                ONNX Native
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${isDarkMode ? 'bg-green-900/30 border-green-500/30 text-green-300' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                Watcher Active
                            </span>
                        </div>
                    </h2>

                    {/* Navigation Tabs */}
                    <div className={`hidden md:flex p-1 rounded-xl ${isDarkMode ? 'bg-black/20' : 'bg-gray-200'} backdrop-blur-md`}>
                        {['organize', 'automation', 'cleanup', 'dashboard', 'settings'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${activeTab === tab
                                    ? 'bg-white/80 dark:bg-white/10 shadow-lg text-blue-600 dark:text-blue-300 ring-1 ring-black/5 dark:ring-white/10'
                                    : 'text-black font-semibold dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-white/40'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Global AI Search Bar */}
                <form onSubmit={handleGlobalSearch} className="relative w-full max-w-2xl mx-auto">
                    <input
                        type="text"
                        placeholder="✨ Ask your files... (e.g. 'Show me electricity bills from Jan')"
                        className={`w-full py-3 pl-12 pr-4 rounded-xl border outline-none transition-all shadow-sm focus:ring-2 focus:ring-blue-500/50 ${isDarkMode
                            ? 'bg-black/20 border-white/10 text-white placeholder-gray-400 focus:bg-black/40'
                            : 'bg-white/60 border-white/40 text-gray-900 placeholder-gray-600 focus:bg-white/80'
                            } backdrop-blur-md`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <svg className={`absolute left-4 top-3.5 w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {isSearching && (
                        <div className="absolute right-4 top-3.5">
                            <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    )}
                </form>
            </div>


            {/* --- ORGANIZE TAB --- */}
            {
                activeTab === 'organize' && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Source Folder Input */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`p-8 rounded-2xl border-dashed border-2 transition-all duration-300 flex flex-col items-center justify-center gap-4 group ${isDragging
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-white/20 bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <label className={`text-sm font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                                Source Folder
                            </label>
                            <div className="w-full flex gap-4 items-center">
                                <div className={`flex-1 p-3 rounded-lg font-mono text-sm overflow-x-auto whitespace-nowrap border ${isDarkMode ? 'bg-gray-900 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-800'}`}>
                                    {selectedFolder || "Drag folder here or select manually"}
                                </div>
                                <button onClick={handleSelectFolder} className={`px-6 py-3 rounded-lg font-medium transition-colors shadow-sm whitespace-nowrap ${isDarkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-800 hover:bg-black text-white'}`}>Select Folder</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Org Style */}
                            {/* Org Style */}
                            <div className={`p-6 glass-card`}>
                                <label className={`block text-sm font-semibold mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Organization Style</label>
                                <div className={`p-1 rounded-lg flex gap-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                    <button onClick={() => setStrategy('subfolders')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${strategy === 'subfolders' ? isDarkMode ? 'bg-gray-600 text-blue-300' : 'bg-white text-blue-600' : isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>Subfolders</button>
                                    <button onClick={() => setStrategy('flat')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${strategy === 'flat' ? isDarkMode ? 'bg-gray-600 text-blue-300' : 'bg-white text-blue-600' : isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>Single Folder</button>
                                </div>
                            </div>

                            {/* Security & Dry Run */}
                            {/* Security & Dry Run */}
                            <div className={`p-6 glass-card flex flex-col justify-between`}>
                                <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>Safety & Security</label>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-800'}`}>Scan for Malware</span>
                                        <button onClick={() => setCheckMalware(!checkMalware)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checkMalware ? 'bg-green-500' : (isDarkMode ? 'bg-gray-600' : 'bg-gray-300')}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checkMalware ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-800'}`}>Dry Run (Preview)</span>
                                        <button onClick={() => setDryRun(!dryRun)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${dryRun ? 'bg-blue-500' : (isDarkMode ? 'bg-gray-600' : 'bg-gray-300')}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${dryRun ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Destination Folder */}
                        {/* Destination Folder */}
                        <div className={`p-6 glass-card`}>
                            <label className={`text-sm font-semibold uppercase tracking-wider mb-3 block ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                                Destination Folder (Optional)
                            </label>
                            <div className="w-full flex gap-4 items-center">
                                <div className={`flex-1 p-3 rounded-lg font-mono text-sm overflow-x-auto whitespace-nowrap border ${isDarkMode ? 'bg-gray-900 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-600'}`}>
                                    {destinationFolder || "Same as Source (Default)"}
                                </div>
                                <button onClick={handleSelectDestination} className={`px-6 py-3 rounded-lg font-medium transition-colors shadow-sm whitespace-nowrap ${isDarkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-800 hover:bg-black text-white'}`}>Select Destination</button>
                            </div>
                        </div>


                        {/* Action Buttons */}
                        <div className="flex gap-4">
                            <button
                                onClick={handleOrganize}
                                disabled={loading || !selectedFolder}
                                className={`flex-1 py-4 px-6 rounded-xl text-white font-bold text-lg transition-all transform ${loading || !selectedFolder
                                    ? isDarkMode ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg active:scale-[0.98]'
                                    }`}
                            >
                                {loading ? (dryRun ? 'Simulating...' : 'Processing...') : (dryRun ? 'Simulate Organization' : 'Start Organization')}
                            </button>
                        </div>

                        {/* Global Error Alert */}
                        {error && (
                            <div className={`mt-4 p-4 rounded-xl border flex items-center gap-3 ${isDarkMode ? 'bg-red-900/20 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        )}

                        {/* Results Area */}
                        {
                            result && (
                                <div className={`mt-8 p-6 rounded-xl border ${dryRun
                                    ? (isDarkMode ? 'bg-blue-900/10 border-blue-900/30' : 'bg-blue-50 border-blue-200')
                                    : (isDarkMode ? 'bg-green-900/10 border-green-900/30' : 'bg-green-50 border-green-200')
                                    }`}>
                                    <h3 className={`text-xl font-bold mb-4 ${dryRun
                                        ? (isDarkMode ? 'text-blue-300' : 'text-blue-800')
                                        : (isDarkMode ? 'text-green-300' : 'text-green-800')
                                        }`}>
                                        {dryRun ? 'Dry Run Preview' : 'Organization Complete!'}
                                    </h3>
                                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                        {result.results.map((item, idx) => (
                                            <div key={idx} className={`p-3 rounded-lg text-sm border flex justify-between items-center ${item.status === 'malware_detected' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' :
                                                isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-100 text-gray-800'
                                                }`}>
                                                <div className="flex-1">
                                                    <span className="font-medium">{item.file.split('/').pop()}</span>
                                                    <span className="mx-2">&rarr;</span>
                                                    <span className={`uppercase text-xs font-bold px-2 py-0.5 rounded ${item.status === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                                        item.status === 'dry_run' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' :
                                                            item.status === 'malware_detected' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
                                                                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        {item.status.replace('_', ' ')}
                                                    </span>
                                                    {item.new_path && <span className="ml-2 text-xs opacity-75">({item.new_path.split('/').pop()})</span>}
                                                    {item.error && <div className="text-xs mt-1 opacity-75">{item.threat || item.error}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        }


                    </div >
                )
            }

            {/* --- AUTOMATION TAB --- */}
            {
                activeTab === 'automation' && (
                    <div className="animate-fade-in">
                        <AutomationTab />
                    </div>
                )
            }

            {/* --- CLEANUP TAB --- */}
            {
                activeTab === 'cleanup' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className={`p-6 rounded-xl border ${isDarkMode ? 'bg-yellow-900/10 border-yellow-900/30' : 'bg-yellow-50 border-yellow-200'}`}>
                            <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-800'}`}>Cleanup & Deduplication</h3>
                            <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>
                                Scan <strong>{selectedFolder || '(select a folder in Organize tab)'}</strong> for identical files or similar images.
                            </p>

                            {/* Mode Toggle */}
                            <div className={`flex p-1 rounded-lg mb-4 w-full md:w-1/2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                <button
                                    onClick={() => setCleanupMode('exact')}
                                    className={`flex-1 py-1 px-3 rounded-md text-sm font-medium transition-all ${cleanupMode === 'exact' ? (isDarkMode ? 'bg-gray-600 text-white shadow' : 'bg-white text-gray-800 shadow') : 'text-gray-500'}`}
                                >
                                    Exact Duplicates
                                </button>
                                <button
                                    onClick={() => setCleanupMode('images')}
                                    className={`flex-1 py-1 px-3 rounded-md text-sm font-medium transition-all ${cleanupMode === 'images' ? (isDarkMode ? 'bg-gray-600 text-white shadow' : 'bg-white text-gray-800 shadow') : 'text-gray-500'}`}
                                >
                                    Similar Images (AI)
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleScanDuplicates}
                                    disabled={scanningDuplicates || !selectedFolder}
                                    className={`flex-1 px-6 py-2 rounded-lg font-medium transition-colors ${scanningDuplicates || !selectedFolder
                                        ? isDarkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-300 text-gray-500'
                                        : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                        }`}
                                >
                                    {scanningDuplicates ? 'Scanning...' : `Scan for ${cleanupMode === 'exact' ? 'Duplicates' : 'Similar Images'}`}
                                </button>
                                {duplicateResult && duplicateResult.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const newSet = new Set();
                                            duplicateResult.forEach(group => {
                                                // Better: Select ALL except the first one in each group.
                                                group.files.slice(1).forEach(f => newSet.add(f.path));
                                            });
                                            setSelectedDuplicates(newSet);
                                        }}
                                        className={`px-4 py-2 rounded-lg font-medium border transition-colors ${isDarkMode ? 'border-gray-600 hover:bg-gray-700 text-gray-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                                    >
                                        Select All Except One
                                    </button>
                                )}
                            </div>
                        </div>

                        {duplicateResult && (
                            <div className="space-y-4">
                                {duplicateResult.length === 0 ? (
                                    <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>No duplicates found!</p>
                                ) : (
                                    duplicateResult.map((group, idx) => (
                                        <div key={idx} className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                                            <p className={`text-xs font-mono mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Hash: {group.hash.substring(0, 10)}...</p>
                                            {group.files.map(f => (
                                                <div key={f.path} className="flex items-center gap-2 mb-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedDuplicates.has(f.path)}
                                                        onChange={(e) => {
                                                            const newSet = new Set(selectedDuplicates);
                                                            if (e.target.checked) newSet.add(f.path);
                                                            else newSet.delete(f.path);
                                                            setSelectedDuplicates(newSet);
                                                        }}
                                                    />
                                                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>{f.name} ({formatSize(f.size)})</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}

                                {duplicateResult.length > 0 && (
                                    <button
                                        onClick={handleDeleteDuplicates}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold"
                                    >
                                        Delete Selected ({selectedDuplicates.size})
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )
            }

            {/* --- DASHBOARD TAB --- */}
            {
                activeTab === 'dashboard' && (
                    <Dashboard
                        selectedFolder={selectedFolder}
                        isDarkMode={isDarkMode}
                        searchResults={searchResults}
                        isSearching={isSearching}
                    />
                )
            }

            {/* --- PERSISTENT FOOTER: Action Log --- */}
            <div className="mt-8 border-t border-white/10 pt-6">
                <ActivityLog refreshTrigger={refreshLog} isDarkMode={isDarkMode} />
            </div>

            {/* --- SETTINGS TAB --- */}
            {
                activeTab === 'settings' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className={`p-6 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                            <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Custom Rules Editor</h3>
                            <p className={`mb-4 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                Teach the AI new categories. Existing rules are loaded from your dataset.
                            </p>

                            <div className="flex gap-2 mb-6">
                                <input
                                    type="text"
                                    placeholder="Keywords (e.g., invoice, receipt)"
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    className={`flex-1 px-4 py-2 rounded-lg border ${isDarkMode
                                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                        }`}
                                />
                                <input
                                    type="text"
                                    placeholder="Category (e.g., Finance)"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    className={`flex-1 px-4 py-2 rounded-lg border ${isDarkMode
                                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                        }`}
                                />
                                <button
                                    onClick={handleAddRule}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Add
                                </button>
                            </div>

                            <div className={`border rounded-lg overflow-hidden ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <div className={`max-h-60 overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                                    <table className="w-full text-sm text-left">
                                        <thead className={`text-xs uppercase sticky top-0 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            <tr>
                                                <th className="px-6 py-3">Keywords/File</th>
                                                <th className="px-6 py-3">Category</th>
                                                <th className="px-6 py-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {rules.map((rule, idx) => (
                                                <tr key={idx} className={isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'}>
                                                    <td className={`px-6 py-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>{rule.text}</td>
                                                    <td className={`px-6 py-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>{rule.category}</td>
                                                    <td className="px-6 py-2 text-right">
                                                        <button
                                                            onClick={() => handleDeleteRule(idx)}
                                                            className="text-red-500 hover:text-red-700"
                                                        >
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={handleSaveRules}
                                    disabled={loadingRules}
                                    className={`px-6 py-2 rounded-lg font-bold text-white transition-colors ${loadingRules ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                >
                                    {loadingRules ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default FileOrganizer;
