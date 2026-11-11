// Helper to fetch a blob and decode it to an AudioBuffer
export const blobToAudioBuffer = async (audioContext: AudioContext, blobUrl: string): Promise<AudioBuffer> => {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
};

// Helper to encode an AudioBuffer to a WAV Blob
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
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

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  return new Blob([view], { type: "audio/wav" });

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
 * Robust file downloader that works reliably across:
 * - Older Android phones (Chrome, Samsung Internet, Android WebView, Firefox)
 * - iOS Safari & iPadOS
 * - Desktop browsers
 *
 * Avoids premature URL.revokeObjectURL which causes download failures on Android's async DownloadManager.
 * Falls back to Data URL if blob: URL downloads are restricted in in-app browsers or older WebViews.
 */
export const saveBlobAsFile = async (blob: Blob, fileName: string): Promise<boolean> => {
  const safeFileName = fileName.trim() || 'recording.wav';
  const finalName = safeFileName.endsWith('.wav') ? safeFileName : `${safeFileName}.wav`;

  try {
    // 1. Try Blob URL approach
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = url;
    anchor.download = finalName;
    anchor.rel = 'noopener';
    // Helps older Android WebViews not navigate away
    anchor.target = '_blank';
    document.body.appendChild(anchor);

    // Trigger click
    if (typeof anchor.click === 'function') {
      anchor.click();
    } else {
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      anchor.dispatchEvent(evt);
    }

    // Remove anchor element after short delay
    setTimeout(() => {
      try {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      } catch (e) {
        // ignore
      }
    }, 1000);

    // Keep object URL alive for 60 seconds so Android DownloadManager can finish fetching it!
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // ignore
      }
    }, 60000);

    return true;
  } catch (error) {
    console.warn("Blob URL download failed, trying Data URL fallback:", error);

    // 2. Fallback: Convert to Data URL (base64) for older Android WebViews
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
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      }, 1000);
      return true;
    } catch (fallbackError) {
      console.error("All download methods failed:", fallbackError);
      return false;
    }
  }
};

// Helper to programmatically create an impulse response for reverb
export const createImpulseResponse = async (
  audioContext: BaseAudioContext,
  duration = 4,
  decay = 2.0
): Promise<AudioBuffer> => {
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
    
    // Reverse the channel data
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[inputData.length - 1 - i];
    }
  }
  return reversedBuffer;
};