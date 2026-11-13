import React, { useRef, useCallback, useEffect } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  disabled?: boolean;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({ min, max, step, value, onChange, disabled }) => {
  const [minVal, maxVal] = value;
  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingThumbRef = useRef<'min' | 'max' | null>(null);
  const latestValuesRef = useRef({ minVal, maxVal, onChange });
  latestValuesRef.current = { minVal, maxVal, onChange };

  const range = max - min;

  const updateValueFromPosition = useCallback((clientX: number) => {
    if (!sliderRef.current || !draggingThumbRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    let pos = (clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));

    let newValue = min + pos * range;
    newValue = Math.round(newValue / step) * step;

    const { minVal: curMin, maxVal: curMax, onChange: emitChange } = latestValuesRef.current;

    if (draggingThumbRef.current === 'min') {
      const newMinVal = Math.max(min, Math.min(newValue, curMax - step));
      emitChange([newMinVal, curMax]);
    } else {
      const newMaxVal = Math.min(max, Math.max(newValue, curMin + step));
      emitChange([curMin, newMaxVal]);
    }
  }, [min, max, step, range]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    e.preventDefault();
    updateValueFromPosition(e.clientX);
  }, [updateValueFromPosition]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (e.touches && e.touches.length > 0) {
      updateValueFromPosition(e.touches[0].clientX);
    }
  }, [updateValueFromPosition]);

  const stopDragging = useCallback(() => {
    draggingThumbRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopDragging);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', stopDragging);
    window.removeEventListener('touchcancel', stopDragging);
  }, [handleMouseMove, handleTouchMove]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>, thumb: 'min' | 'max') => {
    e.stopPropagation();
    if (disabled) return;
    draggingThumbRef.current = thumb;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
  };

  const handleThumbTouchStart = (e: React.TouchEvent<HTMLDivElement>, thumb: 'min' | 'max') => {
    e.stopPropagation();
    if (disabled) return;
    draggingThumbRef.current = thumb;
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopDragging);
    window.addEventListener('touchcancel', stopDragging);
  };

  const minPosPercent = (minVal / range) * 100;
  const maxPosPercent = (maxVal / range) * 100;

  return (
    <div
      ref={sliderRef}
      className={`absolute top-0 left-0 w-full h-full flex items-center group touch-none ${disabled ? 'cursor-not-allowed' : ''}`}
      style={{ zIndex: 5 }}
    >
      {/* Track */}
      <div className="absolute w-full h-full top-0 left-0 pointer-events-none">
        <div className="absolute h-full bg-black/10 rounded-l-md" style={{ left: 0, width: `${minPosPercent}%` }}></div>
        <div className="absolute h-full border-y-2 border-black/50" style={{ left: `${minPosPercent}%`, width: `${maxPosPercent - minPosPercent}%` }}></div>
        <div className="absolute h-full bg-black/10 rounded-r-md" style={{ left: `${maxPosPercent}%`, right: 0 }}></div>
      </div>

      {/* Thumbs */}
      <div
        onMouseDown={(e) => handleThumbMouseDown(e, 'min')}
        onTouchStart={(e) => handleThumbTouchStart(e, 'min')}
        className="absolute top-0 w-6 h-full bg-black/70 cursor-ew-resize group-hover:bg-black/80 transition-colors flex items-center justify-center rounded-sm touch-none"
        style={{ left: `${minPosPercent}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-1 h-1/2 bg-white/75 rounded-full"></div>
      </div>
      <div
        onMouseDown={(e) => handleThumbMouseDown(e, 'max')}
        onTouchStart={(e) => handleThumbTouchStart(e, 'max')}
        className="absolute top-0 w-6 h-full bg-black/70 cursor-ew-resize group-hover:bg-black/80 transition-colors flex items-center justify-center rounded-sm touch-none"
        style={{ left: `${maxPosPercent}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-1 h-1/2 bg-white/75 rounded-full"></div>
      </div>
    </div>
  );
};