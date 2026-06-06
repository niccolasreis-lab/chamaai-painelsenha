// Gerador de sons de campainha usando Web Audio API (100% offline)

type SoundType = 'ding' | 'bell' | 'chime' | 'bip' | 'custom';

let contextInstance: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!contextInstance) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      contextInstance = new AudioContextClass();
    }
  }
  
  // Retoma o contexto se ele estiver suspenso (bloqueio do navegador / autoplay)
  if (contextInstance && contextInstance.state === 'suspended') {
    contextInstance.resume().catch((err) => console.warn('Não foi possível retomar o AudioContext:', err));
  }
  
  return contextInstance;
}

// Som 1: Ding clássico (agudo, curto)
function playDing(volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, ctx.currentTime); // Levemente reduzido de 1200Hz para tom menos estridente
  osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.3);
  
  // Volume seguro para evitar distorcer o DAC/alto-falante
  const safeVolume = volume * 0.7;
  gain.gain.setValueAtTime(safeVolume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  
  osc.connect(gain);
  gain.connect(compressor);
  compressor.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + 0.8);
}

// Som 2: Campainha dupla (ding dong)
function playBell(volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);

  const safeVolume = volume * 0.7;
  
  // Primeiro toque
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(800, ctx.currentTime); // Suavizado de 880Hz
  gain1.gain.setValueAtTime(safeVolume, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  
  osc1.connect(gain1);
  gain1.connect(compressor);
  osc1.start();
  osc1.stop(ctx.currentTime + 0.5);
  
  // Segundo toque (mais grave)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(600, ctx.currentTime + 0.3); // Suavizado de 660Hz
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.setValueAtTime(safeVolume, ctx.currentTime + 0.3);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
  
  osc2.connect(gain2);
  gain2.connect(compressor);
  osc2.start(ctx.currentTime + 0.3);
  osc2.stop(ctx.currentTime + 0.9);
}

// Som 3: Chime (acordes harmônicos)
function playChime(volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);

  const freqs = [523, 659, 784]; // C5, E5, G5
  const safeVolume = volume * 0.6; // Reduz volume geral da soma harmônica

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(safeVolume, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.6);
    
    osc.connect(gain);
    gain.connect(compressor);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.6);
  });
}

// Som 4: Bip eletrônico (curto)
function playBip(volume: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);

  const safeVolume = volume * 0.35; // Bips quadrados distorcem muito fácil, volume menor
  
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, ctx.currentTime + i * 0.2); // De 1000Hz para 900Hz
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(safeVolume, ctx.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.12);
    
    osc.connect(gain);
    gain.connect(compressor);
    osc.start(ctx.currentTime + i * 0.2);
    osc.stop(ctx.currentTime + i * 0.2 + 0.12);
  }
}

const customBufferCache = new Map<string, AudioBuffer>();

async function playCustomSound(volume: number, customUrl: string) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    let audioBuffer = customBufferCache.get(customUrl);
    
    if (!audioBuffer) {
      let arrayBuffer: ArrayBuffer;
      if (customUrl.startsWith('data:')) {
        const base64Data = customUrl.split(',')[1] || customUrl;
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else {
        const response = await fetch(customUrl);
        arrayBuffer = await response.arrayBuffer();
      }
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      customBufferCache.set(customUrl, audioBuffer);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume * 0.75, ctx.currentTime);

    const compressor = ctx.createDynamicsCompressor();

    source.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(ctx.destination);

    source.start(0);
  } catch (err) {
    console.error('Erro ao tocar som personalizado via Web Audio API:', err);
    playBell(volume); // Fallback
  }
}

export async function preLoadCustomAudio(customUrl: string) {
  if (!customUrl) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  if (customBufferCache.has(customUrl)) return;
  
  try {
    let arrayBuffer: ArrayBuffer;
    if (customUrl.startsWith('data:')) {
      const base64Data = customUrl.split(',')[1] || customUrl;
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      const response = await fetch(customUrl);
      arrayBuffer = await response.arrayBuffer();
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    customBufferCache.set(customUrl, audioBuffer);
  } catch (err) {
    console.warn('[SOUNDS] Falha ao pré-carregar som personalizado:', err);
  }
}

export const SOUND_OPTIONS = [
  { id: 'ding', label: 'Ding Clássico' },
  { id: 'bell', label: 'Campainha (Ding Dong)' },
  { id: 'chime', label: 'Chime Harmônico' },
  { id: 'bip', label: 'Bip Eletrônico' },
  { id: 'custom', label: 'Som Personalizado' },
] as const;

export function playNotificationSound(type: SoundType, volume: number, customUrl?: string) {
  const vol = Math.max(0, Math.min(1, volume / 100));
  
  switch (type) {
    case 'ding':
      playDing(vol);
      break;
    case 'bell':
      playBell(vol);
      break;
    case 'chime':
      playChime(vol);
      break;
    case 'bip':
      playBip(vol);
      break;
    case 'custom':
      if (customUrl) {
        playCustomSound(vol, customUrl);
      } else {
        playBell(vol); // fallback
      }
      break;
    default:
      playBell(vol);
  }
}
