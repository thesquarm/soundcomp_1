import React, { useState, useEffect } from 'react';

export const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('soundcomp_cookie_consent');
    if (!consent) {
      // Delay visibility slightly for a smooth entrance
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('soundcomp_cookie_consent', 'accepted');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-lg z-50 bg-white/95 backdrop-blur-md border border-black/10 p-6 md:p-7 rounded-[2rem] shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 font-sans"
      role="dialog"
      aria-label="Privacy and local data notice"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🇪🇺</span>
          <h3 className="text-lg font-bold font-display tracking-tight text-black">
            Privacy & Self-Contained App Notice
          </h3>
        </div>
        
        <p className="text-sm text-neutral-600 leading-relaxed">
          sound_comp is completely self-contained and privacy-friendly. All audio processing, recordings, and typography run locally on your device without third-party tracking.
        </p>

        {showDetails ? (
          <div className="mt-2 text-xs text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-3 leading-relaxed animate-in fade-in duration-200">
            <p>
              <strong>1. 100% Self-Hosted Assets:</strong> All fonts (Space Grotesk, Inter, JetBrains Mono) and application assets are bundled and served directly from this origin. No requests are made to Google Fonts, external CDNs, or third-party services.
            </p>
            <p>
              <strong>2. Local Audio Processing:</strong> Microphone audio recording, audio waveform synthesis, reverbs, pitch/speed adjustments, and WAV exports happen solely inside your browser memory via the Web Audio API. Audio data is never transmitted to any server.
            </p>
            <p>
              <strong>3. No Cookies or Tracking:</strong> We do not set any tracking, advertising, or marketing cookies. Standard browser <code>localStorage</code> is used only to remember this consent preference so you are not asked again.
            </p>
            <p>
              <strong>4. Server & Hosting Logs (Vercel):</strong> When you access this static web application on hosting providers like Vercel, standard HTTP server edge logs (such as truncated IP address, browser user-agent, request path, and timestamp) are processed strictly for secure packet delivery, DDoS mitigation, and routing (Art. 6(1)(f) GDPR).
            </p>
            <p>
              <strong>5. Strict Content Security Policy:</strong> Enforced through HTTP headers prohibiting third-party scripts, styles, external connections, and restricting device capabilities exclusively to microphone capture (Permissions-Policy).
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-black/5">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs font-semibold text-neutral-500 hover:text-black underline transition-colors"
          >
            {showDetails ? 'Hide details' : 'Learn more'}
          </button>
          
          <button 
            onClick={handleAccept}
            className="bg-black hover:bg-neutral-800 text-white font-semibold text-xs py-2.5 px-6 rounded-full transition-all active:scale-95 shadow-sm hover:shadow"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
