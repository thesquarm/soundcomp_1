import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PadState } from './types';
import SoundPad from './components/SoundPad';
import { PlayIcon, StopIcon, RecordIcon, AddIcon, SoundWaveIcon, DownloadIcon, SpeakerIcon, MailIcon } from './components/Icons';
import {
  createImpulseResponseSync,
  audioBufferToWav,
  saveBlobAsFile,
  getAudioContextConstructor,
  unlockAudioContext,
  ensureAudioContextRunning,
  decodeAudioDataCompat,
  getSupportedRecorderMimeType,
  encodeFloat32ChunksToWav,
} from './utils/audio';
import PerformanceSaveModal from './components/PerformanceSaveModal';
import AdviceGenerator from './components/AdviceGenerator';
import { CookieBanner } from './components/CookieBanner';
import SilentModeNotice from './components/SilentModeNotice';

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
const MAX_PERFORMANCE_PCM_SECONDS = 300; // 5-minute safety cap

interface SavedPerformance {
  blob: Blob;
  name: string;
  url: string;
}

const App: React.FC = () => {
  const [pads, setPads] = useState<PadState[]>(createInitialPads);
  const audioContextRef = useRef<AudioContext | null>(null);
  const impulseResponseRef = useRef<AudioBuffer | null>(null);

  const [isRecordingPerformance, setIsRecordingPerformance] = useState(false);
  const [mixDestination, setMixDestination] = useState<AudioNode | null>(null);
  const [performanceError, setPerformanceError] = useState<string | null>(null);

  const performanceRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedPerformanceChunksRef = useRef<Blob[]>([]);
  const perfMimeTypeRef = useRef<string>('');
  const perfCaptureNodesRef = useRef<{
    inputGain?: GainNode;
    processor?: ScriptProcessorNode;
    silentGain?: GainNode;
    leftChunks: Float32Array[];
    rightChunks: Float32Array[];
    totalFrames: number;
    hasSignal: boolean;
    sampleRate: number;
  } | null>(null);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [performanceToSave, setPerformanceToSave] = useState<{ blob: Blob; defaultName: string } | null>(null);
  const [savedPerformances, setSavedPerformances] = useState<SavedPerformance[]>([]);
  const [showSilentNotice, setShowSilentNotice] = useState(false);

  // Lazy AudioContext creation & safe unlock/resume handling both 'suspended' and iOS 'interrupted'
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || (audioContextRef.current.state as string) === 'closed') {
      const AudioContextClass = getAudioContextConstructor();
      audioContextRef.current = new AudioContextClass();
      impulseResponseRef.current = null;
    }
    const ctx = audioContextRef.current;
    const state = ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      ctx.resume().catch(() => {
        // Will retry cleanly on next user gesture
      });
    }
    return ctx;
  }, []);

  // Synchronous impulse response getter so SoundPads never hit an async race when creating audio graphs
  const getImpulseResponseBuffer = useCallback((ctx: AudioContext): AudioBuffer | null => {
    if (!impulseResponseRef.current || impulseResponseRef.current.sampleRate !== ctx.sampleRate) {
      try {
        impulseResponseRef.current = createImpulseResponseSync(ctx, 4, 2);
      } catch (e) {
        console.error('Failed to create impulse response:', e);
        return null;
      }
    }
    return impulseResponseRef.current;
  }, []);

  // Fix for iOS Safari Web Audio interruption issue when backgrounded, locked, or returning from other apps
  useEffect(() => {
    const resumeExistingAudio = async () => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const state = ctx.state as string;
      if (state === 'suspended' || state === 'interrupted') {
        try {
          await ctx.resume();
        } catch {
          // Will unlock on next touch/click
        }
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void resumeExistingAudio();
      }
    };

    const handleUserInteraction = () => {
      const ctx = audioContextRef.current;
      if (ctx) {
        unlockAudioContext(ctx);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
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

  const handleCloseSilentNotice = useCallback(() => {
    setShowSilentNotice(false);
  }, []);

  // Warn before closing or reloading tab to prevent accidental loss of recordings and settings
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasAudio = pads.some((p) => p.audioUrl !== null || p.isRecording);
      const hasPerformances = savedPerformances.length > 0 || isRecordingPerformance || performanceToSave !== null;
      const hasModifiedPads =
        pads.length !== 3 ||
        pads.some(
          (p) =>
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
    setPads((prevPads) => prevPads.map((pad) => (pad.id === id ? { ...pad, ...newValues } : pad)));
  }, []);

  const handleAddPad = useCallback(() => {
    setPads((prevPads) => {
      if (prevPads.length >= 6) return prevPads;
      const newPadId = prevPads.length > 0 ? Math.max(...prevPads.map((p) => p.id)) + 1 : 0;
      const newPad = createPadState(newPadId);
      return [...prevPads, newPad];
    });
  }, []);

  const handleDeletePad = useCallback((id: number) => {
    setPads((prevPads) => {
      if (prevPads.length <= 1) {
        return [createPadState(0)];
      }
      return prevPads.filter((pad) => pad.id !== id);
    });
  }, []);

  const handlePlayAll = () => {
    const ctx = getAudioContext();
    unlockAudioContext(ctx);
    setPads((prevPads) => prevPads.map((p) => (p.audioUrl ? { ...p, isPlaying: true } : p)));
  };

  const handleStopAll = () => {
    setPads((prevPads) => prevPads.map((p) => ({ ...p, isPlaying: false })));
  };

  const handleModalClose = () => {
    if (performanceToSave) {
      const url = URL.createObjectURL(performanceToSave.blob);
      setSavedPerformances((prev) => [
        ...prev,
        {
          blob: performanceToSave.blob,
          name: performanceToSave.defaultName,
          url,
        },
      ]);
    }
    setIsSaveModalOpen(false);
    setPerformanceToSave(null);
  };

  const makePerformanceFilename = () => {
    const now = new Date();
    const padDate = (n: number) => String(n).padStart(2, '0');
    const timeString = `${now.getFullYear()}${padDate(now.getMonth() + 1)}${padDate(now.getDate())}_${padDate(now.getHours())}${padDate(now.getMinutes())}${padDate(now.getSeconds())}`;
    return `performance_${timeString}.wav`;
  };

  const handleTogglePerformanceRecord = async () => {
    setPerformanceError(null);

    if (isRecordingPerformance) {
      const recorder = performanceRecorderRef.current;
      performanceRecorderRef.current = null;

      // Stop PCM capture nodes cleanly
      const capture = perfCaptureNodesRef.current;
      perfCaptureNodesRef.current = null;
      if (capture) {
        if (capture.processor) {
          capture.processor.onaudioprocess = null;
          try { capture.processor.disconnect(); } catch { /* ignore */ }
        }
        if (capture.silentGain) {
          try { capture.silentGain.disconnect(); } catch { /* ignore */ }
        }
        if (capture.inputGain) {
          try { capture.inputGain.disconnect(); } catch { /* ignore */ }
        }
      }

      setIsRecordingPerformance(false);
      setMixDestination(null);

      // Stop MediaRecorder if it was active
      if (recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
          };
          const timer = window.setTimeout(finish, 1500);
          recorder.onstop = () => {
            window.clearTimeout(timer);
            finish();
          };
          try {
            recorder.stop();
          } catch {
            window.clearTimeout(timer);
            finish();
          }
        });
      }

      const mrChunks = recordedPerformanceChunksRef.current;
      recordedPerformanceChunksRef.current = [];

      // Prefer direct lossless stereo PCM WAV capture (immune to iOS MediaStreamAudioDestinationNode MediaRecorder bugs)
      if (capture && capture.totalFrames > 0 && capture.hasSignal) {
        const wavBlob = encodeFloat32ChunksToWav(
          [capture.leftChunks, capture.rightChunks],
          capture.totalFrames,
          capture.sampleRate
        );
        setPerformanceToSave({
          blob: wavBlob,
          defaultName: makePerformanceFilename(),
        });
        setIsSaveModalOpen(true);
        return;
      }

      // Fallback to MediaRecorder chunks if PCM didn't receive signal
      if (mrChunks.length > 0) {
        try {
          const finalMime = recorder?.mimeType || perfMimeTypeRef.current || 'audio/webm';
          const blob = new Blob(mrChunks, { type: finalMime });
          const actx = getAudioContext();
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await decodeAudioDataCompat(actx, arrayBuffer);
          const wavBlob = audioBufferToWav(audioBuffer);
          setPerformanceToSave({
            blob: wavBlob,
            defaultName: makePerformanceFilename(),
          });
          setIsSaveModalOpen(true);
          return;
        } catch (e) {
          console.error('Error decoding MediaRecorder performance:', e);
        }
      }

      // If user recorded silence/paused pads and PCM frames exist, still produce valid WAV
      if (capture && capture.totalFrames > 0) {
        const wavBlob = encodeFloat32ChunksToWav(
          [capture.leftChunks, capture.rightChunks],
          capture.totalFrames,
          capture.sampleRate
        );
        setPerformanceToSave({
          blob: wavBlob,
          defaultName: makePerformanceFilename(),
        });
        setIsSaveModalOpen(true);
        return;
      }

      setPerformanceError('Could not capture audio for this performance. Start playing at least one pad while recording.');
      return;
    }

    // Starting Performance Recording
    const audioContext = getAudioContext();
    await ensureAudioContextRunning(audioContext);

    const mixInputGain = audioContext.createGain();
    mixInputGain.gain.value = 1;

    const captureState = {
      inputGain: mixInputGain,
      processor: undefined as ScriptProcessorNode | undefined,
      silentGain: undefined as GainNode | undefined,
      leftChunks: [] as Float32Array[],
      rightChunks: [] as Float32Array[],
      totalFrames: 0,
      hasSignal: false,
      sampleRate: audioContext.sampleRate || 44100,
    };

    if (typeof audioContext.createScriptProcessor === 'function') {
      const processor = audioContext.createScriptProcessor(4096, 2, 2);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      const maxFrames = Math.floor(captureState.sampleRate * MAX_PERFORMANCE_PCM_SECONDS);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (captureState.totalFrames >= maxFrames) return;
        const left = event.inputBuffer.getChannelData(0);
        const right = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : left;
        if (!left || left.length === 0) return;

        const leftCopy = new Float32Array(left.length);
        const rightCopy = new Float32Array(right.length);
        leftCopy.set(left);
        rightCopy.set(right);

        if (!captureState.hasSignal) {
          for (let i = 0; i < leftCopy.length; i += 8) {
            if (Math.abs(leftCopy[i]) > 1e-6 || Math.abs(rightCopy[i]) > 1e-6) {
              captureState.hasSignal = true;
              break;
            }
          }
        }

        captureState.leftChunks.push(leftCopy);
        captureState.rightChunks.push(rightCopy);
        captureState.totalFrames += leftCopy.length;
      };

      mixInputGain.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      captureState.processor = processor;
      captureState.silentGain = silentGain;
    }

    perfCaptureNodesRef.current = captureState;
    recordedPerformanceChunksRef.current = [];

    if (typeof MediaRecorder !== 'undefined' && typeof audioContext.createMediaStreamDestination === 'function') {
      try {
        const dest = audioContext.createMediaStreamDestination();
        mixInputGain.connect(dest);
        const supportedMimeType = getSupportedRecorderMimeType();
        perfMimeTypeRef.current = supportedMimeType;
        const recorderOptions: MediaRecorderOptions = supportedMimeType ? { mimeType: supportedMimeType } : {};
        const recorder = new MediaRecorder(dest.stream, recorderOptions);
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedPerformanceChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        performanceRecorderRef.current = recorder;
      } catch (e) {
        console.warn('Performance MediaRecorder fallback unavailable, using direct PCM capture:', e);
      }
    }

    setMixDestination(mixInputGain);
    setIsRecordingPerformance(true);
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
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3.5">
          <SoundWaveIcon className="w-10 h-10 text-zinc-400" />
          <button
            type="button"
            onClick={() => setShowSilentNotice(true)}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-700 hover:text-black transition-all bg-white hover:bg-gray-50 border border-black/10 shadow-xs hover:shadow-sm px-3.5 py-1.5 rounded-full active:scale-95 cursor-pointer"
            title="Audio & silent mode troubleshooting"
            aria-label="No sound? Audio troubleshooting guide"
          >
            <SpeakerIcon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            <span className="font-semibold">No sound?</span>
          </button>
          <a
            href="mailto:p.stade@mh-freiburg.de"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-700 hover:text-black transition-all bg-white hover:bg-gray-50 border border-black/10 shadow-xs hover:shadow-sm px-3.5 py-1.5 rounded-full active:scale-95 cursor-pointer"
            title="Send feedback or report a problem"
            aria-label="Enjoying the app or having problems? Email p.stade@mh-freiburg.de"
          >
            <MailIcon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            <span className="font-semibold">Enjoying the app or having problems?</span>
          </a>
        </div>
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
          {pads.map((pad) => (
            <SoundPad
              key={pad.id}
              padState={pad}
              updatePadState={updatePadState}
              onDeletePad={handleDeletePad}
              canDelete={pads.length > 1}
              getAudioContext={getAudioContext}
              getImpulseResponseBuffer={getImpulseResponseBuffer}
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

        {performanceError && (
          <div
            role="alert"
            className="mt-6 max-w-md mx-auto px-4 py-3 rounded-2xl bg-red-950 text-white text-xs leading-relaxed flex items-center justify-between gap-3 shadow-md"
          >
            <span>{performanceError}</span>
            <button
              type="button"
              onClick={() => setPerformanceError(null)}
              className="text-white/75 hover:text-white font-bold px-1 flex-shrink-0"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <div className="mt-12 flex justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleTogglePerformanceRecord}
            disabled={!isRecordingPerformance && pads.every((p) => !p.audioUrl)}
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
        <p className="mt-2 font-mono text-xs text-black/45 tracking-wider">
          sound_compV3.5
        </p>
      </footer>
      <CookieBanner />
      <SilentModeNotice isOpen={showSilentNotice} onClose={handleCloseSilentNotice} />
    </div>
  );
};

export default App;
