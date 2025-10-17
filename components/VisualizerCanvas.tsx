import React, { useRef, useEffect } from 'react';

interface VisualizerCanvasProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
}

const COLORS = {
    recording: '#ef4444', // red-500
    default: '#1f2937',   // gray-800
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({ analyserNode, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    analyserNode.fftSize = 256;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationFrameId: number;

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);

      analyserNode.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 1.5;
      let barHeight;
      let x = 0;
      
      canvasCtx.fillStyle = isRecording ? COLORS.recording : COLORS.default;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, isRecording]);

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />;
};