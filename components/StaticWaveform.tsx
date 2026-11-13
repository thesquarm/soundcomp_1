import React, { useRef, useEffect, useCallback } from 'react';

interface StaticWaveformProps {
  audioBuffer: AudioBuffer | null;
  color: string;
  isReversed?: boolean;
}

export const StaticWaveform: React.FC<StaticWaveformProps> = ({ audioBuffer, color, isReversed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!audioBuffer || !canvas) return;

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!ctx || !parent) return;

    const cssWidth = parent.offsetWidth;
    const cssHeight = parent.offsetHeight;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    canvas.width = cssWidth;
    canvas.height = cssHeight;

    const width = canvas.width;
    const height = canvas.height;
    const data = audioBuffer.getChannelData(0);
    if (!data || data.length === 0) return;

    const step = Math.max(1, Math.ceil(data.length / width));
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    if (isReversed) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const baseIdx = i * step;
      if (baseIdx >= data.length) break;

      for (let j = 0; j < step; j++) {
        const idx = baseIdx + j;
        if (idx >= data.length) break;
        const datum = data[idx];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      if (min > max) {
        min = 0;
        max = 0;
      }

      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }

    ctx.stroke();
    ctx.restore();
  }, [audioBuffer, color, isReversed]);

  useEffect(() => {
    drawWaveform();

    const parent = canvasRef.current?.parentElement;
    if (!parent) return;

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        drawWaveform();
      });
      observer.observe(parent);
    } else {
      window.addEventListener('resize', drawWaveform);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', drawWaveform);
      }
    };
  }, [drawWaveform]);

  return <canvas key={audioBuffer?.length ?? 'empty'} ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />;
};