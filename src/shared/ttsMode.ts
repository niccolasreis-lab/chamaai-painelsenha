import type { TelaoTtsMode } from './types';

export const TELAO_TTS_MODES: readonly TelaoTtsMode[] = [
  'desativado',
  'sintetizador',
  'mp3',
  'ambos',
];

export function isTelaoTtsMode(value: unknown): value is TelaoTtsMode {
  return typeof value === 'string' && TELAO_TTS_MODES.includes(value as TelaoTtsMode);
}

export function normalizeTtsMode(value: unknown): TelaoTtsMode {
  return isTelaoTtsMode(value) ? value : 'desativado';
}
