# Architectural Decisions

This document outlines the key architectural decisions and technical choices made during the development of `sound_comp`.

## Core Technologies

- **Framework:** React 19 with TypeScript.
  - *Why?* React's component-based model is a perfect fit for the modular UI of sound pads. TypeScript adds static typing, which improves code quality, readability, and long-term maintainability.
- **Styling:** Tailwind CSS (via CDN).
  - *Why?* Tailwind's utility-first approach allows for rapid UI development and keeps styles co-located with their components, making them easy to manage and reason about. Using the CDN simplifies the setup for an environment without a dedicated build step.
- **Runtime Environment:** Modern browser with ES Modules.
  - *Why?* The application is built to run directly in the browser without a build step. It uses an `importmap` in `index.html` to handle module resolution, making the development setup extremely lightweight and portable.

## State Management

- **Strategy:** React's built-in hooks (`useState`, `useCallback`, `useRef`).
  - *Why?* For the current scope of the application, a dedicated state management library (like Redux or Zustand) is overkill. The component tree is shallow, and state is managed in the top-level `App.tsx` component and passed down as props. This keeps the data flow simple and predictable.

## Web Audio API Implementation

The Web Audio API is the heart of `sound_comp`.

- **`AudioContext` Management:** A single, global `AudioContext` is instantiated and managed in `App.tsx`. It is passed to child components via a `getAudioContext` function.
  - *Why?* Browsers limit the number of active `AudioContext`s, so using a singleton is best practice. The context is also explicitly resumed upon user interaction to comply with browser autoplay policies.

- **Audio Graph per Pad:** Each `SoundPad` component is responsible for creating and managing its own independent audio processing graph. A typical graph looks like this:
  `AudioBufferSourceNode` -> `AnalyserNode` -> `GainNode` (Volume) -> `BiquadFilterNode` (Low-Cut) -> `BiquadFilterNode` (High-Cut) -> [Reverb Send] -> `GainNode` (Master Out) -> `AudioContext.destination` & `MixDestination`

  - *Why?* This encapsulates the logic and state for each sound, making the `SoundPad` component self-contained and reusable.

- **Reverb:** The reverb effect is implemented using a `ConvolverNode`. The impulse response (the "sound" of the reverb) is programmatically generated in `utils/audio.ts` when the app loads.
  - *Why?* Programmatically generating the impulse response avoids the need to load an external audio file and provides a consistent, lightweight reverb. The same impulse response `AudioBuffer` is shared across all pads for efficiency. Each pad has its own dry/wet gain nodes to control the amount of reverb.

- **Sample Trimming:** Users can adjust the start and end points of a sample.
  - **UI:** A custom `RangeSlider` component is overlaid on the waveform display. It manages two "thumbs" for the start and end positions.
  - **State:** The `PadState` stores `start` and `end` values as numbers between 0 and 1, representing the percentage of the audio file.
  - **Implementation:** When an `AudioBufferSourceNode` is started, these normalized `start` and `end` values are multiplied by the buffer's total duration to calculate the precise `offset` (when to start playing) and `duration` (how long to play). For looping sounds, the `loopStart` and `loopEnd` properties of the source node are updated in real-time, allowing for dynamic loop manipulation as the user drags the sliders.

- **Performance Recording:**
  - **Capture:** To record the final mix, a `MediaStreamAudioDestinationNode` acts as a virtual "mix bus". When recording is active, every `SoundPad` connects its master output to this destination node. A `MediaRecorder` captures the audio stream from this node. This approach correctly captures all audio processed by the Web Audio API, including all effects and parameter changes, exactly as the user hears it.
  - **Save/Share Flow:** When the recording is stopped, the resulting Blob is processed. The `App` component's state is updated to show a `PerformanceSaveModal`. This modal allows the user to name the file and provides two options:
    1.  **Save to Device:** A standard download link is created from the Blob.
    2.  **Share:** The Web Share API (`navigator.share`) is used to open the device's native sharing menu, allowing the user to send the audio file to other apps.
  - **Unsaved Recordings:** If the user closes the modal without saving, the performance Blob and its name are added to a list in the `App` component's state. This list is rendered below the main controls, ensuring that recordings are not lost and can be downloaded later.

- **Audio Data Handling:** All audio (recorded or uploaded) is decoded into an `AudioBuffer`.
  - *Why?* `AudioBuffer`s are highly optimized for playback and manipulation within the Web Audio API. This allows for features like seamless looping and efficient reversing, which is done by creating a new `AudioBuffer` with the sample data in reverse order. The final recorded performance is converted to a WAV file using a utility function for maximum compatibility.

## Gemini API Integration

- **Component:** `AdviceGenerator.tsx`.
- **Functionality:** This component provides optional creative prompts to the user. It fetches a list of short, actionable ideas from the Gemini API.
- **Implementation Details:**
  - It uses the `@google/genai` library to communicate with the Gemini API.
  - To ensure a reliable response format, the API call specifies `responseMimeType: "application/json"` and provides a `responseSchema` that defines the expected output (an array of strings). This offloads the structural formatting to the model.
  - The API key is sourced from `process.env.API_KEY`, which is assumed to be provided by the execution environment (e.g., Google AI Studio).

## Component Structure

- **`App.tsx`**: The root component. Manages the array of pad states, global controls (play/stop all, record performance), the master `AudioContext`, and the list of saved performances.
- **`components/SoundPad.tsx`**: The core interactive element. Manages its own internal state (e.g., audio nodes, buffer references) derived from the props passed down by `App.tsx`. Handles all user interactions for a single pad.
- **`components/PerformanceSaveModal.tsx`**: A modal dialog for naming, saving, and sharing a recorded performance.
- **`components/RangeSlider.tsx`**: A custom two-thumb slider component used for trimming audio samples.
- **`hooks/useRecorder.ts`**: A custom hook encapsulating the logic for using `navigator.mediaDevices.getUserMedia` and `MediaRecorder` to record from the microphone.
- **`utils/audio.ts`**: A collection of pure helper functions for audio-related tasks like converting an `AudioBuffer` to a WAV file Blob, reversing audio data, and creating the impulse response.
- **`components/{VisualizerCanvas.tsx, StaticWaveform.tsx, Icons.tsx}`**: Presentational components responsible for rendering visual elements.