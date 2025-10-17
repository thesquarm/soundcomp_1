import { useState, useRef, useCallback } from 'react';

export const useRecorder = (getAudioContext: () => AudioContext) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stopPromiseResolveRef = useRef<((url: string) => void) | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = getAudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      setAnalyserNode(analyser);

      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        audioChunksRef.current = [];
        
        // Stop all tracks to release the microphone and stop the browser's recording indicator
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setAnalyserNode(null); // Clear analyser node
        
        if (stopPromiseResolveRef.current) {
            stopPromiseResolveRef.current(url);
            stopPromiseResolveRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setAudioURL(null);
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  }, [getAudioContext]);

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
        if (mediaRecorderRef.current && isRecording) {
            stopPromiseResolveRef.current = resolve;
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        } else {
            resolve(null);
        }
    });
  }, [isRecording]);

  return { isRecording, audioURL, startRecording, stopRecording, analyserNode };
};
