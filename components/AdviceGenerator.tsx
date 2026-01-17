
import React, { useState, useEffect, useMemo } from 'react';
import { RefreshIcon } from './Icons';

const EASY_INSPIRATIONS = [
    "Tap a pencil on three different surfaces around you.",
    "Crinkle a dry snack bag slowly near your microphone.",
    "Record the sound of pouring a cold glass of water.",
    "Snap your fingers at three different distances from the mic.",
    "Hum a single, steady note for exactly five seconds.",
    "Slowly open and then quickly close a heavy door.",
    "Shuffle your feet across a rug or carpeted floor.",
    "Clink two metal spoons together softly.",
    "Blow gently across the top of an empty glass bottle.",
    "Tear a piece of scrap paper as slowly as possible.",
    "Rattle a bunch of keys for a metallic texture.",
    "Scratch the surface of a cardboard box with your fingernails.",
    "Click a ballpoint pen in a rhythmic pattern.",
    "Stir a cup of liquid with a metal spoon.",
    "Rub two smooth stones together.",
    "Clap your hands: once soft, once medium, once loud.",
    "Record yourself whispering a short, random word.",
    "Shake a container of dry rice, lentils, or pasta.",
    "Zip and unzip a jacket or bag quickly.",
    "Tap rhythmically on a hollow wooden table or desk."
];

const ABSTRACT_INSPIRATIONS = [
    "Capture the 'weight' of silence in a busy room.",
    "Record the hidden electromagnetic hum of a power adapter.",
    "Interpret the feeling of 'brittle' using only found objects.",
    "Document the slowest possible movement of a squeaky hinge.",
    "Create a rhythmic loop using only the sound of friction.",
    "Find and record the resonant frequency of your bathroom.",
    "Capture the microscopic texture of a melting ice cube.",
    "Record the rhythmic 'dying' sound of a battery-powered toy.",
    "Capture the whistle of wind through a narrow window crack.",
    "Layer three different textures of household 'white noise'.",
    "Sound out the visual texture of a piece of moss or fabric.",
    "Record the internal resonance of an empty metal trash can.",
    "Capture the transition from liquid bubbling to steam.",
    "Find a sound in your environment that represents 'stasis'.",
    "Record the vibration of a phone on a resonant glass surface.",
    "Manipulate a sigh until it sounds entirely mechanical.",
    "Capture the rhythmic 'breathing' of an old radiator or AC.",
    "Record the sound of a clock ticking from a separate room.",
    "Find the highest natural pitch your current room offers.",
    "Record the sound of your own heartbeat using the microphone."
];

const AdviceGenerator: React.FC = () => {
    const [showInspiration, setShowInspiration] = useState<boolean>(false);
    const [difficulty, setDifficulty] = useState<'easy' | 'abstract'>('abstract');
    const [currentIndex, setCurrentIndex] = useState<number>(0);

    // Pick a random starting point when toggled or difficulty changes
    useEffect(() => {
        if (showInspiration) {
            setCurrentIndex(Math.floor(Math.random() * 20));
        }
    }, [showInspiration, difficulty]);

    const currentList = useMemo(() => {
        return difficulty === 'easy' ? EASY_INSPIRATIONS : ABSTRACT_INSPIRATIONS;
    }, [difficulty]);

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % currentList.length);
    };

    return (
        <div className="w-full max-w-xl mx-auto mb-8 font-sans">
            <div className="flex items-center justify-center gap-6 mb-4">
                <div className="flex items-center gap-3">
                    <label htmlFor="inspiration-toggle" className="text-xs font-bold text-black uppercase tracking-widest">Inspiration</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            id="inspiration-toggle" 
                            checked={showInspiration} 
                            onChange={() => setShowInspiration(!showInspiration)} 
                            className="sr-only peer" 
                        />
                        <div className="w-10 h-5 bg-gray-300 rounded-full peer peer-checked:bg-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                    </label>
                </div>
                
                {showInspiration && (
                    <div className="flex items-center gap-3 border-l border-gray-300 pl-6">
                        <span className={`text-xs font-bold uppercase tracking-widest transition-opacity ${difficulty === 'abstract' ? 'opacity-100' : 'opacity-30'}`}>Abstract</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                id="difficulty-toggle" 
                                checked={difficulty === 'easy'} 
                                onChange={() => setDifficulty(d => d === 'easy' ? 'abstract' : 'easy')} 
                                className="sr-only peer" 
                            />
                            <div className="w-10 h-5 bg-black rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                        </label>
                        <span className={`text-xs font-bold uppercase tracking-widest transition-opacity ${difficulty === 'easy' ? 'opacity-100' : 'opacity-30'}`}>Easy</span>
                    </div>
                )}
            </div>
            
            {showInspiration && (
                <div className="w-full p-6 bg-white border border-black/10 shadow-sm relative rounded-md flex items-center justify-center min-h-[100px] transition-all duration-500 ease-in-out">
                    <div className="text-center">
                        <span className="block text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2 font-mono">
                            Task {currentIndex + 1} / 20
                        </span>
                        <p className="text-black text-lg italic leading-relaxed px-10">
                            "{currentList[currentIndex]}"
                        </p>
                    </div>
                    
                    <button
                        onClick={handleNext}
                        className="absolute right-4 p-2 text-gray-400 hover:text-black transition-colors rounded-full"
                        aria-label="Next inspiration"
                    >
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdviceGenerator;
