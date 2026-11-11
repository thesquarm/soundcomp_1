import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PadState } from './types';
import SoundPad from './components/SoundPad';
import { PlayIcon, StopIcon, RecordIcon, AddIcon, SoundWaveIcon, DownloadIcon } from './components/Icons';
import { createImpulseResponse, audioBufferToWav, saveBlobAsFile } from './utils/audio';
import PerformanceSaveModal from './components/PerformanceSaveModal';
import AdviceGenerator from './components/AdviceGenerator';
import { CookieBanner } from './components/CookieBanner';

const createPadState = (id: number): PadState => ({
  id,
  name: `PAD ${id + 1}`,
  audioUrl: null,
  isPlaying: false,
  isRecording: false,
  playbackRate: 1,
  volume: 0.7,
  isLooping: false,
  reverbMix: 0.3,
  source: 'none',
  isReversed: false,
  isFilterEnabled: false,
  lowCut: 20,
  highCut: 22050,
  start: 0,
  end: 1,
});

// Factory function creates fresh pad objects on every mount (never reuses a shared mutable array)
const createInitialPads = (): PadState[] => Array.from({ length: 3 }, (_, i) => createPadState(i));

const PAD_COLORS = ['#B39EB5', '#B5B39E', '#91B39E', '#B5A29E', '#9EB5B3'];

interface SavedPerformance {
    blob: Blob;
    name: string;
    url: string;
}

const App: React.FC = () => {
  const [pads, setPads] = useState<PadState[]>(createInitialPads);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [impulseResponseBuffer, setImpulseResponseBuffer] = useState<AudioBuffer | null>(null);

  const [isRecordingPerformance, setIsRecordingPerformance] = useState(false);
  const [mixDestination, setMixDestination] = useState<MediaStreamAudioDestinationNode | null>(null);
  const performanceRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedPerformanceChunksRef = useRef<Blob[]>([]);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [performanceToSave, setPerformanceToSave] = useState<{ blob: Blob, defaultName: string } | null>(null);
  const [savedPerformances, setSavedPerformances] = useState<SavedPerformance[]>([]);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);
  
  useEffect(() => {
    const createReverb = async () => {
        const audioContext = getAudioContext();
        if (audioContext && !impulseResponseBuffer) {
            try {
                const buffer = await createImpulseResponse(audioContext, 4, 2);
                setImpulseResponseBuffer(buffer);
            } catch(e) {
                console.error("Failed to create impulse response:", e);
            }
        }
    };
    createReverb();
  }, [getAudioContext, impulseResponseBuffer]);

  // Fix for iOS Safari Web Audio interruption issue when backgrounded or locked
  useEffect(() => {
    const resumeAudio = async () => {
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended' || (audioContextRef.current as any).state === 'interrupted') {
          try {
            await audioContextRef.current.resume();
            console.log("AudioContext successfully resumed.");
          } catch (e) {
            console.warn("Failed to resume AudioContext automatically:", e);
          }
        }
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        resumeAudio();
      }
    };

    // User gesture fallback to wake up audio on mobile Safari
    const handleUserInteraction = () => {
      resumeAudio();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
    
    // Add touchstart and mousedown listeners on the window
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('mousedown', handleUserInteraction, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('mousedown', handleUserInteraction);
    };
  }, []);

  // Warn before closing or reloading tab to prevent accidental loss of recordings and settings
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasAudio = pads.some(p => p.audioUrl !== null || p.isRecording);
      const hasPerformances = savedPerformances.length > 0 || isRecordingPerformance || performanceToSave !== null;
      const hasModifiedPads = pads.length !== 3 || pads.some(p => 
        p.playbackRate !== 1 || 
        p.volume !== 0.7 || 
        p.isLooping || 
        p.reverbMix !== 0.3 || 
        p.isReversed || 
        p.isFilterEnabled || 
        p.start !== 0 || 
        p.end !== 1 ||
        p.name !== `PAD ${p.id + 1}`
      );

      if (hasAudio || hasPerformances || hasModifiedPads) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pads, savedPerformances, isRecordingPerformance, performanceToSave]);

  const updatePadState = useCallback((id: number, newValues: Partial<PadState>) => {
    setPads(prevPads =>
      prevPads.map(pad =>
        pad.id === id ? { ...pad, ...newValues } : pad
      )
    );
  }, []);

  const handleAddPad = useCallback(() => {
    setPads(prevPads => {
      if (prevPads.length >= 6) return prevPads;
      const newPadId = prevPads.length > 0 ? Math.max(...prevPads.map(p => p.id)) + 1 : 0;
      const newPad = createPadState(newPadId);
      return [...prevPads, newPad];
    });
  }, []);

  const handleDeletePad = useCallback((id: number) => {
    setPads(prevPads => {
      if (prevPads.length <= 1) {
        // Always maintain at least one pad; reset it if last
        return [createPadState(0)];
      }
      return prevPads.filter(pad => pad.id !== id);
    });
  }, []);
  
  const handlePlayAll = () => {
    getAudioContext(); 
    setPads(pads.map(p => p.audioUrl ? {...p, isPlaying: true} : p));
  };
  
  const handleStopAll = () => {
     setPads(pads.map(p => ({...p, isPlaying: false})));
  };

  const handleModalClose = () => {
    if (performanceToSave) {
        const url = URL.createObjectURL(performanceToSave.blob);
        setSavedPerformances(prev => [...prev, {
            blob: performanceToSave.blob,
            name: performanceToSave.defaultName,
            url
        }]);
    }
    setIsSaveModalOpen(false);
    setPerformanceToSave(null);
  };

  const handleTogglePerformanceRecord = () => {
      if (isRecordingPerformance) {
          performanceRecorderRef.current?.stop();
          setIsRecordingPerformance(false);
          setMixDestination(null);
      } else {
          const audioContext = getAudioContext();
          const dest = audioContext.createMediaStreamDestination();
          
          const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/aac',
            'audio/ogg'
          ];
          let supportedMimeType = '';
          if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
            for (const type of mimeTypes) {
              if (MediaRecorder.isTypeSupported(type)) {
                supportedMimeType = type;
                break;
              }
            }
          }

          const recorderOptions: MediaRecorderOptions = supportedMimeType ? { mimeType: supportedMimeType } : {};
          const recorder = new MediaRecorder(dest.stream, recorderOptions);

          recordedPerformanceChunksRef.current = [];

          recorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                  recordedPerformanceChunksRef.current.push(event.data);
              }
          };

          recorder.onstop = async () => {
              const finalMime = recorder.mimeType || supportedMimeType || 'audio/webm';
              const blob = new Blob(recordedPerformanceChunksRef.current, { type: finalMime });
              try {
                const actx = getAudioContext();
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await actx.decodeAudioData(arrayBuffer);
                const wavBlob = audioBufferToWav(audioBuffer);
                
                const now = new Date();
                const padDate = (n: number) => String(n).padStart(2, '0');
                const timeString = `${now.getFullYear()}${padDate(now.getMonth() + 1)}${padDate(now.getDate())}_${padDate(now.getHours())}${padDate(now.getMinutes())}${padDate(now.getSeconds())}`;

                setPerformanceToSave({
                    blob: wavBlob,
                    defaultName: `performance_${timeString}.wav`
                });
                setIsSaveModalOpen(true);
              } catch (e) {
                console.error("Error processing recorded performance:", e);
                alert("Could not process the recorded audio. Please try again.");
              } finally {
                recordedPerformanceChunksRef.current = [];
              }
          };

          performanceRecorderRef.current = recorder;
          recorder.start(100);
          setMixDestination(dest);
          setIsRecordingPerformance(true);
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 font-sans">
      {isRecordingPerformance && (
        <div className="fixed top-0 left-0 w-full h-2 bg-red-500 z-50 recording-indicator" role="status" aria-label="Recording in progress"></div>
      )}
      <header className="text-center my-8 md:my-10">
        <h1 className="text-5xl md:text-6xl font-black text-zinc-950 tracking-tight font-display uppercase select-none">
          sound_comp
        </h1>
        <p className="text-xs text-zinc-600 font-mono tracking-widest uppercase text-center mt-2.5 font-bold select-none">
          A minimalist soundscape composer
        </p>
        <SoundWaveIcon className="w-10 h-10 mt-3.5 mx-auto text-zinc-400" />
      </header>

      <AdviceGenerator />
      
      {performanceToSave && (
        <PerformanceSaveModal 
            isOpen={isSaveModalOpen}
            performance={performanceToSave}
            onClose={handleModalClose}
            onSaveComplete={() => {
                setIsSaveModalOpen(false);
                setPerformanceToSave(null);
            }}
        />
      )}

      <main className="w-full max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {pads.map(pad => (
            <SoundPad
              key={pad.id}
              padState={pad}
              updatePadState={updatePadState}
              onDeletePad={handleDeletePad}
              canDelete={pads.length > 1}
              getAudioContext={getAudioContext}
              impulseResponseBuffer={impulseResponseBuffer}
              mixDestination={mixDestination}
              padColor={PAD_COLORS[pad.id % PAD_COLORS.length]}
            />
          ))}
        </div>

        {pads.length < 6 && (
            <div className="mt-8 flex justify-center">
                <button
                    type="button"
                    onClick={handleAddPad}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-black font-semibold py-3 px-8 transition-all border border-gray-200 shadow-sm hover:shadow-md rounded-full active:scale-95"
                >
                    <AddIcon className="w-5 h-5" />
                    Add Pad
                </button>
            </div>
        )}

        <div className="mt-12 flex justify-center gap-3 flex-wrap">
            <button
                type="button"
                onClick={handleTogglePerformanceRecord}
                disabled={pads.every(p => !p.audioUrl)}
                className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white font-semibold py-3 px-8 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-base rounded-full shadow-sm hover:shadow-md active:scale-95"
            >
                <RecordIcon className="w-5 h-5" />
                {isRecordingPerformance ? 'Stop Recording' : 'Record Performance'}
            </button>
            <button
                type="button"
                onClick={handlePlayAll}
                className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white font-semibold py-3 px-8 transition-all text-base rounded-full shadow-sm hover:shadow-md active:scale-95"
            >
                <PlayIcon className="w-5 h-5" />
                Play All
            </button>
            <button
                type="button"
                onClick={handleStopAll}
                className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white font-semibold py-3 px-8 transition-all text-base rounded-full shadow-sm hover:shadow-md active:scale-95"
            >
                <StopIcon className="w-5 h-5" />
                Stop All
            </button>
        </div>
        
        {savedPerformances.length > 0 && (
            <div className="mt-12 w-full max-w-md mx-auto">
                <h3 className="text-center text-lg font-bold mb-3 font-display">Unsaved Recordings</h3>
                <ul className="bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-3xl p-3 space-y-2 shadow-sm">
                    {savedPerformances.map((perf, index) => (
                        <li key={index} className="flex items-center justify-between p-3 bg-white/90 rounded-2xl shadow-sm border border-black/5">
                            <span className="text-sm font-mono truncate mr-2 text-gray-700">{perf.name}</span>
                            <button 
                                type="button"
                                onClick={() => saveBlobAsFile(perf.blob, perf.name)}
                                className="p-2 rounded-full hover:bg-gray-100 text-black transition-colors"
                                title="Download"
                                aria-label={`Download ${perf.name}`}
                            >
                                <DownloadIcon className="w-5 h-5" />
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </main>
      <footer className="text-center mt-16 mb-8 text-sm text-black/60 max-w-2xl px-4">
        <p className="leading-relaxed">
          App by Philip and Google AI Studio / Part of{' '}
          <a 
            href="https://openmusic.academy/docs/8SRk2JZtBFy7UsNb2Vs36h/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="underline hover:text-black font-semibold transition-colors"
          >
            sustain_sound by the TEAM project
          </a>{' '}
          on{' '}
          <a 
            href="https://openmusic.academy" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="underline hover:text-black font-semibold transition-colors"
          >
            OMA
          </a>{' '}
          / If you have any questions or feedback, please contact{' '}
          <a 
            href="mailto:p.stade@mh-freiburg.de" 
            className="underline hover:text-black transition-colors"
          >
            Philip, p.stade@mh-freiburg.de
          </a>
        </p>
      </footer>
      <CookieBanner />
    </div>
  );
};

export default App;
