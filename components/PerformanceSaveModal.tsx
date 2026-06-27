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
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-7 font-sans border border-black/5"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold mb-3 font-['Space_Grotesk'] tracking-tight">Save Performance</h2>
                <p className="text-gray-500 mb-5 text-sm">Your performance is ready. Name your file and choose an option below.</p>
                
                <div className="mb-5">
                    <label htmlFor="fileName" className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 font-['Space_Grotesk']">File Name</label>
                    <input
                        type="text"
                        id="fileName"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm transition-all bg-neutral-50"
                    />
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 text-white font-semibold py-3 px-5 transition-all rounded-full shadow-sm hover:shadow active:scale-98 text-sm"
                    >
                        <DownloadIcon className="w-4 h-4" />
                        Save to Device
                    </button>
                    {canShare && (
                        <button
                            onClick={handleShare}
                            disabled={isSharing}
                            className="flex-1 flex items-center justify-center gap-2 bg-neutral-600 hover:bg-neutral-500 text-white font-semibold py-3 px-5 transition-all rounded-full disabled:bg-gray-200 disabled:text-gray-400 text-sm"
                        >
                            <ShareIcon className="w-4 h-4" />
                            {isSharing ? 'Sharing...' : 'Share'}
                        </button>
                    )}
                </div>

                <button 
                    onClick={onClose}
                    className="w-full text-center text-gray-400 hover:text-black mt-5 text-sm transition-colors font-medium"
                >
                    Close (and save later)
                </button>
            </div>
        </div>
    );
};

export default PerformanceSaveModal;
