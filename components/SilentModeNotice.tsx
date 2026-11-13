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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-7 font-sans border border-black/5 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black flex-shrink-0">
            <SpeakerIcon className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold font-display uppercase tracking-tight text-zinc-950">
            No Sound?
          </h2>
        </div>
        <p className="text-xs text-zinc-600 font-mono tracking-widest uppercase mb-5 font-semibold">
          Audio troubleshooting
        </p>

        <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
          <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-1.5">
            <span className="block font-bold text-xs uppercase tracking-wider font-display text-black">
              1. iPhone & iPad Silent Mode
            </span>
            <p className="text-xs text-neutral-600 leading-relaxed">
              On iOS, Web Audio is automatically muted when the side switch is set to <strong>Silent Mode</strong> (orange showing) or the Control Center bell icon is active. Turn off Silent Mode to hear playback.
            </p>
          </div>

          <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-1.5">
            <span className="block font-bold text-xs uppercase tracking-wider font-display text-black">
              2. Volume & Bluetooth Audio
            </span>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Check that your device media volume is turned up, pad volume sliders are above 0%, and audio is not routing to connected Bluetooth headphones.
            </p>
          </div>

          <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-1.5">
            <span className="block font-bold text-xs uppercase tracking-wider font-display text-black">
              3. Microphone Access
            </span>
            <p className="text-xs text-neutral-600 leading-relaxed">
              If recording does not start, open the page directly in Safari or Chrome (not inside an app like WhatsApp) and allow microphone access in site settings.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 px-6 transition-all rounded-full shadow-sm hover:shadow active:scale-98 text-sm mt-6"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default SilentModeNotice;
