import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ActivityLog = ({ refreshTrigger, isDarkMode }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://127.0.0.1:5000/api/files/history');
            setHistory(response.data.history || []);
        } catch (err) {
            console.error("Failed to fetch history:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [refreshTrigger]);

    if (history.length === 0 && !loading) return null;

    return (
        <div className={`mt-8 p-6 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Recent Activity</h3>

            <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
                {history.map((item) => {
                    let actionLabel = item.action_type;
                    let actionColor = isDarkMode ? 'text-blue-400' : 'text-blue-600';

                    if (item.action_type === 'move') {
                        actionLabel = 'Moved';
                    } else if (item.action_type === 'delete') {
                        actionLabel = 'Deleted';
                        actionColor = 'text-red-500';
                    } else if (item.action_type === 'malware') {
                        actionLabel = 'Blocked (Malware)';
                        actionColor = 'text-red-600 font-bold';
                    } else if (item.action_type === 'error') {
                        actionLabel = 'Error';
                        actionColor = 'text-orange-500';
                    }

                    return (
                        <div key={item.id} className={`flex justify-between items-center text-sm p-2 rounded ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                            <div className="flex-1 truncate pr-4">
                                <span className={`font-medium ${actionColor}`}>
                                    {actionLabel}
                                </span>
                                <span className={`mx-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {item.original_path.split('/').pop()}
                                </span>
                                <span className={`${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>&rarr;</span>
                                <span className={`ml-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                                    {item.new_path ? item.new_path.split('/').pop() : 'N/A'}
                                </span>
                            </div>
                            <div className={`text-xs whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {new Date(item.timestamp).toLocaleString()}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ActivityLog;
