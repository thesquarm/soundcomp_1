# Project Roadmap: sound_comp

## Vision

`sound_comp` is a minimalist, browser-based soundscape composer. The goal is to provide an intuitive and creative tool for musicians, sound designers, and hobbyists to experiment with sound. By focusing on a simple interface and powerful audio manipulation features, it encourages improvisation and happy accidents in sound design.

---

## Current State (Feature-Rich MVP)

The application is currently a feature-rich Minimum Viable Product (MVP). The core functionality is robust, providing a solid foundation for a powerful audio tool.

### What Works:

- **Sound Pads:** The interface is built around a dynamic grid of up to 6 sound pads with a refined UI for easier access to controls.
- **Audio Input:**
    - Record audio directly from a microphone.
    - Upload local audio files (e.g., WAV, MP3, M4A, OGG).
- **Playback Controls:**
    - Global "Play All" and "Stop All" controls.
    - Individual play/pause controls on each pad, conveniently located in the header.
- **Per-Pad Audio Manipulation:**
    - **Speed:** Adjust playback rate from 0.5x to 1.5x.
    - **Volume:** Control the volume of each pad.
    - **Looping:** Toggle seamless looping for any sample.
    - **Reverse:** Instantly play any sample in reverse.
    - **Reverb:** A simple but effective reverb effect with a wet/dry mix control.
    - **Filter:** A switchable low-cut (high-pass) and high-cut (low-pass) filter.
    - **Sample Trimming:** Adjust the start and end points of a sample using interactive, mobile-friendly markers on the waveform display. Loop points update in real-time.
- **Performance Recording:**
    - Record a live performance of your composition.
    - After recording, a modal appears allowing you to name the file.
    - **Save & Share:** Download the final mix as a high-quality `.wav` file or share it using the native device sharing menu (Web Share API).
    - **Unsaved Recordings:** Recordings that are not immediately saved are listed, so they can be downloaded later.
- **Visual Feedback:**
    - A static waveform is rendered for every loaded sample.
    - A live frequency visualizer provides real-time feedback during recording and playback.
    - A red playback cursor moves across each waveform to show the current playback position.
    - A global, pulsing red bar at the top of the screen clearly indicates when a performance recording is active.
- **AI-Powered Inspiration:**
    - An optional "Inspiration" feature, powered by the Gemini API, provides creative prompts to spark ideas for users.

### Recent Improvements & Fixes:

- **UI Refinements:** The layout of the sound pad has been improved, with the play/pause button moved to the header for easier access. The audio trimmer handles have been enlarged and refined for better usability, especially on touch devices.
- **Recording Bug Fix:** Fixed a critical issue where clearing a pad during a recording would not stop the microphone capture, causing old audio to be included in subsequent recordings.

---

## Future Plans

This roadmap outlines potential features and improvements for the future.

### Short-Term Goals (Next Steps)

- **Save/Load Projects:** Implement functionality to save the state of all pads (including audio and settings) to a local file and load it back.
- **Panning Control:** Add a stereo pan control to each pad.
- **More Effects:** Introduce more audio effects like delay, distortion, or bit-crushing.
- **Keyboard Shortcuts:** Allow triggering pads and controls via the computer keyboard for a more tactile experience.
- **UI/UX Refinements:** Continue improving accessibility and refining the user interface based on feedback.

### Mid-Term Goals

- **MIDI Controller Support:** Enable control of pads and parameters using external MIDI controllers.
- **Parameter Automation:** Add the ability to record automation for parameters like volume, speed, and filter cutoff during performance recording.
- **Advanced Sequencing:** Introduce a simple step-sequencer for triggering pads.
- **Sharing Compositions:** Create a way to share a composition via a unique link (persisting project state in the URL or a small database).
- **AI-Powered Sample Generation:** Explore using Gemini to generate short sound descriptions or even raw audio samples based on text prompts.

### Long-Term Vision (The Dream)

- **Collaborative Mode:** Allow multiple users to compose together in real-time over the network.
- **Plugin Version:** Package the application as a VST/AU plugin for use in professional DAWs.
- **Mobile Experience:** Create a dedicated, touch-friendly version for mobile devices.