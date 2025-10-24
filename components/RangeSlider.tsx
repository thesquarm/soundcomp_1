import React, { useRef, useCallback } from 'react';

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
    const range = max - min;

    const updateValueFromPosition = useCallback((clientX: number) => {
        if (!sliderRef.current || !draggingThumbRef.current) return;
        
        const rect = sliderRef.current.getBoundingClientRect();
        let pos = (clientX - rect.left) / rect.width;
        pos = Math.max(0, Math.min(1, pos)); // clamp between 0 and 1
        
        let newValue = min + pos * range;
        // handle step
        newValue = Math.round(newValue / step) * step;

        if (draggingThumbRef.current === 'min') {
            const newMinVal = Math.max(min, Math.min(newValue, maxVal - step));
            onChange([newMinVal, maxVal]);
        } else {
            const newMaxVal = Math.min(max, Math.max(newValue, minVal + step));
            onChange([minVal, newMaxVal]);
        }
    }, [min, max, step, minVal, maxVal, onChange, range]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        e.preventDefault();
        updateValueFromPosition(e.clientX);
    }, [updateValueFromPosition]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        e.preventDefault();
        updateValueFromPosition(e.touches[0].clientX);
    }, [updateValueFromPosition]);

    const handleMouseUp = useCallback(() => {
        draggingThumbRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const handleTouchEnd = useCallback(() => {
        draggingThumbRef.current = null;
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
    }, [handleTouchMove]);

    const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>, thumb: 'min' | 'max') => {
        e.stopPropagation();
        if (disabled) return;
        draggingThumbRef.current = thumb;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleThumbTouchStart = (e: React.TouchEvent<HTMLDivElement>, thumb: 'min' | 'max') => {
        e.stopPropagation();
        if (disabled) return;
        draggingThumbRef.current = thumb;
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);
    };

    const minPosPercent = (minVal / range) * 100;
    const maxPosPercent = (maxVal / range) * 100;

    return (
        <div 
            ref={sliderRef}
            className={`absolute top-0 left-0 w-full h-full flex items-center group ${disabled ? 'cursor-not-allowed' : ''}`}
            style={{ zIndex: 5 }}
        >
            {/* Track */}
            <div className="absolute w-full h-full top-0 left-0">
                <div className="absolute h-full bg-black/10 rounded-l-md" style={{ left: 0, width: `${minPosPercent}%` }}></div>
                <div className="absolute h-full border-y-2 border-black/50" style={{ left: `${minPosPercent}%`, width: `${maxPosPercent - minPosPercent}%` }}></div>
                <div className="absolute h-full bg-black/10 rounded-r-md" style={{ left: `${maxPosPercent}%`, right: 0 }}></div>
            </div>

            {/* Thumbs */}
            <div 
                onMouseDown={(e) => handleThumbMouseDown(e, 'min')}
                onTouchStart={(e) => handleThumbTouchStart(e, 'min')}
                className="absolute top-0 w-6 h-full bg-black/70 cursor-ew-resize group-hover:bg-black/80 transition-colors flex items-center justify-center rounded-sm"
                style={{ left: `${minPosPercent}%`, transform: 'translateX(-50%)' }}
            >
                <div className="w-1 h-1/2 bg-white/75 rounded-full"></div>
            </div>
            <div 
                onMouseDown={(e) => handleThumbMouseDown(e, 'max')}
                onTouchStart={(e) => handleThumbTouchStart(e, 'max')}
                className="absolute top-0 w-6 h-full bg-black/70 cursor-ew-resize group-hover:bg-black/80 transition-colors flex items-center justify-center rounded-sm"
                style={{ left: `${maxPosPercent}%`, transform: 'translateX(-50%)' }}
            >
                <div className="w-1 h-1/2 bg-white/75 rounded-full"></div>
            </div>
        </div>
    );
};