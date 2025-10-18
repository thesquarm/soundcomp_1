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

    const handleMouseUp = useCallback(() => {
        draggingThumbRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled || !sliderRef.current) return;
        
        const rect = sliderRef.current.getBoundingClientRect();
        const clickPos = (e.clientX - rect.left) / rect.width;
        
        const minValPos = (minVal - min) / range;
        const maxValPos = (maxVal - min) / range;

        const distToMin = Math.abs(clickPos - minValPos);
        const distToMax = Math.abs(clickPos - maxValPos);

        // Determine which thumb is closer to the click
        if (distToMin < distToMax) {
            draggingThumbRef.current = 'min';
        } else {
            draggingThumbRef.current = 'max';
        }
        
        // Immediately update position on click
        updateValueFromPosition(e.clientX);
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const minPosPercent = (minVal / range) * 100;
    const maxPosPercent = (maxVal / range) * 100;

    return (
        <div 
            ref={sliderRef}
            onMouseDown={handleMouseDown}
            className={`absolute top-0 left-0 w-full h-full flex items-center group ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            style={{ zIndex: 5 }} // Ensure it's interactive
        >
            {/* Track */}
            <div className="absolute w-full h-full top-0 left-0">
                <div className="absolute h-full bg-black/10 rounded-l-md" style={{ left: 0, width: `${minPosPercent}%` }}></div>
                <div className="absolute h-full border-y-2 border-black/50" style={{ left: `${minPosPercent}%`, width: `${maxPosPercent - minPosPercent}%` }}></div>
                <div className="absolute h-full bg-black/10 rounded-r-md" style={{ left: `${maxPosPercent}%`, right: 0 }}></div>
            </div>

            {/* Thumbs */}
            <div 
                className="absolute top-0 w-2 h-full bg-black cursor-ew-resize pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-center" 
                style={{ left: `${minPosPercent}%`, transform: 'translateX(-50%)' }}
            >
                <div className="w-0.5 h-1/2 bg-white/50 rounded-full"></div>
            </div>
            <div 
                className="absolute top-0 w-2 h-full bg-black cursor-ew-resize pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-center" 
                style={{ left: `${maxPosPercent}%`, transform: 'translateX(-50%)' }}
            >
                <div className="w-0.5 h-1/2 bg-white/50 rounded-full"></div>
            </div>
        </div>
    );
};