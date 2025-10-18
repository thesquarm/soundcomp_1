import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { RefreshIcon, WorldIcon } from './Icons';

const availableLanguages = ['English', 'German', 'Spanish', 'French', 'Japanese', 'Turkish', 'Arabic', 'Italian', 'Russian'];

const AdviceGenerator: React.FC = () => {
    const [showInspiration, setShowInspiration] = useState<boolean>(false);
    const [inspirations, setInspirations] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [difficulty, setDifficulty] = useState<'easy' | 'abstract'>('abstract');
    const [language, setLanguage] = useState<string>('English');
    const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState<boolean>(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    const fetchInspirations = useCallback(async () => {
        if (!showInspiration) return;
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const prompt = `Generate a JSON array of 7 short, creative ideas for sound design. The ideas should be ${
                difficulty === 'easy'
                ? 'simple and easy for anyone to try'
                : 'abstract and thought-provoking for a sound artist'
            }. The response must be in ${language}. The ideas should be inspired by nature, sustainability, and our environment. Mix ideas between making sounds yourself (like snapping fingers) and finding sounds in your environment (like rain on a window). The prompts should be direct actions or descriptions of sounds, without explaining their deeper meaning. For example: "Capture the brittle rustle of dry leaves on pavement." or "Gently tap a crystal glass with a metal spoon.". Return only the JSON array of strings.`;
            
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
    }, [difficulty, language, showInspiration]);

    useEffect(() => {
        fetchInspirations();
    }, [fetchInspirations]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setIsLanguagePickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNext = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= inspirations.length) {
            fetchInspirations();
        } else {
            setCurrentIndex(nextIndex);
        }
    };

    const handleLanguageSelect = (lang: string) => {
        setLanguage(lang);
        setIsLanguagePickerOpen(false);
    }
    
    let content;
    if (isLoading) {
        content = <p className="text-gray-500 italic">Finding inspiration...</p>;
    } else if (error) {
        content = <p className="text-red-500">{error}</p>;
    } else if (inspirations.length > 0) {
        content = <p className="text-black text-center">"{inspirations[currentIndex]}"</p>;
    } else if (showInspiration) {
        content = <p className="text-gray-500">Toggle on to get inspired.</p>;
    }

    return (
        <div className="w-full max-w-xl mx-auto mb-8 font-sans">
            <div className="flex items-center justify-center gap-4 mb-2">
                <div className="flex items-center gap-2">
                    <label htmlFor="inspiration-toggle" className="text-sm font-bold text-black uppercase">Inspiration?</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="inspiration-toggle" checked={showInspiration} onChange={() => setShowInspiration(!showInspiration)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                    </label>
                </div>
                {showInspiration && (
                  <>
                    <div className="flex items-center gap-2">
                        <label htmlFor="difficulty-toggle" className="text-sm font-bold text-black uppercase">{difficulty}</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="difficulty-toggle" checked={difficulty === 'easy'} onChange={() => setDifficulty(d => d === 'easy' ? 'abstract' : 'easy')} className="sr-only peer" />
                            <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                        </label>
                    </div>
                    <div className="relative" ref={pickerRef}>
                        <button onClick={() => setIsLanguagePickerOpen(!isLanguagePickerOpen)} className="p-1.5 rounded-full hover:bg-gray-200 transition-colors">
                            <WorldIcon className="w-5 h-5 text-black" />
                        </button>
                        {isLanguagePickerOpen && (
                            <div className="absolute top-full right-0 mt-2 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                                {availableLanguages.map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => handleLanguageSelect(lang)}
                                        className={`block w-full text-left px-4 py-2 text-sm ${language === lang ? 'bg-gray-100 font-bold' : 'hover:bg-gray-50'}`}
                                    >
                                        {lang}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                  </>
                )}
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