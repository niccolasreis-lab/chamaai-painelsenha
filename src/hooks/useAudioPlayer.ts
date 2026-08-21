import { useCallback, useEffect, useState } from 'react';
import type { PlaybackResult } from '../telao/audioCallFlow';

let globalAudioContext: AudioContext | null = null;
const audioBuffers = new Map<string, AudioBuffer>();
const audioBufferAccess = new Map<string, number>();
const stateChangeListeners = new Set<(state: AudioContextState) => void>();
const MAX_DECODED_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_DECODED_AUDIO_ENTRIES = 128;

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

function getCachedBuffer(key: string): AudioBuffer | undefined {
  const buffer = audioBuffers.get(key);
  if (buffer) audioBufferAccess.set(key, Date.now());
  return buffer;
}

function putCachedBuffer(key: string, buffer: AudioBuffer): void {
  audioBuffers.set(key, buffer);
  audioBufferAccess.set(key, Date.now());
  let usedBytes = Array.from(audioBuffers.values()).reduce((sum, item) => sum + bufferBytes(item), 0);
  const evictionOrder = Array.from(audioBufferAccess.entries()).sort((a, b) => a[1] - b[1]);
  for (const [candidate] of evictionOrder) {
    if (usedBytes <= MAX_DECODED_AUDIO_BYTES && audioBuffers.size <= MAX_DECODED_AUDIO_ENTRIES) break;
    if (candidate.startsWith('system:')) continue;
    const removed = audioBuffers.get(candidate);
    if (!removed) continue;
    audioBuffers.delete(candidate);
    audioBufferAccess.delete(candidate);
    usedBytes -= bufferBytes(removed);
  }
}

export function invalidateTtsAudioRevision(revision: string): void {
  const expected = `v=${encodeURIComponent(revision || 'initial')}`;
  for (const key of audioBuffers.keys()) {
    if (key.includes('/tts/') && !key.includes(expected)) {
      audioBuffers.delete(key);
      audioBufferAccess.delete(key);
    }
  }
}

function getAudioContext(): AudioContext | null {
  if (!globalAudioContext) {
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioContext = new AudioContextClass();
      globalAudioContext.addEventListener('statechange', () => {
        stateChangeListeners.forEach((listener) => listener(globalAudioContext!.state));
      });
    }
  }
  return globalAudioContext;
}

async function renderSystemSound(type: string): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = type === 'chime' ? 1.5 : type === 'bell' ? 1.2 : 0.8;
  const OfflineContext = window.OfflineAudioContext || (window as typeof window & {
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('OfflineAudioContext não é suportado.');

  const offlineCtx = new OfflineContext(1, Math.ceil(sampleRate * duration), sampleRate);
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.connect(offlineCtx.destination);

  const addTone = (
    frequency: number,
    start: number,
    end: number,
    volume: number,
    wave: OscillatorType = 'sine',
  ) => {
    const oscillator = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, 0);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    oscillator.connect(gain);
    gain.connect(compressor);
    oscillator.start(start);
    oscillator.stop(end);
    return { oscillator, gain };
  };

  if (type === 'ding') {
    const { oscillator } = addTone(1000, 0, 0.8, 0.7);
    oscillator.frequency.exponentialRampToValueAtTime(700, 0.3);
  } else if (type === 'bell') {
    addTone(800, 0, 0.5, 0.7);
    addTone(600, 0.3, 0.9, 0.7);
  } else if (type === 'chime') {
    [523, 659, 784].forEach((frequency, index) => {
      const start = index * 0.15;
      addTone(frequency, start, start + 0.6, 0.6);
    });
  } else if (type === 'bip') {
    for (let index = 0; index < 2; index += 1) {
      const start = index * 0.2;
      addTone(900, start, start + 0.12, 0.35, 'square');
    }
  } else {
    addTone(800, 0, 0.5, 0.7);
    addTone(600, 0.3, 0.9, 0.7);
  }

  return offlineCtx.startRendering();
}

type ActivePlayback = {
  id: number;
  source: AudioBufferSourceNode;
  resolve: (result: PlaybackResult) => void;
};

let activePlayback: ActivePlayback | null = null;
let currentPlaybackId = 0;

function interruptActivePlayback(): void {
  const playback = activePlayback;
  if (!playback) return;
  activePlayback = null;
  playback.source.onended = null;
  try {
    playback.source.stop();
  } catch {
    // A fonte pode já ter terminado entre a checagem e o stop.
  }
  playback.resolve('interrupted');
}

function beginPlaybackRequest(): number {
  currentPlaybackId += 1;
  interruptActivePlayback();
  return currentPlaybackId;
}

async function ensureReadyAudioContext(): Promise<AudioContext> {
  const ctx = getAudioContext();
  if (!ctx) throw new Error('AudioContext não é suportado neste dispositivo.');
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

async function decodeSource(ctx: AudioContext, source: string): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;
  if (source.startsWith('data:')) {
    const base64Data = source.split(',')[1] || source;
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    arrayBuffer = bytes.buffer;
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Falha ao carregar áudio (HTTP ${response.status}).`);
    arrayBuffer = await response.arrayBuffer();
  }
  return ctx.decodeAudioData(arrayBuffer);
}

function playBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  playbackId: number,
  volume = 0.75,
  outputScale = 0.75,
): Promise<PlaybackResult> {
  if (playbackId !== currentPlaybackId) return Promise.resolve('interrupted');

  return new Promise<PlaybackResult>((resolve, reject) => {
    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.setValueAtTime(volume * outputScale, ctx.currentTime);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      const finish = (result: PlaybackResult) => {
        if (activePlayback?.id === playbackId) activePlayback = null;
        resolve(result);
      };
      source.onended = () => {
        finish(playbackId === currentPlaybackId ? 'completed' : 'interrupted');
      };
      activePlayback = { id: playbackId, source, resolve: finish };
      source.start(0);
    } catch (error) {
      if (activePlayback?.id === playbackId) activePlayback = null;
      reject(error);
    }
  });
}

export function useAudioPlayer() {
  const [isInitialized, setIsInitialized] = useState(
    !!globalAudioContext && globalAudioContext.state !== 'suspended',
  );

  useEffect(() => {
    const listener = (state: AudioContextState) => setIsInitialized(state !== 'suspended');
    stateChangeListeners.add(listener);
    if (globalAudioContext) listener(globalAudioContext.state);
    return () => {
      stateChangeListeners.delete(listener);
    };
  }, []);

  const initAudioContext = useCallback(async (): Promise<void> => {
    try {
      await ensureReadyAudioContext();
      setIsInitialized(true);
    } catch (error) {
      console.warn('[AudioPlayer] Não foi possível inicializar o áudio:', error);
    }
  }, []);

  const stopAudio = useCallback((): void => {
    currentPlaybackId += 1;
    interruptActivePlayback();
  }, []);

  const preloadAudio = useCallback(async (key: string, source: string): Promise<void> => {
    if (audioBuffers.has(key)) return;
    try {
      const ctx = await ensureReadyAudioContext();
      putCachedBuffer(key, await decodeSource(ctx, source));
      setIsInitialized(true);
      console.log(`[AudioPlayer] Áudio carregado: ${key}`);
    } catch (error) {
      console.warn(`[AudioPlayer] Falha ao carregar: ${key}`, error);
    }
  }, []);

  const preloadSystemSound = useCallback(async (key: string, type: string): Promise<void> => {
    try {
      const cacheKey = `system:${type}`;
      let buffer = getCachedBuffer(cacheKey);
      if (!buffer) {
        buffer = await renderSystemSound(type);
        putCachedBuffer(cacheKey, buffer);
      }
      putCachedBuffer(key, buffer);
      console.log(`[AudioPlayer] Som de sistema carregado: ${type}`);
    } catch (error) {
      console.warn(`[AudioPlayer] Falha ao criar som de sistema: ${type}`, error);
    }
  }, []);

  const playAudio = useCallback(async (key: string, volume?: number): Promise<PlaybackResult> => {
    const playbackId = beginPlaybackRequest();
    const ctx = await ensureReadyAudioContext();
    setIsInitialized(true);
    const buffer = getCachedBuffer(key);
    if (!buffer) throw new Error(`Áudio não encontrado no cache: ${key}`);
    console.log(`[AudioPlayer] Reproduzindo cache: ${key}`);
    return playBuffer(ctx, buffer, playbackId, volume);
  }, []);

  const playSystemSound = useCallback(async (
    type: string,
    volume?: number,
  ): Promise<PlaybackResult> => {
    const playbackId = beginPlaybackRequest();
    const ctx = await ensureReadyAudioContext();
    setIsInitialized(true);
    const cacheKey = `system:${type}`;
    let buffer = getCachedBuffer(cacheKey);
    if (!buffer) {
      buffer = await renderSystemSound(type);
      putCachedBuffer(cacheKey, buffer);
    }
    if (playbackId !== currentPlaybackId) return 'interrupted';
    console.log(`[AudioPlayer] Reproduzindo som de sistema: ${type}`);
    // Os sons de sistema já carregam a mesma curva de ganho da campainha
    // original; não aplique novamente o redutor usado em arquivos externos.
    return playBuffer(ctx, buffer, playbackId, volume, 1);
  }, []);

  const playDynamicUrl = useCallback(async (
    url: string,
    volume?: number,
  ): Promise<PlaybackResult> => {
    const playbackId = beginPlaybackRequest();
    const ctx = await ensureReadyAudioContext();
    setIsInitialized(true);
    let buffer = getCachedBuffer(url);
    if (!buffer) {
      buffer = await decodeSource(ctx, url);
      putCachedBuffer(url, buffer);
    }
    if (playbackId !== currentPlaybackId) return 'interrupted';
    const safeSource = url.startsWith('data:')
      ? '[data-url omitida]'
      : new URL(url, window.location.href).pathname;
    console.log(`[AudioPlayer] Reproduzindo URL: ${safeSource}`);
    return playBuffer(ctx, buffer, playbackId, volume);
  }, []);

  return {
    initAudioContext,
    preloadAudio,
    preloadSystemSound,
    playAudio,
    playSystemSound,
    playDynamicUrl,
    stopAudio,
    isInitialized,
    audioBuffers,
  };
}
