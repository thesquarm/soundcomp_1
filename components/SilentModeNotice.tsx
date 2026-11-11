import React from 'react';
import { SpeakerIcon } from './Icons';

interface SilentModeNoticeProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SilentModeNotice: React.FC<SilentModeNoticeProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-50 bg-white/95 backdrop-blur-md border border-black/10 p-5 md:p-6 rounded-[2rem] shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 font-sans"
      role="dialog"
      aria-label="iPhone sound and silent mode notice"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
            <SpeakerIcon className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold font-['Space_Grotesk'] tracking-tight text-black">
            Don't hear anything?
          </h3>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed">
          On iPhones and iPads, iOS automatically mutes browser sound when the <strong>physical silent switch</strong> (on the side of your phone) or <strong>Action Button</strong> is set to Silent Mode.
        </p>

        <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-xs text-neutral-600 space-y-1.5 leading-relaxed">
          <p className="flex items-start gap-2">
            <span className="font-bold text-black">•</span>
            <span><strong>Turn off Silent Mode:</strong> Flip the switch on the side of your iPhone so orange is not visible.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-bold text-black">•</span>
            <span><strong>Volume:</strong> Check that your media volume is turned up using the volume buttons.</span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-1 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-black hover:bg-neutral-800 text-white font-semibold text-xs py-2 px-5 rounded-full transition-all active:scale-95 shadow-sm hover:shadow"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default SilentModeNotice;
