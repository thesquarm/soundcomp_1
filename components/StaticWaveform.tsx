import React, { useRef, useEffect } from 'react';

interface StaticWaveformProps {
  audioBuffer: AudioBuffer | null;
  color: string;
  isReversed?: boolean;
}

export const StaticWaveform: React.FC<StaticWaveformProps> = ({ audioBuffer, color, isReversed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;

    if (!ctx || !parent) return;

    // Set canvas drawing size to match display size for crisp rendering
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const width = canvas.width;
    const height = canvas.height;
    const data = audioBuffer.getChannelData(0); // Use the first channel
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    
    // Save context state before transforming
    ctx.save();

    if (isReversed) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Draw line from the middle
    ctx.moveTo(0, amp);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      
      // Find min/max values for the current chunk
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      
      // Draw a vertical line from min to max amplitude
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }

    ctx.stroke();

    // Restore context state to remove transformations
    ctx.restore();

  }, [audioBuffer, color, isReversed]);

  // Use a key to force re-render when the buffer changes, ensuring canvas redraws
  return <canvas key={audioBuffer?.duration} ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />;
};