// In-memory cache for created audio Blobs to avoid unnecessary network fetches and bypass CSP restrictions
const blobCache = new Map<string, Blob>();
const unlockedAudioContexts = new WeakSet<AudioContext>();

export const registerAudioBlob = (url: string, blob: Blob): void => {
  blobCache.set(url, blob);
  if (blobCache.size > 50) {
    const firstKey = blobCache.keys().next().value;
    if (firstKey) blobCache.delete(firstKey);
  }
};

export const unregisterAudioBlob = (url: string | null): void => {
  if (url) {
    blobCache.delete(url);
  }
};

export const getAudioContextConstructor = (): typeof AudioContext => {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
};

/**
 * Synchronously unlocks an AudioContext inside a user gesture (critical for iOS Safari / WebKit).
 * Safe to call repeatedly; plays a 1-sample silent buffer once per AudioContext instance.
 */
export const unlockAudioContext = (audioContext: AudioContext): void => {
  try {
    const state = audioContext.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      audioContext.resume().catch(() => {
        // Ignore; async resume will retry if needed
      });
    }

    if (!unlockedAudioContexts.has(audioContext)) {
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        try {
          source.disconnect();
        } catch {
          // ignore
        }
      };
      source.start(0);
      unlockedAudioContexts.add(audioContext);
    }
  } catch (e) {
    console.warn('AudioContext unlock attempt warning:', e);
  }
};

/**
 * Ensures an AudioContext is actively running, handling both 'suspended' and iOS Safari 'interrupted' states.
 */
export const ensureAudioContextRunning = async (audioContext: AudioContext): Promise<AudioContext> => {
  unlockAudioContext(audioContext);
  const state = audioContext.state as string;
  if (state === 'suspended' || state === 'interrupted') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.warn('Failed to resume AudioContext:', e);
    }
  }
  return audioContext;
};

/**
 * Cross-browser decodeAudioData supporting modern Promise and legacy Safari callback patterns.
 * Rejects cleanly on empty/zero-length buffers.
 */
export const decodeAudioDataCompat = (audioContext: BaseAudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const copy = arrayBuffer.slice(0);
    let settled = false;

    const finishResolve = (decoded: AudioBuffer) => {
      if (settled) return;
      settled = true;
      if (!decoded || decoded.length === 0) {
        reject(new Error('Decoded audio buffer is empty'));
        return;
      }
      resolve(decoded);
    };

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err || 'decodeAudioData failed')));
    };

    try {
      const result = audioContext.decodeAudioData(copy, finishResolve, finishReject);
      if (result && typeof result.then === 'function') {
        result.then(finishResolve).catch(finishReject);
      }
    } catch (err) {
      finishReject(err);
    }
  });
};

// Helper to fetch/read a blob and decode it to an AudioBuffer
export const blobToAudioBuffer = async (audioContext: BaseAudioContext, blobOrUrl: Blob | string): Promise<AudioBuffer> => {
  let arrayBuffer: ArrayBuffer;

  if (typeof blobOrUrl !== 'string') {
    arrayBuffer = await blobOrUrl.arrayBuffer();
  } else if (blobCache.has(blobOrUrl)) {
    const cachedBlob = blobCache.get(blobOrUrl)!;
    arrayBuffer = await cachedBlob.arrayBuffer();
  } else {
    try {
      const response = await fetch(blobOrUrl);
      const blob = await response.blob();
      arrayBuffer = await blob.arrayBuffer();
    } catch {
      // Fallback via XMLHttpRequest for strict CSP environments where fetch('blob:') is blocked
      arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', blobOrUrl);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 0) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Failed to load audio: status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error loading audio blob'));
        xhr.send();
      });
    }
  }

  return decodeAudioDataCompat(audioContext, arrayBuffer);
};

// Helper to encode an AudioBuffer to a WAV Blob
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels: Float32Array[] = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset] ?? 0));
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([view], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

/**
 * Directly encodes captured channel Float32Array chunks into a standard 16-bit PCM WAV Blob.
 * Supports mono (1 array of chunks) or stereo (2 arrays of chunks).
 */
export const encodeFloat32ChunksToWav = (
  channelChunks: Float32Array[][],
  totalFrames: number,
  sampleRate: number
): Blob => {
  const numChannels = channelChunks.length;
  const dataBytes = totalFrames * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  let pos = 0;
  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952); // "RIFF"
  setUint32(36 + dataBytes);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numChannels);
  setUint32(Math.round(sampleRate));
  setUint32(Math.round(sampleRate) * numChannels * 2);
  setUint16(numChannels * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(dataBytes);

  // Merge each channel sequentially first to simplify interleaving
  const mergedChannels = channelChunks.map((chunks) => {
    const merged = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = totalFrames - offset;
      if (remaining <= 0) break;
      if (chunk.length <= remaining) {
        merged.set(chunk, offset);
        offset += chunk.length;
      } else {
        merged.set(chunk.subarray(0, remaining), offset);
        offset += remaining;
      }
    }
    return merged;
  });

  for (let frame = 0; frame < totalFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, mergedChannels[ch][frame] ?? 0));
      const int16 = (clamped < 0 ? clamped * 32768 : clamped * 32767) | 0;
      view.setInt16(pos, int16, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Robust file downloader that works reliably across:
 * - Older Android phones (Chrome, Samsung Internet, Android WebView, Firefox)
 * - iOS Safari & iPadOS
 * - Desktop browsers
 */
export const saveBlobAsFile = async (blob: Blob, fileName: string): Promise<boolean> => {
  const safeFileName = fileName.trim() || 'recording.wav';
  const finalName = safeFileName.endsWith('.wav') ? safeFileName : `${safeFileName}.wav`;

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = url;
    anchor.download = finalName;
    anchor.rel = 'noopener';
    if (!isIOSDevice()) {
      anchor.target = '_blank';
    }
    document.body.appendChild(anchor);

    if (typeof anchor.click === 'function') {
      anchor.click();
    } else {
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      anchor.dispatchEvent(evt);
    }

    setTimeout(() => {
      try {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      } catch {
        // ignore
      }
    }, 1000);

    // Keep object URL alive for 60 seconds so Android DownloadManager & iOS Downloads can finish
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 60000);

    return true;
  } catch (error) {
    console.warn('Blob URL download failed, trying Data URL fallback:', error);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const anchor = document.createElement('a');
      anchor.style.display = 'none';
      anchor.href = dataUrl;
      anchor.download = finalName;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      }, 1000);
      return true;
    } catch (fallbackError) {
      console.error('All download methods failed:', fallbackError);
      return false;
    }
  }
};

// Synchronously creates an impulse response buffer for reverb
export const createImpulseResponseSync = (
  audioContext: BaseAudioContext,
  duration = 4,
  decay = 2.0
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  const impulseL = impulse.getChannelData(0);
  const impulseR = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = length - i;
    impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
  }
  return impulse;
};

export const createImpulseResponse = async (
  audioContext: BaseAudioContext,
  duration = 4,
  decay = 2.0
): Promise<AudioBuffer> => {
  return createImpulseResponseSync(audioContext, duration, decay);
};

// Helper to reverse an AudioBuffer
export const reverseAudioBuffer = (audioContext: BaseAudioContext, buffer: AudioBuffer): AudioBuffer => {
  const reversedBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = reversedBuffer.getChannelData(channel);

    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[inputData.length - 1 - i];
    }
  }
  return reversedBuffer;
};

// Check if device is iOS (iPhone/iPad/iPod)
export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
};

// Check if running on Safari / Apple WebKit
export const isSafariBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return isIOSDevice() || (/Safari/.test(ua) && !/Chrome|Chromium|Android|CriOS|FxiOS|EdgiOS/.test(ua));
};

// Select optimal MediaRecorder MIME type by platform
export const getSupportedRecorderMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  // On Apple / iOS WebKit, native MP4/AAC is far more reliable than WebM across Safari versions
  const candidateTypes = isSafariBrowser()
    ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'];

  for (const type of candidateTypes) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // ignore unsupported checks
    }
  }
  return '';
};