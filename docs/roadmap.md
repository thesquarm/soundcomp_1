# Project Roadmap: sound_comp

## Vision

`sound_comp` is a minimalist, browser-based soundscape composer. The goal is to provide an intuitive and creative tool for musicians, sound designers, and hobbyists to experiment with sound. By focusing on a simple interface and powerful audio manipulation features, it encourages improvisation and happy accidents in sound design.

---

## Current State (MVP)

The application is currently in a Minimum Viable Product (MVP) stage. The core functionality is in place, providing a solid foundation for a powerful audio tool.

### What Works:

- **Sound Pads:** The interface is built around up to 6 sound pads.
- **Audio Input:**
    - Record audio directly from a microphone.
    - Upload local audio files (e.g., WAV, MP3, OGG).
- **Playback Controls:**
    - Global "Play All" and "Stop All" controls.
    - Individual play/pause controls on each pad.
- **Per-Pad Audio Manipulation:**
    - **Speed:** Adjust playback rate from 0.5x to 1.5x.
    - **Volume:** Control the volume of each pad.
    - **Looping:** Toggle seamless looping for any sample.
    - **Reverse:** Instantly play any sample in reverse.
    - **Reverb:** A simple but effective reverb effect with a wet/dry mix control.
    - **Filter:** A switchable low-cut (high-pass) and high-cut (low-pass) filter.
- **Performance Recording:**
    - Record a live performance of your composition.
    - Download the final mix as a high-quality `.wav` file.
- **Visual Feedback:**
    - A static waveform is rendered for every loaded sample.
    - A live frequency visualizer provides real-time feedback during recording and playback.
- **AI-Powered Inspiration:**
    - An optional "Inspiration" feature, powered by the Gemini API, provides creative prompts to spark ideas.

---

## Future Plans

This roadmap outlines potential features and improvements for the future.

### Short-Term Goals (Next Steps)

- **Save/Load Projects:** Implement functionality to save the state of all pads (including audio and settings) to a local file and load it back.
- **Panning Control:** Add a stereo pan control to each pad.
- **More Effects:** Introduce more audio effects like delay, distortion, or bit-crushing.
- **Keyboard Shortcuts:** Allow triggering pads and controls via the computer keyboard for a more tactile experience.
- **UI/UX Refinements:** Improve accessibility and refine the user interface based on feedback.

### Mid-Term Goals

- **MIDI Controller Support:** Enable control of pads and parameters using external MIDI controllers.
- **Parameter Automation:** Add the ability to record automation for parameters like volume, speed, and filter cutoff.
- **Advanced Sequencing:** Introduce a simple step-sequencer for triggering pads.
- **Sharing Compositions:** Create a way to share a composition via a unique link.
- **AI-Powered Sample Generation:** Explore using Gemini to generate short sound descriptions or even raw audio samples based on text prompts.

### Long-Term Vision (The Dream)

- **Collaborative Mode:** Allow multiple users to compose together in real-time over the network.
- **Plugin Version:** Package the application as a VST/AU plugin for use in professional DAWs.
- **Mobile Experience:** Create a dedicated, touch-friendly version for mobile devices.
