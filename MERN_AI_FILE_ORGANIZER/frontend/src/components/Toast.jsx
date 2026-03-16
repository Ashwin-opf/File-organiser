import React, { useEffect } from 'react';

const Toast = ({ message, type = 'success', onClose, action }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgClass = type === 'error' ? 'bg-red-500/80' : 'bg-gray-900/80';
    return (
        <div className={`fixed bottom-6 right-6 ${bgClass} backdrop-blur-xl border border-white/10 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-up z-50`}>
            <span>{message}</span>
            {action && (
                <button
                    onClick={action.onClick}
                    className="bg-white text-gray-900 px-3 py-1 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors"
                >
                    {action.label}
                </button>
            )}
            <button onClick={onClose} className="opacity-50 hover:opacity-100 ml-2">&times;</button>
        </div>
    );
};

export default Toast;
