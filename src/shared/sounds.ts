// Gerador de sons de campainha usando Web Audio API (100% offline)

type SoundType = 'ding' | 'bell' | 'chime' | 'bip' | 'custom';

const audioCtx = () => new (window.AudioContext || (window as any).webkitAudioContext)();

// Som 1: Ding clássico (agudo, curto)
function playDing(volume: number) {
  const ctx = audioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
  
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.8);
}

// Som 2: Campainha dupla (ding dong)
function playBell(volume: number) {
  const ctx = audioCtx();
  
  // Primeiro toque
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, ctx.currentTime);
  gain1.gain.setValueAtTime(volume, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start();
  osc1.stop(ctx.currentTime + 0.5);
  
  // Segundo toque (mais grave)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.setValueAtTime(volume, ctx.currentTime + 0.3);
  gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(ctx.currentTime + 0.3);
  osc2.stop(ctx.currentTime + 0.9);
}

// Som 3: Chime (acordes harmônicos)
function playChime(volume: number) {
  const ctx = audioCtx();
  const freqs = [523, 659, 784]; // C5, E5, G5

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(volume * 0.8, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.6);
  });
}

// Som 4: Bip eletrônico (curto)
function playBip(volume: number) {
  const ctx = audioCtx();
  
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, ctx.currentTime + i * 0.2);
    gain.gain.setValueAtTime(volume * 0.5, ctx.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.2);
    osc.stop(ctx.currentTime + i * 0.2 + 0.1);
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
        const audio = new Audio(customUrl);
        audio.volume = vol;
        audio.play().catch(err => console.error('Erro ao tocar som personalizado', err));
      } else {
        playBell(vol); // fallback
      }
      break;
    default:
      playBell(vol);
  }
}
