import React, { useState, useEffect } from 'react';

export const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('soundcomp_cookie_consent');
    if (!consent) {
      // Delay visibility slightly for a premium feel
      const timer = setTimeout(() => setIsVisible(true), 1500);
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
      className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-50 bg-white/95 backdrop-blur-md border border-black/10 p-6 md:p-7 rounded-[2rem] shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 font-sans"
      role="dialog"
      aria-label="Privacy and cookies info"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🇪🇺</span>
          <h3 className="text-lg font-bold font-['Space_Grotesk'] tracking-tight text-black">
            Privacy & local data
          </h3>
        </div>
        
        <p className="text-sm text-neutral-600 leading-relaxed">
          sound_comp is an offline-first soundscape composer. All audio processing, voice recordings, and uploaded files stay strictly inside your browser.
        </p>

        {showDetails ? (
          <div className="mt-2 text-xs text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-3 leading-relaxed animate-in fade-in duration-200">
            <p>
              <strong>1. Audio Privacy:</strong> Your voice recordings, uploaded files, and composition streams are processed and saved solely inside your temporary browser memory. They are never sent to any remote server.
            </p>
            <p>
              <strong>2. Local Storage:</strong> We use standard browser <code>localStorage</code> to store essential functional state (such as recalling your sound pads across browser reloads) and recording your banner preference.
            </p>
            <p>
              <strong>3. Vercel Hosting & Logging:</strong> When published or accessed on hosting platforms like Vercel, standard technical server logs (including your IP address, browser user-agent string, page request timestamps, and routing data) are automatically and securely collected. These logs are processed solely by the hosting network infrastructure to analyze application performance, secure web traffic, and prevent DDoS attacks.
            </p>
            <p>
              <strong>4. Zero Marketing Tracking:</strong> We do not deploy any third-party tracking, targeting, or profiling cookies.
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
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
