import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PadState } from '../types';
import { useRecorder } from '../hooks/useRecorder';
import { PlayIcon, PauseIcon, RecordIcon, StopIcon, TrashIcon, DownloadIcon, LoopIcon, UploadIcon, RecycleIcon } from './Icons';
import { VisualizerCanvas } from './VisualizerCanvas';
import { StaticWaveform } from './StaticWaveform';
import { RangeSlider } from './RangeSlider';
import { blobToAudioBuffer, reverseAudioBuffer, audioBufferToWav } from '../utils/audio';

interface SoundPadProps {
  padState: PadState;
  updatePadState: (id: number, newValues: Partial<PadState>) => void;
  getAudioContext: () => AudioContext;
  impulseResponseBuffer: AudioBuffer | null;
  mixDestination: MediaStreamAudioDestinationNode | null;
  padColor: string;
}

const FADE_TIME = 0.01; // 10ms

const SoundPad: React.FC<SoundPadProps> = ({ padState, updatePadState, getAudioContext, impulseResponseBuffer, mixDestination, padColor }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isRecording: isRecorderActive, startRecording, stopRecording, analyserNode: recorderAnalyserNode } = useRecorder(getAudioContext);
  
  const audioBufferRef = useRef<{ original: AudioBuffer | null, reversed: AudioBuffer | null }>({ original: null, reversed: null });
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const [playbackAnalyserNode, setPlaybackAnalyserNode] = useState<AnalyserNode | null>(null);
  
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
  
  // Cleanup stop timer on unmount
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
    };
  }, []);

  const setupAudioGraph = useCallback(() => {
    if (Object.keys(audioNodesRef.current).length > 0) return;

    const audioContext = getAudioContext();
    const nodes = audioNodesRef.current;
    
    try {
        nodes.analyser = audioContext.createAnalyser();
        nodes.volumeGain = audioContext.createGain();
        nodes.masterOut = audioContext.createGain();

        // Filters
        nodes.lowCutFilter = audioContext.createBiquadFilter();
        nodes.lowCutFilter.type = 'highpass';
        nodes.lowCutFilter.frequency.value = 20;

        nodes.highCutFilter = audioContext.createBiquadFilter();
        nodes.highCutFilter.type = 'lowpass';
        nodes.highCutFilter.frequency.value = 22050;

        let lastNode: AudioNode = nodes.analyser;
        lastNode.connect(nodes.volumeGain);
        nodes.volumeGain.connect(nodes.lowCutFilter);
        nodes.lowCutFilter.connect(nodes.highCutFilter);
        lastNode = nodes.highCutFilter;
        
        if (impulseResponseBuffer) {
            nodes.convolver = audioContext.createConvolver();
            nodes.convolver.buffer = impulseResponseBuffer;
            nodes.wetGain = audioContext.createGain();
            nodes.dryGain = audioContext.createGain();

            lastNode.connect(nodes.dryGain);
            lastNode.connect(nodes.wetGain);

            nodes.dryGain.connect(nodes.masterOut);
            nodes.wetGain.connect(nodes.convolver);
            nodes.convolver.connect(nodes.masterOut);
        } else {
            lastNode.connect(nodes.masterOut);
        }
        
        nodes.masterOut.connect(audioContext.destination);
        setPlaybackAnalyserNode(nodes.analyser);
    } catch(e) {
        console.error("Error setting up audio graph:", e);
    }
  }, [getAudioContext, impulseResponseBuffer]);
  
  useEffect(() => {
    if (padState.isRecording && !isRecorderActive) {
      startRecording();
    }
  }, [padState.isRecording, isRecorderActive, startRecording]);

  useEffect(() => {
    const loadAudio = async () => {
        if (padState.audioUrl) {
            const audioContext = getAudioContext();
            try {
                const originalBuffer = await blobToAudioBuffer(audioContext, padState.audioUrl);
                const reversedBuffer = reverseAudioBuffer(audioContext, originalBuffer);
                audioBufferRef.current = { original: originalBuffer, reversed: reversedBuffer };
                setupAudioGraph();
            } catch (error) {
                console.error("Failed to load audio buffer:", error);
                handleClear();
            }
        } else {
            audioBufferRef.current = { original: null, reversed: null };
        }
    };
    loadAudio();
  }, [padState.audioUrl, getAudioContext, setupAudioGraph]);


  useEffect(() => {
    const isReady =
      padState.audioUrl &&
      audioBufferRef.current.original &&
      audioBufferRef.current.reversed &&
      Object.keys(audioNodesRef.current).length > 0;
    
    const audioContext = getAudioContext();
    const existingNode = sourceNodeRef.current;
    const masterOutNode = audioNodesRef.current.masterOut;

    // --- Stop Logic ---
    if (!padState.isPlaying || !isReady) {
      if (existingNode) {
        if (masterOutNode) {
          masterOutNode.gain.cancelScheduledValues(audioContext.currentTime);
          masterOutNode.gain.setValueAtTime(masterOutNode.gain.value, audioContext.currentTime);
          masterOutNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + FADE_TIME);
          
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
          stopTimerRef.current = window.setTimeout(() => {
              existingNode.onended = null;
              try { existingNode.stop(); } catch(e) { /* ignore */ }
              existingNode.disconnect();
              if (sourceNodeRef.current === existingNode) {
                  sourceNodeRef.current = null;
              }
              // Reset gain after stopping
              masterOutNode.gain.setValueAtTime(1, audioContext.currentTime);
          }, FADE_TIME * 1000 + 50); // Give a little buffer for the fade to complete
        } else {
            existingNode.onended = null;
            try { existingNode.stop(); } catch(e) { /* ignore */ }
            existingNode.disconnect();
            sourceNodeRef.current = null;
        }
      }
      return;
    }

    // --- Start Logic ---
    if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
    }
    
    // Clean up old node if it exists (e.g., from reversing while playing)
    if (existingNode) {
      existingNode.onended = null;
      try { existingNode.stop(0); } catch(e) {/* ignore */}
      existingNode.disconnect();
    }
    
    const sourceNode = audioContext.createBufferSource();
    sourceNodeRef.current = sourceNode;

    const bufferToPlay = padState.isReversed
      ? audioBufferRef.current.reversed
      : audioBufferRef.current.original;

    if (!bufferToPlay) return;

    sourceNode.buffer = bufferToPlay;
    sourceNode.playbackRate.value = padState.playbackRate;
    
    if (masterOutNode) {
        masterOutNode.gain.cancelScheduledValues(audioContext.currentTime);
        masterOutNode.gain.setValueAtTime(0, audioContext.currentTime);
        masterOutNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + FADE_TIME);
    }
    
    sourceNode.connect(audioNodesRef.current.analyser!);

    sourceNode.onended = () => {
      if (sourceNodeRef.current === sourceNode && !sourceNode.loop) {
        updatePadState(padState.id, { isPlaying: false });
      }
    };
    
    const bufferDuration = bufferToPlay.duration;
    const offset = padState.start * bufferDuration;
    const end = padState.end * bufferDuration;

    if (padState.isLooping) {
        sourceNode.loop = true;
        sourceNode.loopStart = offset;
        sourceNode.loopEnd = end;
        sourceNode.start(0, offset);
    } else {
        const duration = end - offset;
        sourceNode.start(0, offset, duration > 0 ? duration : 0);
    }
    getAudioContext().resume();

  }, [padState.isPlaying, padState.isReversed]);

  // Update live parameters
  useEffect(() => {
    const audioContext = getAudioContext();
    const nodes = audioNodesRef.current;
    const { playbackRate, isLooping, reverbMix, volume, isFilterEnabled, lowCut, highCut, start, end } = padState;

    if (sourceNodeRef.current) {
        sourceNodeRef.current.playbackRate.value = playbackRate;

        // Update loop points in real-time
        if (sourceNodeRef.current.buffer) {
            const bufferDuration = sourceNodeRef.current.buffer.duration;
            sourceNodeRef.current.loopStart = start * bufferDuration;
            sourceNodeRef.current.loopEnd = end * bufferDuration;
        }

        if (sourceNodeRef.current.loop !== isLooping) {
          // If looping changes while playing, we need to restart the node
          // to apply the change correctly.
          if (padState.isPlaying) {
            updatePadState(padState.id, { isPlaying: false }); // Stop
            setTimeout(() => updatePadState(padState.id, { isPlaying: true }), 50); // and restart
          }
        }
    }
    if (nodes.dryGain && nodes.wetGain && impulseResponseBuffer) {
        const mix = reverbMix;
        nodes.dryGain.gain.setTargetAtTime(Math.cos(mix * 0.5 * Math.PI), audioContext.currentTime, 0.01);
        nodes.wetGain.gain.setTargetAtTime(Math.cos((1.0 - mix) * 0.5 * Math.PI), audioContext.currentTime, 0.01);
    }
    if (nodes.volumeGain) {
        nodes.volumeGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.01);
    }
    if (nodes.lowCutFilter && nodes.highCutFilter) {
        const lowCutFreq = isFilterEnabled ? lowCut : 20;
        const highCutFreq = isFilterEnabled ? highCut : 22050;
        nodes.lowCutFilter.frequency.setTargetAtTime(lowCutFreq, audioContext.currentTime, 0.01);
        nodes.highCutFilter.frequency.setTargetAtTime(highCutFreq, audioContext.currentTime, 0.01);
    }
  }, [padState, impulseResponseBuffer, getAudioContext]);
  
  // Connect/disconnect from the performance recording destination
  useEffect(() => {
    const masterNode = audioNodesRef.current.masterOut;
    if (masterNode && mixDestination) {
        masterNode.connect(mixDestination);
        return () => {
            try { masterNode.disconnect(mixDestination); } catch(e) { /* ignore */ }
        };
    }
  }, [mixDestination]);

  const handleClear = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      try { sourceNodeRef.current.stop(); } catch(e) {/*ignore*/}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    Object.values(audioNodesRef.current).forEach(node => {
        try { (node as AudioNode)?.disconnect(); } catch(e) { /* ignore */ }
    });
    audioNodesRef.current = {};
    audioBufferRef.current = { original: null, reversed: null };
    setPlaybackAnalyserNode(null);

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
  }, [padState.id, updatePadState]);

  const handleTogglePlay = () => {
    if (padState.audioUrl) {
      updatePadState(padState.id, { isPlaying: !padState.isPlaying });
    }
  };

  const handleToggleRecord = useCallback(async () => {
    getAudioContext().resume();
    if (padState.isRecording) {
      const url = await stopRecording();
      updatePadState(padState.id, {
        isRecording: false,
        ...(url && { audioUrl: url, source: 'record', isReversed: false }),
      });
    } else {
      handleClear();
      updatePadState(padState.id, { isRecording: true });
    }
  }, [padState.isRecording, updatePadState, padState.id, getAudioContext, handleClear, stopRecording]);
  
  const handleToggleLoop = () => {
    if (!hasAudio) return;
    updatePadState(padState.id, { isLooping: !padState.isLooping });
  }

  const handleToggleReverse = () => {
    if (!hasAudio) return;
    updatePadState(padState.id, { isReversed: !padState.isReversed });
  }

  const handleToggleFilter = () => {
    if (!hasAudio) return;
    updatePadState(padState.id, { isFilterEnabled: !padState.isFilterEnabled });
  }

  const handleExport = async () => {
    if (!audioBufferRef.current.original) {
      console.error("No audio buffer to export.");
      return;
    }

    const bufferToExport = padState.isReversed
      ? audioBufferRef.current.reversed
      : audioBufferRef.current.original;

    if (!bufferToExport) {
      console.error("Target audio buffer for export is missing.");
      return;
    }

    const wavBlob = audioBufferToWav(bufferToExport);
    const url = URL.createObjectURL(wavBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${padState.name.replace(/ /g, '_')}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleClear();
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^/.]+$/, "");
      updatePadState(padState.id, { 
        audioUrl: url, 
        name: name, 
        source: 'upload',
        isReversed: false,
      });
    }
    if(event.target) event.target.value = '';
  };
  
  const hasAudio = !!padState.audioUrl;
  const isRecording = padState.isRecording;

  const ratePercent = ((padState.playbackRate - 0.5) / (1.5 - 0.5)) * 100;
  const volumePercent = padState.volume * 100;
  const reverbPercent = padState.reverbMix * 100;
  const lowCutPercent = ((padState.lowCut - 20) / (5000 - 20)) * 100;
  const highCutPercent = ((padState.highCut - 500) / (22050 - 500)) * 100;


  return (
    <div 
      style={{ backgroundColor: padColor }}
      className={`p-4 transition-all duration-300 flex flex-col justify-between border border-black/10 shadow-lg rounded-md sound-pad-enter ${isRecording ? 'ring-2 ring-red-500 ring-offset-2' : padState.isPlaying ? 'ring-2 ring-black ring-offset-2' : ''}`}
    >
      <header>
        <div className="flex justify-between items-center mb-2">
          <input
            type="text"
            value={padState.name}
            onChange={(e) => updatePadState(padState.id, { name: e.target.value })}
            className="font-bold text-base uppercase text-black bg-transparent border-none p-0 focus:ring-0 w-full"
            disabled={isRecording}
          />
           <div className="flex items-center gap-1">
             {hasAudio && !isRecording && (
                <>
                  <button onClick={handleExport} title="Download" className="p-1 rounded-full hover:bg-black/10 text-gray-600 hover:text-black transition-colors disabled:text-gray-300 disabled:cursor-not-allowed">
                      <DownloadIcon className="w-4 h-4"/>
                  </button>
                  <button onClick={handleClear} title="Clear Pad" className="text-gray-600 hover:text-black transition-colors p-1 flex-shrink-0">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
             )}
           </div>
        </div>
        {isRecording && <p className="text-base text-red-500 text-right">Recording...</p>}
      </header>
      
      <div
          className="h-24 my-4 w-full flex items-center justify-center relative bg-black/5 rounded-md select-none"
      >
          {hasAudio && (
            <>
              <StaticWaveform 
                audioBuffer={audioBufferRef.current.original} 
                color="#1f2937"
                isReversed={padState.isReversed} 
              />
              <RangeSlider
                min={0} max={1} step={0.001}
                value={[padState.start, padState.end]}
                onChange={([start, end]) => updatePadState(padState.id, { start, end })}
                disabled={!hasAudio || isRecording}
              />
            </>
          )}

          {(padState.isPlaying || isRecording) && (
            <VisualizerCanvas 
                analyserNode={isRecording ? recorderAnalyserNode : playbackAnalyserNode} 
                isRecording={isRecording} 
            />
          )}

          {!hasAudio && !isRecording && (
            <div className="flex gap-2 w-full h-full p-2">
                <button
                    onClick={handleToggleRecord}
                    className="flex-1 h-full flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 text-black transition-colors rounded-md"
                >
                    <RecordIcon className="w-6 h-6 mb-1"/>
                    <span className="text-sm font-semibold">RECORD</span>
                </button>
                <button
                    onClick={handleUploadClick}
                    className="flex-1 h-full flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 text-black transition-colors rounded-md"
                >
                    <UploadIcon className="w-6 h-6 mb-1"/>
                    <span className="text-sm font-semibold">UPLOAD</span>
                </button>
            </div>
          )}

          {(hasAudio || isRecording) && (
            <button
              onClick={isRecording ? handleToggleRecord : handleTogglePlay}
              disabled={!hasAudio && !isRecording}
              aria-label={isRecording ? 'Stop Recording' : padState.isPlaying ? 'Pause' : 'Play'}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:bg-gray-400/50 disabled:cursor-not-allowed z-10"
            >
              {isRecording ? <StopIcon className="w-8 h-8" />
                : padState.isPlaying ? <PauseIcon className="w-8 h-8" />
                : <PlayIcon className="w-8 h-8" />
              }
            </button>
          )}
      </div>

      <div className="space-y-3 text-sm">
        <div className="space-y-4 pt-2">
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label htmlFor={`rate-${padState.id}`} className="text-sm font-bold text-black uppercase">Speed</label>
                    <span className="text-sm text-black font-mono">{padState.playbackRate.toFixed(2)}x</span>
                </div>
                <input
                    id={`rate-${padState.id}`} type="range" min="0.5" max="1.5" step="0.01"
                    value={padState.playbackRate}
                    onChange={(e) => updatePadState(padState.id, { playbackRate: parseFloat(e.target.value) })}
                    disabled={!hasAudio || isRecording}
                    className="w-full"
                    style={{'--slider-bg': `linear-gradient(to right, #000 ${ratePercent}%, #e5e7eb ${ratePercent}%)`} as React.CSSProperties}
                />
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label htmlFor={`volume-${padState.id}`} className="text-sm font-bold text-black uppercase">Volume</label>
                    <span className="text-sm text-black font-mono">{Math.round(padState.volume * 100)}%</span>
                </div>
                <input
                    id={`volume-${padState.id}`} type="range" min="0" max="1" step="0.01"
                    value={padState.volume}
                    onChange={(e) => updatePadState(padState.id, { volume: parseFloat(e.target.value) })}
                    disabled={!hasAudio || isRecording}
                    className="w-full"
                    style={{'--slider-bg': `linear-gradient(to right, #000 ${volumePercent}%, #e5e7eb ${volumePercent}%)`} as React.CSSProperties}
                />
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label htmlFor={`reverb-${padState.id}`} className="text-sm font-bold text-black uppercase">Reverb</label>
                    <span className="text-sm text-black font-mono">{Math.round(padState.reverbMix * 100)}%</span>
                </div>
                <input
                    id={`reverb-${padState.id}`} type="range" min="0" max="1" step="0.01"
                    value={padState.reverbMix}
                    onChange={(e) => updatePadState(padState.id, { reverbMix: parseFloat(e.target.value) })}
                    disabled={!hasAudio || isRecording}
                    className="w-full"
                    style={{'--slider-bg': `linear-gradient(to right, #000 ${reverbPercent}%, #e5e7eb ${reverbPercent}%)`} as React.CSSProperties}
                />
            </div>
            {padState.isFilterEnabled && (
              <>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor={`lowcut-${padState.id}`} className="text-sm font-bold text-black uppercase">Low Cut</label>
                        <span className="text-sm text-black font-mono">{padState.lowCut.toFixed(0)} Hz</span>
                    </div>
                    <input
                        id={`lowcut-${padState.id}`} type="range" min="20" max="5000" step="1"
                        value={padState.lowCut}
                        onChange={(e) => updatePadState(padState.id, { lowCut: parseFloat(e.target.value) })}
                        disabled={!hasAudio || isRecording || !padState.isFilterEnabled}
                        className="w-full"
                        style={{'--slider-bg': `linear-gradient(to right, #000 ${lowCutPercent}%, #e5e7eb ${lowCutPercent}%)`} as React.CSSProperties}
                    />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor={`highcut-${padState.id}`} className="text-sm font-bold text-black uppercase">High Cut</label>
                        <span className="text-sm text-black font-mono">{padState.highCut.toFixed(0)} Hz</span>
                    </div>
                    <input
                        id={`highcut-${padState.id}`} type="range" min="500" max="22050" step="1"
                        value={padState.highCut}
                        onChange={(e) => updatePadState(padState.id, { highCut: parseFloat(e.target.value) })}
                        disabled={!hasAudio || isRecording || !padState.isFilterEnabled}
                        className="w-full"
                        style={{'--slider-bg': `linear-gradient(to right, #000 ${highCutPercent}%, #e5e7eb ${highCutPercent}%)`} as React.CSSProperties}
                    />
                </div>
              </>
            )}
        </div>

        <div className="flex justify-around items-center pt-2 border-t border-black/10 mt-4">
            <div className="flex items-center gap-2">
                <label htmlFor={`loop-${padState.id}`} className="text-sm font-bold text-black uppercase">Loop</label>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id={`loop-${padState.id}`} checked={padState.isLooping} onChange={handleToggleLoop} className="sr-only peer" disabled={!hasAudio || isRecording} />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50"></div>
                </label>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor={`reverse-${padState.id}`} className="text-sm font-bold text-black uppercase">Reverse</label>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id={`reverse-${padState.id}`} checked={padState.isReversed} onChange={handleToggleReverse} className="sr-only peer" disabled={!hasAudio || isRecording} />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50"></div>
                </label>
            </div>
             <div className="flex items-center gap-2">
                <label htmlFor={`filter-${padState.id}`} className="text-sm font-bold text-black uppercase">Filter</label>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id={`filter-${padState.id}`} checked={padState.isFilterEnabled} onChange={handleToggleFilter} className="sr-only peer" disabled={!hasAudio || isRecording} />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50"></div>
                </label>
            </div>
        </div>
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aac" 
        className="hidden" />
    </div>
  );
};

export default SoundPad;