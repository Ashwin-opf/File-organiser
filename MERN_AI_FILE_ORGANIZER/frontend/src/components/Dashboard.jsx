import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const Dashboard = ({ selectedFolder, isDarkMode, searchResults, isSearching }) => {
    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Mock PII Data (Replace with real API if available)
    const [securityStats, setSecurityStats] = useState({ piiFiles: 0, malwareBlocked: 0 });

    useEffect(() => {
        if (selectedFolder) {
            fetchStats();
        }
    }, [selectedFolder]);

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            // Check if stats endpoint exists, otherwise mock or skip
            // Assuming endpoint exists from previous context
            const response = await axios.post('http://127.0.0.1:5000/api/files/stats', {
                folderPath: selectedFolder
            });
            setStats(response.data.stats);
        } catch (err) {
            console.error("Stats fetch error (API might be missing):", err);
            // Fallback/Silent fail if Phase 7 backend isn't fully ready for stats
        } finally {
            setLoadingStats(false);
        }
    };

    // Helper for formatting size
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };



    if (!selectedFolder) {
        return (
            <div className={`p-10 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Please select a folder in the Organize tab first.
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Search Results (Moved Input to Global Header) */}

            {/* Search Results */}
            <AnimatePresence>
                {searchResults.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-4 glass-card`}
                    >
                        <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Top Matches</h3>
                        <div className="space-y-2">
                            {searchResults.map((result, idx) => (
                                <div key={idx} className={`flex justify-between items-center p-2 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                                    <div className="truncate flex-1">
                                        <div className={`font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>{result.path.split('/').pop()}</div>
                                        <div className="text-xs opacity-60 truncate">{result.path}</div>
                                    </div>
                                    <div className={`text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`}>
                                        {(result.score * 100).toFixed(0)}% Match
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats Grid */}
            {loadingStats ? (
                <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading stats...</p>
            ) : stats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* General Overview */}
                    <div className={`p-6 glass-card`}>
                        <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Overview</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Total Files</span>
                                <span className={`text-2xl font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{stats.totalFiles}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Total Size</span>
                                <span className={`text-2xl font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{formatSize(stats.totalSize)}</span>
                            </div>
                        </div>
                    </div>

                    {/* File Types Distribution */}
                    <div className={`p-6 glass-card`}>
                        <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>File Types</h3>
                        <div className="space-y-3">
                            {Object.entries(stats.byType)
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 5)
                                .map(([type, count]) => (
                                    <div key={type}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{type}</span>
                                            <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>{count}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full"
                                                style={{ width: `${(count / stats.totalFiles) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Security Vault Summary */}
                    <div className={`p-6 glass-card col-span-1 md:col-span-2 border-red-500/20`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-red-400' : 'text-red-800'}`}>Security Vault</h3>
                                <p className={`text-sm ${isDarkMode ? 'text-red-300/70' : 'text-red-700/70'}`}>Files flagged with PII or potential malware.</p>
                            </div>
                            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-600'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <div className={`text-2xl font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                    {stats.security?.piiFiles || 0}
                                </div>
                                <div className="text-xs uppercase font-bold opacity-50">PII Files</div>
                            </div>
                            <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <div className={`text-2xl font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                    {stats.security?.malwareBlocked || 0}
                                </div>
                                <div className="text-xs uppercase font-bold opacity-50">Threats Blocked</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default Dashboard;
