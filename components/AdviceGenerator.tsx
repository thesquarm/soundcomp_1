import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { RefreshIcon } from './Icons';

const AdviceGenerator: React.FC = () => {
    const [showInspiration, setShowInspiration] = useState<boolean>(false);
    const [inspirations, setInspirations] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchInspirations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const prompt = `Generate a JSON array of 7 short, creative impulses for a soundscape composer. Each impulse should be a concise, actionable phrase, starting with a verb. Return only the JSON array of strings.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    },
                    temperature: 1.0,
                }
            });

            const parsedInspirations = JSON.parse(response.text);
            if (Array.isArray(parsedInspirations) && parsedInspirations.length > 0) {
                setInspirations(parsedInspirations);
                setCurrentIndex(0);
            } else {
                throw new Error("Received empty or invalid data.");
            }
        } catch (e) {
            console.error("Error fetching inspirations:", e);
            setError("Could not fetch inspirations. Please try again.");
            setInspirations([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (showInspiration && inspirations.length === 0 && !isLoading) {
            fetchInspirations();
        }
    }, [showInspiration, inspirations.length, isLoading, fetchInspirations]);

    const handleNext = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= inspirations.length) {
            fetchInspirations();
        } else {
            setCurrentIndex(nextIndex);
        }
    };
    
    let content;
    if (isLoading) {
        content = <p className="text-gray-500 italic">Finding inspiration...</p>;
    } else if (error) {
        content = <p className="text-red-500">{error}</p>;
    } else if (inspirations.length > 0) {
        content = <p className="text-black text-center">"{inspirations[currentIndex]}"</p>;
    } else {
        content = <p className="text-gray-500">Toggle on to get inspired.</p>;
    }

    return (
        <div className="w-full max-w-xl mx-auto mb-8 font-sans">
            <div className="flex items-center justify-center gap-3 mb-2">
                <label htmlFor="inspiration-toggle" className="text-sm font-bold text-black uppercase">Inspiration?</label>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="inspiration-toggle" checked={showInspiration} onChange={() => setShowInspiration(!showInspiration)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                </label>
            </div>
            
            {showInspiration && (
                <div className="w-full p-4 bg-white/50 border border-gray-200 shadow-sm relative rounded-md flex items-center justify-center min-h-[80px]">
                    <div className="text-lg leading-relaxed px-8">
                        {content}
                    </div>
                    {inspirations.length > 0 && !error && (
                        <button
                            onClick={handleNext}
                            disabled={isLoading}
                            className="absolute top-1/2 -translate-y-1/2 right-2 p-2 text-gray-500 hover:text-black disabled:text-gray-300 disabled:cursor-wait transition-colors rounded-full"
                            aria-label="Next inspiration"
                        >
                            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default AdviceGenerator;
