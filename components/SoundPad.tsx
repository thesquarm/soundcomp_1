import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PadState } from '../types';
import { useRecorder } from '../hooks/useRecorder';
import { PlayIcon, PauseIcon, RecordIcon, StopIcon, TrashIcon, DownloadIcon, UploadIcon, RecycleIcon } from './Icons';
import { VisualizerCanvas } from './VisualizerCanvas';
import { StaticWaveform } from './StaticWaveform';
import { RangeSlider } from './RangeSlider';
import {
  blobToAudioBuffer,
  reverseAudioBuffer,
  audioBufferToWav,
  saveBlobAsFile,
  registerAudioBlob,
  unregisterAudioBlob,
  unlockAudioContext,
  ensureAudioContextRunning,
} from '../utils/audio';

interface SoundPadProps {
  padState: PadState;
  updatePadState: (id: number, newValues: Partial<PadState>) => void;
  onDeletePad: (id: number) => void;
  canDelete: boolean;
  getAudioContext: () => AudioContext;
  getImpulseResponseBuffer: (ctx: AudioContext) => AudioBuffer | null;
  mixDestination: AudioNode | null;
  padColor: string;
}

interface ActivePlayback {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const FADE_TIME = 0.01; // 10ms click-free fade

const SoundPad: React.FC<SoundPadProps> = ({
  padState,
  updatePadState,
  onDeletePad,
  canDelete,
  getAudioContext,
  getImpulseResponseBuffer,
  mixDestination,
  padColor,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    isRecording: isRecorderActive,
    startRecording,
    stopRecording,
    analyserNode: recorderAnalyserNode,
    error: recorderError,
    clearError: clearRecorderError,
  } = useRecorder();

  const audioBufferRef = useRef<{ original: AudioBuffer | null; reversed: AudioBuffer | null }>({
    original: null,
    reversed: null,
  });
  const activePlaybackRef = useRef<ActivePlayback | null>(null);
  const stopTimersRef = useRef<number[]>([]);

  const [isBufferReady, setIsBufferReady] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackAnalyserNode, setPlaybackAnalyserNode] = useState<AnalyserNode | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const playbackStartRef = useRef<{ contextTime: number; mediaOffset: number } | null>(null);

  const padStateRef = useRef(padState);
  padStateRef.current = padState;

  const mixDestinationRef = useRef(mixDestination);
  mixDestinationRef.current = mixDestination;

  const latestAudioUrlRef = useRef<string | null>(padState.audioUrl);
  latestAudioUrlRef.current = padState.audioUrl;

  const audioNodesRef = useRef<{
    analyser?: AnalyserNode;
    convolver?: ConvolverNode;
    wetGain?: GainNode;
    dryGain?: GainNode;
    volumeGain?: GainNode;
    masterOut?: GainNode;
    lowCutFilter?: BiquadFilterNode;
    highCutFilter?: BiquadFilterNode;
  }>({});

  const stopActivePlayback = useCallback((immediate = false) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPlaybackProgress(null);
    playbackStartRef.current = null;

    const current = activePlaybackRef.current;
    if (!current) return;
    activePlaybackRef.current = null;

    const { source, gain } = current;
    source.onended = null;

    const cleanupNodes = () => {
      try {
        source.stop();
      } catch {
        // ignore if already stopped
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
    };

    try {
      const ctx = getAudioContext();
      if (!immediate && ctx.state === 'running') {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + FADE_TIME);
        source.stop(now + FADE_TIME + 0.015);
        const timerId = window.setTimeout(() => {
          cleanupNodes();
          stopTimersRef.current = stopTimersRef.current.filter((id) => id !== timerId);
        }, FADE_TIME * 1000 + 60);
        stopTimersRef.current.push(timerId);
        return;
      }
    } catch {
      // fall through to immediate cleanup
    }

    cleanupNodes();
  }, [getAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimersRef.current.forEach((id) => clearTimeout(id));
      stopTimersRef.current = [];
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      const active = activePlaybackRef.current;
      if (active) {
        active.source.onended = null;
        try { active.source.stop(); } catch { /* ignore */ }
        try { active.source.disconnect(); } catch { /* ignore */ }
        try { active.gain.disconnect(); } catch { /* ignore */ }
        activePlaybackRef.current = null;
      }
      Object.values(audioNodesRef.current).forEach((node) => {
        try { (node as AudioNode)?.disconnect(); } catch { /* ignore */ }
      });
      const urlToCleanup = latestAudioUrlRef.current;
      if (urlToCleanup) {
        unregisterAudioBlob(urlToCleanup);
        if (urlToCleanup.startsWith('blob:')) {
          try { URL.revokeObjectURL(urlToCleanup); } catch { /* ignore */ }
        }
      }
    };
  }, []);

  // Guard against any stale recording flags on initial page load
  useEffect(() => {
    if (padState.isRecording && !isRecorderActive) {
      updatePadState(padState.id, { isRecording: false });
    }
  }, []);

  const setupAudioGraph = useCallback(() => {
    if (Object.keys(audioNodesRef.current).length > 0) return;

    const audioContext = getAudioContext();
    const nodes = audioNodesRef.current;
    const state = padStateRef.current;

    try {
      nodes.analyser = audioContext.createAnalyser();
      nodes.analyser.fftSize = 256;

      nodes.volumeGain = audioContext.createGain();
      nodes.volumeGain.gain.value = state.volume;

      nodes.masterOut = audioContext.createGain();
      nodes.masterOut.gain.value = 1;

      nodes.lowCutFilter = audioContext.createBiquadFilter();
      nodes.lowCutFilter.type = 'highpass';
      nodes.lowCutFilter.frequency.value = state.isFilterEnabled ? state.lowCut : 20;

      nodes.highCutFilter = audioContext.createBiquadFilter();
      nodes.highCutFilter.type = 'lowpass';
      nodes.highCutFilter.frequency.value = state.isFilterEnabled ? state.highCut : 22050;

      nodes.analyser.connect(nodes.volumeGain);
      nodes.volumeGain.connect(nodes.lowCutFilter);
      nodes.lowCutFilter.connect(nodes.highCutFilter);
      const lastNode: AudioNode = nodes.highCutFilter;

      const irBuffer = getImpulseResponseBuffer(audioContext);
      if (irBuffer) {
        nodes.convolver = audioContext.createConvolver();
        nodes.convolver.buffer = irBuffer;
        nodes.wetGain = audioContext.createGain();
        nodes.dryGain = audioContext.createGain();

        const mix = state.reverbMix;
        nodes.dryGain.gain.value = Math.cos(mix * 0.5 * Math.PI);
        nodes.wetGain.gain.value = Math.cos((1.0 - mix) * 0.5 * Math.PI);

        lastNode.connect(nodes.dryGain);
        lastNode.connect(nodes.wetGain);

        nodes.dryGain.connect(nodes.masterOut);
        nodes.wetGain.connect(nodes.convolver);
        nodes.convolver.connect(nodes.masterOut);
      } else {
        lastNode.connect(nodes.masterOut);
      }

      nodes.masterOut.connect(audioContext.destination);
      if (mixDestinationRef.current) {
        nodes.masterOut.connect(mixDestinationRef.current);
      }
      setPlaybackAnalyserNode(nodes.analyser);
    } catch (e) {
      console.error('Error setting up audio graph:', e);
    }
  }, [getAudioContext, getImpulseResponseBuffer]);

  const handleClearAudio = useCallback(() => {
    stopActivePlayback(true);
    stopTimersRef.current.forEach((id) => clearTimeout(id));
    stopTimersRef.current = [];

    Object.values(audioNodesRef.current).forEach((node) => {
      try { (node as AudioNode)?.disconnect(); } catch { /* ignore */ }
    });
    audioNodesRef.current = {};
    audioBufferRef.current = { original: null, reversed: null };
    setIsBufferReady(false);
    setIsDecoding(false);
    setAudioError(null);
    clearRecorderError();
    setPlaybackAnalyserNode(null);

    if (padState.audioUrl) {
      unregisterAudioBlob(padState.audioUrl);
      if (padState.audioUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(padState.audioUrl); } catch { /* ignore */ }
      }
    }

    updatePadState(padState.id, {
      name: `PAD ${padState.id + 1}`,
      audioUrl: null,
      isPlaying: false,
      isRecording: false,
      isLooping: false,
      reverbMix: 0.3,
      volume: 0.7,
      source: 'none',
      isReversed: false,
      isFilterEnabled: false,
      lowCut: 20,
      highCut: 22050,
      start: 0,
      end: 1,
    });
  }, [padState.id, padState.audioUrl, updatePadState, stopActivePlayback, clearRecorderError]);

  // Load & decode audio whenever padState.audioUrl changes (never re-runs on mixDestination changes!)
  useEffect(() => {
    let isCancelled = false;

    const loadAudio = async () => {
      if (!padState.audioUrl) {
        audioBufferRef.current = { original: null, reversed: null };
        setIsBufferReady(false);
        setIsDecoding(false);
        return;
      }

      setIsBufferReady(false);
      setIsDecoding(true);
      setAudioError(null);

      const audioContext = getAudioContext();
      try {
        const originalBuffer = await blobToAudioBuffer(audioContext, padState.audioUrl);
        if (isCancelled) return;
        const reversedBuffer = reverseAudioBuffer(audioContext, originalBuffer);
        audioBufferRef.current = { original: originalBuffer, reversed: reversedBuffer };
        setupAudioGraph();
        setIsBufferReady(true);
      } catch (error) {
        if (isCancelled) return;
        console.error('Failed to load audio buffer:', error);
        audioBufferRef.current = { original: null, reversed: null };
        setIsBufferReady(false);
        setAudioError('Could not play this audio format. Try recording again or using a WAV/MP3/M4A file.');
        updatePadState(padState.id, { isPlaying: false });
      } finally {
        if (!isCancelled) {
          setIsDecoding(false);
        }
      }
    };

    loadAudio();
    return () => {
      isCancelled = true;
    };
  }, [padState.audioUrl, padState.id, getAudioContext, setupAudioGraph, updatePadState]);

  const updateCursor = useCallback(() => {
    const active = activePlaybackRef.current;
    if (!padStateRef.current.isPlaying || !active?.source.buffer || !playbackStartRef.current) {
      setPlaybackProgress(null);
      animationFrameRef.current = null;
      return;
    }

    const audioContext = getAudioContext();
    const bufferDuration = active.source.buffer.duration;
    if (bufferDuration <= 0) {
      setPlaybackProgress(null);
      animationFrameRef.current = null;
      return;
    }

    const { contextTime: startTime, mediaOffset: startOffset } = playbackStartRef.current;
    const { start, end, playbackRate, isLooping } = padStateRef.current;

    const playbackRangeStart = start * bufferDuration;
    const playbackRangeEnd = end * bufferDuration;
    const playbackRangeDuration = playbackRangeEnd - playbackRangeStart;

    if (playbackRangeDuration <= 0) {
      setPlaybackProgress(null);
      animationFrameRef.current = null;
      return;
    }

    const elapsedContextTime = Math.max(0, audioContext.currentTime - startTime);
    const elapsedMediaTime = elapsedContextTime * playbackRate;

    let currentBufferTime: number;
    if (isLooping) {
      currentBufferTime = playbackRangeStart + (elapsedMediaTime % playbackRangeDuration);
    } else {
      currentBufferTime = startOffset + elapsedMediaTime;
      if (currentBufferTime >= playbackRangeEnd) {
        setPlaybackProgress(null);
        animationFrameRef.current = null;
        return;
      }
    }

    const progress = Math.max(0, Math.min(1, currentBufferTime / bufferDuration));
    setPlaybackProgress(progress);

    animationFrameRef.current = requestAnimationFrame(updateCursor);
  }, [getAudioContext]);

  // Playback start/stop controller — waits for AudioContext resume and buffer readiness cleanly
  useEffect(() => {
    if (!padState.isPlaying || !isBufferReady) {
      stopActivePlayback(false);
      return;
    }

    let isCancelled = false;

    const startPlayback = async () => {
      const audioContext = getAudioContext();
      await ensureAudioContextRunning(audioContext);
      if (isCancelled) return;

      setupAudioGraph();
      const analyser = audioNodesRef.current.analyser;
      const bufferToPlay = padStateRef.current.isReversed
        ? audioBufferRef.current.reversed
        : audioBufferRef.current.original;

      if (!analyser || !bufferToPlay) {
        return;
      }

      // Stop any existing source cleanly before starting the new one
      stopActivePlayback(true);

      const sourceNode = audioContext.createBufferSource();
      const playGainNode = audioContext.createGain();

      sourceNode.buffer = bufferToPlay;
      sourceNode.playbackRate.value = padStateRef.current.playbackRate;

      const now = audioContext.currentTime;
      playGainNode.gain.setValueAtTime(0, now);
      playGainNode.gain.linearRampToValueAtTime(1, now + FADE_TIME);

      sourceNode.connect(playGainNode);
      playGainNode.connect(analyser);

      const playbackEntry: ActivePlayback = { source: sourceNode, gain: playGainNode };
      activePlaybackRef.current = playbackEntry;

      sourceNode.onended = () => {
        try { sourceNode.disconnect(); } catch { /* ignore */ }
        try { playGainNode.disconnect(); } catch { /* ignore */ }
        if (activePlaybackRef.current === playbackEntry) {
          activePlaybackRef.current = null;
          if (!sourceNode.loop) {
            updatePadState(padStateRef.current.id, { isPlaying: false });
          }
        }
      };

      const bufferDuration = bufferToPlay.duration;
      const offset = Math.max(0, Math.min(bufferDuration, padStateRef.current.start * bufferDuration));
      const end = Math.max(offset, Math.min(bufferDuration, padStateRef.current.end * bufferDuration));

      if (padStateRef.current.isLooping) {
        sourceNode.loop = true;
        sourceNode.loopStart = offset;
        sourceNode.loopEnd = end > offset ? end : bufferDuration;
        sourceNode.start(0, offset);
      } else {
        const duration = Math.max(0.01, end - offset);
        sourceNode.start(0, offset, duration);
      }

      playbackStartRef.current = { contextTime: audioContext.currentTime, mediaOffset: offset };
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(updateCursor);
    };

    void startPlayback();

    return () => {
      isCancelled = true;
    };
  }, [
    padState.isPlaying,
    padState.isReversed,
    padState.isLooping,
    isBufferReady,
    getAudioContext,
    setupAudioGraph,
    stopActivePlayback,
    updateCursor,
    updatePadState,
  ]);

  // Update live parameters smoothly whenever sliders or buffer readiness change
  useEffect(() => {
    const audioContext = getAudioContext();
    const nodes = audioNodesRef.current;
    const { playbackRate, reverbMix, volume, isFilterEnabled, lowCut, highCut, start, end } = padState;

    const active = activePlaybackRef.current;
    if (active) {
      active.source.playbackRate.value = playbackRate;
      if (active.source.buffer) {
        const bufferDuration = active.source.buffer.duration;
        active.source.loopStart = start * bufferDuration;
        active.source.loopEnd = end * bufferDuration;
      }
    }

    const now = audioContext.currentTime;
    if (nodes.dryGain && nodes.wetGain) {
      nodes.dryGain.gain.setTargetAtTime(Math.cos(reverbMix * 0.5 * Math.PI), now, 0.01);
      nodes.wetGain.gain.setTargetAtTime(Math.cos((1.0 - reverbMix) * 0.5 * Math.PI), now, 0.01);
    }
    if (nodes.volumeGain) {
      nodes.volumeGain.gain.setTargetAtTime(volume, now, 0.01);
    }
    if (nodes.lowCutFilter && nodes.highCutFilter) {
      const lowCutFreq = isFilterEnabled ? lowCut : 20;
      const highCutFreq = isFilterEnabled ? highCut : 22050;
      nodes.lowCutFilter.frequency.setTargetAtTime(lowCutFreq, now, 0.01);
      nodes.highCutFilter.frequency.setTargetAtTime(highCutFreq, now, 0.01);
    }
  }, [padState, isBufferReady, getAudioContext]);

  // Connect/disconnect from performance recording mix bus cleanly
  useEffect(() => {
    const masterNode = audioNodesRef.current.masterOut;
    if (masterNode && mixDestination) {
      try {
        masterNode.connect(mixDestination);
      } catch {
        // ignore if already connected
      }
      return () => {
        try {
          masterNode.disconnect(mixDestination);
        } catch {
          // ignore
        }
      };
    }
  }, [mixDestination, isBufferReady]);

  const handleTogglePlay = () => {
    if (!padState.audioUrl || isDecoding) return;
    setAudioError(null);
    // Synchronously unlock AudioContext on the tap gesture for iOS Safari
    const ctx = getAudioContext();
    unlockAudioContext(ctx);
    updatePadState(padState.id, { isPlaying: !padState.isPlaying });
  };

  // Direct user-gesture triggered recording (no prior await so iOS Safari preserves user activation!)
  const handleToggleRecord = useCallback(async () => {
    setAudioError(null);
    clearRecorderError();

    if (padState.isRecording || isRecorderActive) {
      const url = await stopRecording();
      updatePadState(padState.id, {
        isRecording: false,
        ...(url ? { audioUrl: url, source: 'record', isReversed: false } : {}),
      });
    } else {
      handleClearAudio();
      const started = await startRecording();
      if (started) {
        updatePadState(padState.id, { isRecording: true });
      } else {
        updatePadState(padState.id, { isRecording: false });
      }
    }
  }, [
    padState.isRecording,
    isRecorderActive,
    padState.id,
    handleClearAudio,
    startRecording,
    stopRecording,
    updatePadState,
    clearRecorderError,
  ]);

  const handleDeleteThisPad = useCallback(() => {
    if (isRecorderActive || padState.isRecording) {
      void stopRecording();
    }
    handleClearAudio();
    onDeletePad(padState.id);
  }, [isRecorderActive, padState.isRecording, stopRecording, handleClearAudio, onDeletePad, padState.id]);

  const handleToggleLoop = () => {
    if (!hasAudio) return;
    unlockAudioContext(getAudioContext());
    updatePadState(padState.id, { isLooping: !padState.isLooping });
  };

  const handleToggleReverse = () => {
    if (!hasAudio) return;
    unlockAudioContext(getAudioContext());
    updatePadState(padState.id, { isReversed: !padState.isReversed });
  };

  const handleToggleFilter = () => {
    if (!hasAudio) return;
    updatePadState(padState.id, { isFilterEnabled: !padState.isFilterEnabled });
  };

  const handleExport = async () => {
    if (!audioBufferRef.current.original) {
      console.error('No audio buffer to export.');
      return;
    }

    const bufferToExport = padState.isReversed
      ? audioBufferRef.current.reversed
      : audioBufferRef.current.original;

    if (!bufferToExport) {
      console.error('Target audio buffer for export is missing.');
      return;
    }

    const wavBlob = audioBufferToWav(bufferToExport);
    const fileName = `${padState.name.trim().replace(/\s+/g, '_')}.wav`;
    await saveBlobAsFile(wavBlob, fileName);
  };

  const handleUploadClick = () => {
    setAudioError(null);
    clearRecorderError();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Unlock AudioContext on file pick change so playback is ready immediately
      unlockAudioContext(getAudioContext());
      handleClearAudio();
      const url = URL.createObjectURL(file);
      registerAudioBlob(url, file);
      const name = file.name.replace(/\.[^/.]+$/, '');
      updatePadState(padState.id, {
        audioUrl: url,
        name: name,
        source: 'upload',
        isReversed: false,
      });
    }
    if (event.target) event.target.value = '';
  };

  const hasAudio = !!padState.audioUrl;
  const isRecording = padState.isRecording || isRecorderActive;
  const visibleError = audioError || recorderError;

  const ratePercent = ((padState.playbackRate - 0.5) / (1.5 - 0.5)) * 100;
  const volumePercent = padState.volume * 100;
  const reverbPercent = padState.reverbMix * 100;
  const lowCutPercent = ((padState.lowCut - 20) / (5000 - 20)) * 100;
  const highCutPercent = ((padState.highCut - 500) / (22050 - 500)) * 100;

  return (
    <div
      style={{ backgroundColor: padColor }}
      className={`p-5 transition-all duration-300 flex flex-col justify-between border border-black/10 shadow-lg hover:shadow-xl rounded-[1.8rem] sound-pad-enter ${isRecording ? 'ring-2 ring-red-500 ring-offset-2' : padState.isPlaying ? 'ring-2 ring-black ring-offset-2' : ''}`}
    >
      <header>
        <div className="flex justify-between items-center mb-3 gap-2">
          <input
            type="text"
            value={padState.name}
            onChange={(e) => updatePadState(padState.id, { name: e.target.value })}
            className="font-bold text-base uppercase text-black bg-transparent border-none p-0 focus:ring-0 w-full flex-grow min-w-0 font-['Space_Grotesk'] tracking-wide"
            disabled={isRecording}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(hasAudio || isRecording) && (
              <button
                type="button"
                onClick={isRecording ? handleToggleRecord : handleTogglePlay}
                disabled={(!hasAudio || isDecoding) && !isRecording}
                aria-label={isRecording ? 'Stop Recording' : padState.isPlaying ? 'Pause' : 'Play'}
                className="w-10 h-10 bg-black hover:bg-neutral-800 text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isRecording ? (
                  <StopIcon className="w-5 h-5" />
                ) : padState.isPlaying ? (
                  <PauseIcon className="w-5 h-5" />
                ) : (
                  <PlayIcon className="w-5 h-5" />
                )}
              </button>
            )}

            {hasAudio && !isRecording && (
              <button
                type="button"
                onClick={handleExport}
                disabled={!isBufferReady}
                title="Download Sample (WAV)"
                aria-label="Download Sample"
                className="p-2 rounded-full hover:bg-black/10 text-neutral-600 hover:text-black transition-colors disabled:opacity-40"
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            )}

            {hasAudio && !isRecording && (
              <button
                type="button"
                onClick={handleClearAudio}
                title="Clear Sound"
                aria-label="Clear Sound"
                className="p-2 rounded-full hover:bg-black/10 text-neutral-600 hover:text-black transition-colors"
              >
                <RecycleIcon className="w-4 h-4" />
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteThisPad}
                title="Delete Pad"
                aria-label="Delete Pad"
                className="p-2 rounded-full hover:bg-red-500/10 text-neutral-600 hover:text-red-600 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {isRecording && (
          <p className="text-xs font-semibold font-['Space_Grotesk'] text-red-500 text-right animate-pulse">
            RECORDING...
          </p>
        )}
      </header>

      {visibleError && (
        <div
          role="alert"
          className="mb-2 px-3 py-2 rounded-xl bg-red-950/90 text-white text-xs leading-snug flex items-start justify-between gap-2 shadow-sm"
        >
          <span>{visibleError}</span>
          <button
            type="button"
            onClick={() => {
              setAudioError(null);
              clearRecorderError();
            }}
            className="text-white/75 hover:text-white font-bold px-1 flex-shrink-0"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="h-24 my-4 w-full flex items-center justify-center relative bg-black/5 rounded-2xl overflow-hidden select-none">
        {hasAudio && isDecoding && (
          <span className="text-xs font-mono uppercase tracking-wider text-black/60">
            Loading audio...
          </span>
        )}

        {hasAudio && !isDecoding && (
          <>
            <StaticWaveform
              audioBuffer={audioBufferRef.current.original}
              color="#1f2937"
              isReversed={padState.isReversed}
            />
            <RangeSlider
              min={0}
              max={1}
              step={0.001}
              value={[padState.start, padState.end]}
              onChange={([start, end]) => updatePadState(padState.id, { start, end })}
              disabled={!hasAudio || isRecording || !isBufferReady}
            />
            {playbackProgress !== null && (
              <div
                className="absolute top-0 w-0.5 h-full bg-red-500/80 pointer-events-none"
                style={{
                  left: `${playbackProgress * 100}%`,
                  zIndex: 4,
                }}
              />
            )}
          </>
        )}

        {(padState.isPlaying || isRecording) && (
          <VisualizerCanvas
            analyserNode={isRecording ? recorderAnalyserNode : playbackAnalyserNode}
            isRecording={isRecording}
          />
        )}

        {!hasAudio && !isRecording && (
          <div className="flex gap-3 w-full h-full p-2.5">
            <button
              type="button"
              onClick={handleToggleRecord}
              className="flex-1 h-full flex flex-col items-center justify-center bg-white/70 hover:bg-white text-black border border-black/5 transition-all rounded-2xl shadow-sm hover:shadow active:scale-98"
            >
              <RecordIcon className="w-5 h-5 mb-1.5 text-red-500" />
              <span className="text-[11px] font-bold tracking-wider font-['Space_Grotesk']">RECORD</span>
            </button>
            <button
              type="button"
              onClick={handleUploadClick}
              className="flex-1 h-full flex flex-col items-center justify-center bg-white/70 hover:bg-white text-black border border-black/5 transition-all rounded-2xl shadow-sm hover:shadow active:scale-98"
            >
              <UploadIcon className="w-5 h-5 mb-1.5 text-neutral-700" />
              <span className="text-[11px] font-bold tracking-wider font-['Space_Grotesk']">UPLOAD</span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 text-sm">
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor={`rate-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Speed</label>
              <span className="text-xs text-black/90 font-mono font-semibold bg-white/40 shadow-sm border border-black/5 px-2.5 py-0.5 rounded-full">{padState.playbackRate.toFixed(2)}x</span>
            </div>
            <input
              id={`rate-${padState.id}`}
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              value={padState.playbackRate}
              onChange={(e) => updatePadState(padState.id, { playbackRate: parseFloat(e.target.value) })}
              disabled={!hasAudio || isRecording}
              className="w-full"
              style={{ '--slider-bg': `linear-gradient(to right, #000 ${ratePercent}%, #e5e7eb ${ratePercent}%)` } as React.CSSProperties}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor={`volume-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Volume</label>
              <span className="text-xs text-black/90 font-mono font-semibold bg-white/40 shadow-sm border border-black/5 px-2.5 py-0.5 rounded-full">{Math.round(padState.volume * 100)}%</span>
            </div>
            <input
              id={`volume-${padState.id}`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={padState.volume}
              onChange={(e) => updatePadState(padState.id, { volume: parseFloat(e.target.value) })}
              disabled={!hasAudio || isRecording}
              className="w-full"
              style={{ '--slider-bg': `linear-gradient(to right, #000 ${volumePercent}%, #e5e7eb ${volumePercent}%)` } as React.CSSProperties}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor={`reverb-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Reverb</label>
              <span className="text-xs text-black/90 font-mono font-semibold bg-white/40 shadow-sm border border-black/5 px-2.5 py-0.5 rounded-full">{Math.round(padState.reverbMix * 100)}%</span>
            </div>
            <input
              id={`reverb-${padState.id}`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={padState.reverbMix}
              onChange={(e) => updatePadState(padState.id, { reverbMix: parseFloat(e.target.value) })}
              disabled={!hasAudio || isRecording}
              className="w-full"
              style={{ '--slider-bg': `linear-gradient(to right, #000 ${reverbPercent}%, #e5e7eb ${reverbPercent}%)` } as React.CSSProperties}
            />
          </div>
          {padState.isFilterEnabled && (
            <>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor={`lowcut-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Low Cut</label>
                  <span className="text-xs text-black/90 font-mono font-semibold bg-white/40 shadow-sm border border-black/5 px-2.5 py-0.5 rounded-full">{padState.lowCut.toFixed(0)} Hz</span>
                </div>
                <input
                  id={`lowcut-${padState.id}`}
                  type="range"
                  min="20"
                  max="5000"
                  step="1"
                  value={padState.lowCut}
                  onChange={(e) => updatePadState(padState.id, { lowCut: parseFloat(e.target.value) })}
                  disabled={!hasAudio || isRecording || !padState.isFilterEnabled}
                  className="w-full"
                  style={{ '--slider-bg': `linear-gradient(to right, #000 ${lowCutPercent}%, #e5e7eb ${lowCutPercent}%)` } as React.CSSProperties}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor={`highcut-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">High Cut</label>
                  <span className="text-xs text-black/90 font-mono font-semibold bg-white/40 shadow-sm border border-black/5 px-2.5 py-0.5 rounded-full">{padState.highCut.toFixed(0)} Hz</span>
                </div>
                <input
                  id={`highcut-${padState.id}`}
                  type="range"
                  min="500"
                  max="22050"
                  step="1"
                  value={padState.highCut}
                  onChange={(e) => updatePadState(padState.id, { highCut: parseFloat(e.target.value) })}
                  disabled={!hasAudio || isRecording || !padState.isFilterEnabled}
                  className="w-full"
                  style={{ '--slider-bg': `linear-gradient(to right, #000 ${highCutPercent}%, #e5e7eb ${highCutPercent}%)` } as React.CSSProperties}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-around items-center pt-3 border-t border-black/10 mt-5">
          <div className="flex items-center gap-2">
            <label htmlFor={`loop-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Loop</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id={`loop-${padState.id}`} checked={padState.isLooping} onChange={handleToggleLoop} className="sr-only peer" disabled={!hasAudio || isRecording} />
              <div className="w-9 h-5 bg-black/10 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50 shadow-inner"></div>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`reverse-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Reverse</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id={`reverse-${padState.id}`} checked={padState.isReversed} onChange={handleToggleReverse} className="sr-only peer" disabled={!hasAudio || isRecording} />
              <div className="w-9 h-5 bg-black/10 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50 shadow-inner"></div>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`filter-${padState.id}`} className="text-xs font-semibold text-black/70 tracking-wider uppercase font-['Space_Grotesk']">Filter</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id={`filter-${padState.id}`} checked={padState.isFilterEnabled} onChange={handleToggleFilter} className="sr-only peer" disabled={!hasAudio || isRecording} />
              <div className="w-9 h-5 bg-black/10 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50 shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*,.wav,.mp3,.m4a,.mp4,.ogg,.flac,.aac,.webm,.aiff"
        className="hidden"
      />
    </div>
  );
};

export default SoundPad;