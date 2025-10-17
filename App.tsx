import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PadState } from './types';
import SoundPad from './components/SoundPad';
import { PlayIcon, StopIcon, RecordIcon, AddIcon, SoundWaveIcon } from './components/Icons';
import { createImpulseResponse, audioBufferToWav } from './utils/audio';
import AdviceGenerator from './components/AdviceGenerator';

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
});

const initialPads: PadState[] = Array.from({ length: 2 }, (_, i) => createPadState(i));

const PAD_COLORS = ['#B39EB5', '#B5B39E', '#91B39E', '#B5A29E', '#9EB5B3'];

const App: React.FC = () => {
  const [pads, setPads] = useState<PadState[]>(initialPads);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [impulseResponseBuffer, setImpulseResponseBuffer] = useState<AudioBuffer | null>(null);

  const [isRecordingPerformance, setIsRecordingPerformance] = useState(false);
  const [mixDestination, setMixDestination] = useState<MediaStreamAudioDestinationNode | null>(null);
  const performanceRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedPerformanceChunksRef = useRef<Blob[]>([]);

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
  
  const handlePlayAll = () => {
    getAudioContext(); 
    setPads(pads.map(p => p.audioUrl ? {...p, isPlaying: true} : p));
  };
  
  const handleStopAll = () => {
     setPads(pads.map(p => ({...p, isPlaying: false})));
  };

  const handleTogglePerformanceRecord = () => {
      if (isRecordingPerformance) {
          performanceRecorderRef.current?.stop();
          setIsRecordingPerformance(false);
          setMixDestination(null);
      } else {
          const audioContext = getAudioContext();
          const dest = audioContext.createMediaStreamDestination();
          
          const mimeTypes = ['audio/webm', 'audio/ogg', 'audio/mp4'];
          const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

          if (!supportedMimeType) {
              alert("No supported audio format for recording found in this browser.");
              return;
          }

          const recorder = new MediaRecorder(dest.stream, { mimeType: supportedMimeType });

          recordedPerformanceChunksRef.current = [];

          recorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  recordedPerformanceChunksRef.current.push(event.data);
              }
          };

          recorder.onstop = async () => {
              const blob = new Blob(recordedPerformanceChunksRef.current, { type: supportedMimeType });
              try {
                const audioContext = getAudioContext();
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const wavBlob = audioBufferToWav(audioBuffer);
                const url = URL.createObjectURL(wavBlob);

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `sound_comp_Performance.wav`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
              } catch (e) {
                console.error("Error processing recorded performance:", e);
                alert("Could not process the recorded audio. Please try again.");
              } finally {
                recordedPerformanceChunksRef.current = [];
              }
          };

          performanceRecorderRef.current = recorder;
          recorder.start();
          setMixDestination(dest);
          setIsRecordingPerformance(true);
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 font-mono">
      <header className="text-center my-8">
        <h1 className="text-6xl font-light text-black tracking-tight flex items-center justify-center gap-3">
          <SoundWaveIcon className="w-12 h-12" />
          <span>sound_comp</span>
        </h1>
        <p className="text-gray-500 mt-2 text-xl font-sans">
          A minimalist soundscape composer.
        </p>
      </header>

      <AdviceGenerator />

      <main className="w-full max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {pads.map(pad => (
            <SoundPad
              key={pad.id}
              padState={pad}
              updatePadState={updatePadState}
              getAudioContext={getAudioContext}
              impulseResponseBuffer={impulseResponseBuffer}
              mixDestination={mixDestination}
              padColor={PAD_COLORS[pad.id % PAD_COLORS.length]}
            />
          ))}
        </div>

        {pads.length < 6 && (
            <div className="mt-6 flex justify-center">
                <button
                    onClick={handleAddPad}
                    className="flex items-center gap-2 bg-white hover:bg-gray-100 text-black font-semibold py-3 px-6 transition-colors border border-gray-300 shadow-sm rounded-md"
                >
                    <AddIcon className="w-5 h-5" />
                    Add Pad
                </button>
            </div>
        )}

        <div className="mt-10 flex justify-center gap-2 flex-wrap">
            <button
                onClick={handleTogglePerformanceRecord}
                disabled={pads.every(p => !p.audioUrl)}
                className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 transition-colors disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed text-base rounded-md"
            >
                <RecordIcon className="w-5 h-5" />
                {isRecordingPerformance ? 'Stop Recording' : 'Record Performance'}
            </button>
            <button
                onClick={handlePlayAll}
                className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 transition-colors text-base rounded-md"
            >
                <PlayIcon className="w-5 h-5" />
                Play All
            </button>
            <button
                onClick={handleStopAll}
                className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 transition-colors text-base rounded-md"
            >
                <StopIcon className="w-5 h-5" />
                Stop All
            </button>
        </div>
      </main>
      <footer className="text-center mt-12 text-sm text-black opacity-75">
        <p>Open Source App, by Philip and with Google AI Studio, part of sustain_sound by the TEAM project</p>
      </footer>
    </div>
  );
};

export default App;