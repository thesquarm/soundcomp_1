import { useState, useRef, useCallback, useEffect } from 'react';
import { registerAudioBlob } from '../utils/audio';

export const useRecorder = (getAudioContext: () => AudioContext) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopPromiseResolveRef = useRef<((url: string | null) => void) | null>(null);

  // Clean up any active stream or recorder when the pad unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch (e) { /* ignore */ }
        });
        streamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Stop any existing tracks before acquiring a new stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch (e) { /* ignore */ }
        });
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } 
      });
      streamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setAnalyserNode(analyser);

      // Determine best supported MIME type across iOS Safari and Android
      let mimeType = '';
      const candidateTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg'
      ];
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const type of candidateTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }
      }

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        let url: string | null = null;
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: finalType });
          url = URL.createObjectURL(audioBlob);
          registerAudioBlob(url, audioBlob);
          setAudioURL(url);
        }
        audioChunksRef.current = [];
        
        // Stop all tracks to release microphone immediately (clears iOS/Android recording dot)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            try { track.stop(); } catch (e) { /* ignore */ }
          });
          streamRef.current = null;
        }
        setAnalyserNode(null);
        setIsRecording(false);
        
        if (stopPromiseResolveRef.current) {
          stopPromiseResolveRef.current(url);
          stopPromiseResolveRef.current = null;
        }
      };

      // Collect data periodically for better stability on mobile browsers
      recorder.start(100);
      setIsRecording(true);
      setAudioURL(null);
      return true;
    } catch (err) {
      console.error("Error starting recording:", err);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try { track.stop(); } catch (e) { /* ignore */ }
        });
        streamRef.current = null;
      }
      setIsRecording(false);
      setAnalyserNode(null);
      return false;
    }
  }, [getAudioContext]);

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        stopPromiseResolveRef.current = resolve;
        try {
          recorder.stop();
        } catch (e) {
          console.warn("Error calling recorder.stop():", e);
          resolve(null);
        }
      } else {
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            try { track.stop(); } catch (e) { /* ignore */ }
          });
          streamRef.current = null;
        }
        setAnalyserNode(null);
        resolve(null);
      }
    });
  }, []);

  return { isRecording, audioURL, startRecording, stopRecording, analyserNode };
};
