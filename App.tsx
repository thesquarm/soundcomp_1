import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PadState } from './types';
import SoundPad from './components/SoundPad';
import { PlayIcon, StopIcon, RecordIcon, AddIcon, SoundWaveIcon, DownloadIcon } from './components/Icons';
import { createImpulseResponse, audioBufferToWav } from './utils/audio';
import AdviceGenerator from './components/AdviceGenerator';
import PerformanceSaveModal from './components/PerformanceSaveModal';

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

const initialPads: PadState[] = Array.from({ length: 3 }, (_, i) => createPadState(i));

const PAD_COLORS = ['#B39EB5', '#B5B39E', '#91B39E', '#B5A29E', '#9EB5B3'];

interface SavedPerformance {
    blob: Blob;
    name: string;
    url: string;
}

const App: React.FC = () => {
  const [pads, setPads] = useState<PadState[]>(initialPads);
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
                
                setPerformanceToSave({
                    blob: wavBlob,
                    defaultName: `performance_${new Date().toISOString()}.wav`
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
          recorder.start();
          setMixDestination(dest);
          setIsRecordingPerformance(true);
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 font-mono">
      {isRecordingPerformance && (
        <div className="fixed top-0 left-0 w-full h-2 bg-red-500 z-50 recording-indicator" role="status" aria-label="Recording in progress"></div>
      )}
      <header className="text-center my-8">
        <h1 className="text-6xl font-light text-black tracking-tight">
          sound_comp
        </h1>
        <p className="text-gray-500 mt-4 text-xl font-sans">
          A minimalist soundscape composer
        </p>
        <SoundWaveIcon className="w-12 h-12 mt-4 mx-auto text-gray-400" />
      </header>

      <AdviceGenerator />
      
      {performanceToSave && (
        <PerformanceSaveModal 
            isOpen={isSaveModalOpen}
            performance={performanceToSave}
            onClose={handleModalClose}
            onSaveComplete={() => {
                setIsSaveModalOpen(false);
                // FIX: Corrected typo from setPerformanceTosave to setPerformanceToSave
                setPerformanceToSave(null);
            }}
        />
      )}

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
        
        {savedPerformances.length > 0 && (
            <div className="mt-10 w-full max-w-md mx-auto">
                <h3 className="text-center text-lg font-bold mb-2">Unsaved Recordings</h3>
                <ul className="bg-white/50 border border-gray-200 rounded-md p-2 space-y-2">
                    {savedPerformances.map((perf, index) => (
                        <li key={index} className="flex items-center justify-between p-2 bg-white rounded-md shadow-sm">
                            <span className="text-sm font-mono truncate mr-2">{perf.name}</span>
                            <a 
                                href={perf.url} 
                                download={perf.name}
                                className="p-2 rounded-full hover:bg-gray-100 text-black transition-colors"
                                title="Download"
                            >
                                <DownloadIcon className="w-5 h-5" />
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </main>
      <footer className="text-center mt-12 text-sm text-black opacity-75">
        <p>App by Philip and Google AI Studio / Part of sustain_sound by the TEAM project / If you have any questions or feedback, please contact <a href="mailto:p.stade@mh-freiburg.de">Philip, p.stade@mh-freiburg.de</a> </p>
      </footer>
    </div>
  );
};

export default App;