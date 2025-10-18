export interface PadState {
  id: number;
  name: string;
  audioUrl: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  playbackRate: number;
  volume: number;
  isLooping: boolean;
  reverbMix: number;
  source: 'record' | 'upload' | 'none';
  isReversed: boolean;
  isFilterEnabled: boolean;
  lowCut: number;
  highCut: number;
  start: number; // Value from 0 to 1
  end: number;   // Value from 0 to 1
}
