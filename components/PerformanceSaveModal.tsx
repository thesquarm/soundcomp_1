import React, { useState, useEffect } from 'react';
import { DownloadIcon, ShareIcon } from './Icons';

interface PerformanceSaveModalProps {
    isOpen: boolean;
    performance: { blob: Blob; defaultName: string } | null;
    onClose: () => void;
    onSaveComplete: () => void;
}

const PerformanceSaveModal: React.FC<PerformanceSaveModalProps> = ({ isOpen, performance, onClose, onSaveComplete }) => {
    const [fileName, setFileName] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (performance) {
            setFileName(performance.defaultName);
        }
        // Check for Web Share API availability
        if (navigator.share && performance?.blob) {
            const file = new File([performance.blob], "temp.wav", { type: "audio/wav" });
             if (navigator.canShare && navigator.canShare({ files: [file] })) {
                setCanShare(true);
             }
        } else {
            setCanShare(false);
        }
    }, [performance]);

    const handleSave = () => {
        if (!performance) return;
        const url = URL.createObjectURL(performance.blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName.endsWith('.wav') ? fileName : `${fileName}.wav`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        onSaveComplete();
    };

    const handleShare = async () => {
        if (!performance || !navigator.share) return;
        
        const file = new File([performance.blob], fileName, { type: performance.blob.type });
        
        try {
            setIsSharing(true);
            await navigator.share({
                files: [file],
                title: fileName,
                text: 'A performance from sound_comp',
            });
            onSaveComplete();
        } catch (error) {
            console.error('Error sharing:', error);
            // User cancelled share, etc.
        } finally {
            setIsSharing(false);
        }
    };
    
    if (!isOpen || !performance) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 font-sans"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold mb-4">Save Performance</h2>
                <p className="text-gray-600 mb-4">Your performance is ready. Name your file and choose an option below.</p>
                
                <div className="mb-4">
                    <label htmlFor="fileName" className="block text-sm font-medium text-gray-700 mb-1">File Name</label>
                    <input
                        type="text"
                        id="fileName"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-black focus:border-black"
                    />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 bg-black hover:bg-gray-800 text-white font-semibold py-3 px-4 transition-colors rounded-md"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        Save to Device
                    </button>
                    {canShare && (
                        <button
                            onClick={handleShare}
                            disabled={isSharing}
                            className="flex-1 flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-3 px-4 transition-colors rounded-md disabled:bg-gray-300"
                        >
                            <ShareIcon className="w-5 h-5" />
                            {isSharing ? 'Sharing...' : 'Share'}
                        </button>
                    )}
                </div>

                <button 
                    onClick={onClose}
                    className="w-full text-center text-gray-500 hover:text-black mt-4 text-sm"
                >
                    Close (and save later)
                </button>
            </div>
        </div>
    );
};

export default PerformanceSaveModal;
