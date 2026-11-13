import { useState, useRef, useCallback, useEffect } from 'react';
import {
  registerAudioBlob,
  getAudioContextConstructor,
  getSupportedRecorderMimeType,
  encodeFloat32ChunksToWav,
} from '../utils/audio';

const MAX_PCM_SECONDS = 180; // 3-minute safety cap per pad sample

const formatRecorderError = (err: unknown): string => {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone permission denied. Please allow microphone access in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Microphone is busy or used by another app. Close other audio apps and try again.';
  }
  if (name === 'OverconstrainedError') {
    return 'Microphone settings are unsupported on this device.';
  }
  return 'Could not start microphone recording. Check browser permissions or open in Safari/Chrome.';
};

export const useRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recordingContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderMimeRef = useRef<string>('');
  const audioChunksRef = useRef<Blob[]>([]);

  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmTotalFramesRef = useRef<number>(0);
  const pcmSampleRateRef = useRef<number>(44100);
  const pcmHasSignalRef = useRef<boolean>(false);

  const isStoppingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const teardownCaptureGraph = useCallback(async () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      try {
        processorNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        // ignore
      }
      silentGainRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (recordingContextRef.current) {
      const ctx = recordingContextRef.current;
      recordingContextRef.current = null;
      try {
        if ((ctx.state as string) !== 'closed') {
          await ctx.close();
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      void teardownCaptureGraph();
    };
  }, [teardownCaptureGraph]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    isStoppingRef.current = false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setError('Microphone recording is unavailable in this browser view. Please open the link in Safari or Chrome over HTTPS.');
      return false;
    }

    // Stop any leftover stream cleanly before requesting a new one
    if (streamRef.current) {
      await teardownCaptureGraph();
    }

    let stream: MediaStream;
    try {
      // CRITICAL for iOS Safari: invoke getUserMedia IMMEDIATELY inside user gesture before any await!
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: false },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: false },
          },
        });
      } catch (constraintErr) {
        const errName = (constraintErr as { name?: string })?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
          throw constraintErr;
        }
        // Fallback to maximally compatible constraints on older iOS/Android hardware or Bluetooth headsets
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      console.error('getUserMedia failed:', err);
      if (isMountedRef.current) {
        setError(formatRecorderError(err));
        setIsRecording(false);
        setAnalyserNode(null);
      }
      return false;
    }

    if (!isMountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }

    streamRef.current = stream;
    pcmChunksRef.current = [];
    pcmTotalFramesRef.current = 0;
    pcmHasSignalRef.current = false;
    audioChunksRef.current = [];

    // 1. Dedicated, isolated AudioContext for recording only (never shares or pollutes playback AudioContext on iOS)
    try {
      const AudioContextClass = getAudioContextConstructor();
      const recCtx = new AudioContextClass();
      recordingContextRef.current = recCtx;
      pcmSampleRateRef.current = recCtx.sampleRate || 44100;

      const recState = recCtx.state as string;
      if (recState === 'suspended' || recState === 'interrupted') {
        try {
          await recCtx.resume();
        } catch {
          // continue; may resume cleanly on next tick
        }
      }

      const source = recCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const analyser = recCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      if (isMountedRef.current) {
        setAnalyserNode(analyser);
      }

      // Direct PCM capture node -> muted gain -> destination so WebKit actively renders the audio graph
      if (typeof recCtx.createScriptProcessor === 'function') {
        const processor = recCtx.createScriptProcessor(4096, 1, 1);
        const silentGain = recCtx.createGain();
        silentGain.gain.value = 0;

        const maxFrames = Math.floor(pcmSampleRateRef.current * MAX_PCM_SECONDS);

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          if (isStoppingRef.current) return;
          if (pcmTotalFramesRef.current >= maxFrames) return;

          const input = event.inputBuffer.getChannelData(0);
          if (!input || input.length === 0) return;

          const copy = new Float32Array(input.length);
          copy.set(input);
          if (!pcmHasSignalRef.current) {
            for (let i = 0; i < copy.length; i += 8) {
              if (Math.abs(copy[i]) > 1e-6) {
                pcmHasSignalRef.current = true;
                break;
              }
            }
          }
          pcmChunksRef.current.push(copy);
          pcmTotalFramesRef.current += copy.length;
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(recCtx.destination);

        processorNodeRef.current = processor;
        silentGainRef.current = silentGain;
      }
    } catch (audioGraphErr) {
      console.warn('Recording AudioContext setup warning (will rely on MediaRecorder):', audioGraphErr);
    }

    // 2. Parallel MediaRecorder capture (no timeslice so iOS Safari writes valid complete MP4 containers)
    let mediaRecorderStarted = false;
    if (typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = getSupportedRecorderMimeType();
        mediaRecorderMimeRef.current = mimeType;
        const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start();
        mediaRecorderStarted = true;
      } catch (mrErr) {
        console.warn('MediaRecorder fallback unavailable, using direct PCM WAV capture:', mrErr);
        mediaRecorderRef.current = null;
      }
    }

    if (!processorNodeRef.current && !mediaRecorderStarted) {
      await teardownCaptureGraph();
      if (isMountedRef.current) {
        setError('Audio recording is not supported by this browser.');
        setIsRecording(false);
        setAnalyserNode(null);
      }
      return false;
    }

    if (isMountedRef.current) {
      setIsRecording(true);
      setAudioURL(null);
    }
    return true;
  }, [teardownCaptureGraph]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    isStoppingRef.current = true;

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    // Wait cleanly for MediaRecorder to flush final dataavailable & stop event (with timeout safety guard)
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        const timeoutId = window.setTimeout(done, 1500);
        const prevOnStop = recorder.onstop;
        recorder.onstop = (ev) => {
          window.clearTimeout(timeoutId);
          if (typeof prevOnStop === 'function') {
            try {
              prevOnStop.call(recorder, ev);
            } catch {
              // ignore
            }
          }
          done();
        };
        try {
          recorder.stop();
        } catch {
          window.clearTimeout(timeoutId);
          done();
        }
      });
    }

    const capturedChunks = pcmChunksRef.current;
    const totalFrames = pcmTotalFramesRef.current;
    const sampleRate = pcmSampleRateRef.current;
    const hasPcmSignal = pcmHasSignalRef.current;
    const mrChunks = audioChunksRef.current;
    const mrMime = recorder?.mimeType || mediaRecorderMimeRef.current || 'audio/webm';

    pcmChunksRef.current = [];
    pcmTotalFramesRef.current = 0;
    pcmHasSignalRef.current = false;
    audioChunksRef.current = [];

    await teardownCaptureGraph();

    let finalBlob: Blob | null = null;

    // Prefer lossless PCM WAV whenever real audio frames were captured (eliminates ALL iOS MP4/WebM codec issues)
    if (totalFrames > 0 && hasPcmSignal) {
      finalBlob = encodeFloat32ChunksToWav([capturedChunks], totalFrames, sampleRate);
    } else if (mrChunks.length > 0) {
      const candidate = new Blob(mrChunks, { type: mrMime });
      if (candidate.size > 0) {
        finalBlob = candidate;
      }
    }

    // Even if mic input was near-silent (e.g. user recorded silence intentionally), return valid WAV if frames exist
    if (!finalBlob && totalFrames > 0) {
      finalBlob = encodeFloat32ChunksToWav([capturedChunks], totalFrames, sampleRate);
    }

    let url: string | null = null;
    if (finalBlob && finalBlob.size > 0) {
      url = URL.createObjectURL(finalBlob);
      registerAudioBlob(url, finalBlob);
    } else if (isMountedRef.current) {
      setError('No audio was captured. Please check microphone permissions and try again.');
    }

    if (isMountedRef.current) {
      setAnalyserNode(null);
      setIsRecording(false);
      if (url) setAudioURL(url);
    }

    return url;
  }, [teardownCaptureGraph]);

  return {
    isRecording,
    audioURL,
    analyserNode,
    error,
    clearError,
    startRecording,
    stopRecording,
  };
};
