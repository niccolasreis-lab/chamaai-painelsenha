import { useState, useEffect } from 'react';

let globalAudioContext: AudioContext | null = null;
const audioBuffers = new Map<string, AudioBuffer>();
const stateChangeListeners = new Set<(state: AudioContextState) => void>();

function getAudioContext(): AudioContext | null {
  if (!globalAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioContext = new AudioContextClass();
      globalAudioContext.addEventListener('statechange', () => {
        stateChangeListeners.forEach(listener => listener(globalAudioContext!.state));
      });
      // Emite o estado inicial assim que criado
      setTimeout(() => {
        if (globalAudioContext) {
          stateChangeListeners.forEach(listener => listener(globalAudioContext!.state));
        }
      }, 0);
    }
  }
  return globalAudioContext;
}

async function renderSystemSound(type: string): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = type === 'chime' ? 1.5 : (type === 'bell' ? 1.2 : 0.8);
  const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    1,
    Math.ceil(sampleRate * duration),
    sampleRate
  );

  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.connect(offlineCtx.destination);

  if (type === 'ding') {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, 0);
    osc.frequency.exponentialRampToValueAtTime(700, 0.3);
    gain.gain.setValueAtTime(0.7, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.8);
    osc.connect(gain);
    gain.connect(compressor);
    osc.start(0);
    osc.stop(0.8);
  } else if (type === 'bell') {
    // Primeiro toque
    const osc1 = offlineCtx.createOscillator();
    const gain1 = offlineCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(800, 0);
    gain1.gain.setValueAtTime(0.7, 0);
    gain1.gain.exponentialRampToValueAtTime(0.001, 0.5);
    osc1.connect(gain1);
    gain1.connect(compressor);
    osc1.start(0);
    osc1.stop(0.5);
    
    // Segundo toque (mais grave)
    const osc2 = offlineCtx.createOscillator();
    const gain2 = offlineCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(600, 0.3);
    gain2.gain.setValueAtTime(0, 0);
    gain2.gain.setValueAtTime(0.7, 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, 0.9);
    osc2.connect(gain2);
    gain2.connect(compressor);
    osc2.start(0.3);
    osc2.stop(0.9);
  } else if (type === 'chime') {
    const freqs = [523, 659, 784];
    freqs.forEach((freq, i) => {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, i * 0.15);
      gain.gain.setValueAtTime(0, 0);
      gain.gain.setValueAtTime(0.6, i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, i * 0.15 + 0.6);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(i * 0.15);
      osc.stop(i * 0.15 + 0.6);
    });
  } else if (type === 'bip') {
    for (let i = 0; i < 2; i++) {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, i * 0.2);
      gain.gain.setValueAtTime(0, 0);
      gain.gain.setValueAtTime(0.35, i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, i * 0.2 + 0.12);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(i * 0.2);
      osc.stop(i * 0.2 + 0.12);
    }
  }

  return await offlineCtx.startRendering();
}

let activeSourceNode: AudioBufferSourceNode | null = null;

export function useAudioPlayer() {
  const [isInitialized, setIsInitialized] = useState<boolean>(
    !!globalAudioContext && globalAudioContext.state !== 'suspended'
  );

  useEffect(() => {
    const listener = (state: AudioContextState) => {
      setIsInitialized(state !== 'suspended');
    };
    stateChangeListeners.add(listener);
    if (globalAudioContext) {
      setIsInitialized(globalAudioContext.state !== 'suspended');
    }
    return () => {
      stateChangeListeners.delete(listener);
    };
  }, []);

  const initAudioContext = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        setIsInitialized(true);
        console.log('[AudioPlayer] AudioContext resumed.');
      }).catch(err => {
        console.warn('[AudioPlayer] Failed to resume AudioContext:', err);
      });
    } else {
      setIsInitialized(true);
    }
  };

  const preloadAudio = async (key: string, base64OrUrl: string): Promise<void> => {
    if (audioBuffers.has(key)) {
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state !== 'suspended') {
      setIsInitialized(true);
    }

    try {
      let arrayBuffer: ArrayBuffer;
      if (base64OrUrl.startsWith('data:')) {
        const base64Data = base64OrUrl.split(',')[1] || base64OrUrl;
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else {
        const response = await fetch(base64OrUrl);
        arrayBuffer = await response.arrayBuffer();
      }
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBuffers.set(key, audioBuffer);
      console.log(`[AudioPlayer] Loaded key: ${key}`);
    } catch (err) {
      console.warn(`[AudioPlayer] Error preloading key: ${key}`, err);
    }
  };

  const preloadSystemSound = async (key: string, type: string) => {
    if (audioBuffers.has(key)) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'suspended') {
      setIsInitialized(true);
    }
    try {
      const buffer = await renderSystemSound(type);
      audioBuffers.set(key, buffer);
      console.log(`[AudioPlayer] Loaded system sound: ${type} as key: ${key}`);
    } catch (err) {
      console.warn(`[AudioPlayer] Failed to load system sound: ${type}`, err);
    }
  };

  const playAudio = (key: string, volume?: number) => {
    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[AudioPlayer] AudioContext not initialized.');
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const buffer = audioBuffers.get(key);
    if (!buffer) {
      console.warn(`[AudioPlayer] Audio buffer for key "${key}" not found in cache.`);
      return;
    }

    // Cancel dynamic overlapping source nodes immediately
    if (activeSourceNode) {
      try {
        activeSourceNode.stop();
      } catch (e) {
        // Safe catch in case audio already stopped playing
      }
      activeSourceNode = null;
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      const scaleVolume = volume !== undefined ? volume : 0.75;
      // Reduz 25% do volume base para evitar clipping nas TVs
      gainNode.gain.setValueAtTime(scaleVolume * 0.75, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(0);
      activeSourceNode = source;
      console.log(`[AudioPlayer] Played key: ${key} (volume: ${scaleVolume})`);
    } catch (err) {
      console.error(`[AudioPlayer] Error playing key: ${key}`, err);
    }
  };

  return { initAudioContext, preloadAudio, preloadSystemSound, playAudio, isInitialized, audioBuffers };
}
