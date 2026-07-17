import type { EstablishmentConfig, RecentCall, TelaoTtsMode } from '../shared/types';
import { normalizeTtsMode } from '../shared/ttsMode';

export type PlaybackResult = 'completed' | 'interrupted';

export type AudioCallOutcome =
  | 'chime_only'
  | 'mp3_completed'
  | 'synth_completed'
  | 'voice_unavailable'
  | 'interrupted';

export type AudioCallPhase =
  | 'chime_start'
  | 'chime_complete'
  | 'chime_error'
  | 'mp3_try'
  | 'mp3_complete'
  | 'mp3_error'
  | 'synth_fallback'
  | 'synth_start'
  | 'synth_complete'
  | 'synth_error'
  | 'call_complete'
  | 'call_error'
  | 'call_interrupted';

export type AudioCallPlan = {
  mode: TelaoTtsMode;
  mp3Candidates: string[];
};

type AudioCallExecutor = {
  playChime: () => Promise<PlaybackResult>;
  playMp3: (url: string) => Promise<PlaybackResult>;
  speak: () => Promise<PlaybackResult>;
  isCurrent: () => boolean;
  onPhase?: (phase: AudioCallPhase, details?: Record<string, unknown>) => void;
};

const DIGIT_WORDS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
] as const;

export function formatTicketForSpeech(prefix: string, number: string | number): string {
  const spokenPrefix = String(prefix || '')
    .trim()
    .split('')
    .filter(Boolean)
    .join(', ');
  const digitsOnly = String(number).replace(/\D/g, '').padStart(3, '0');
  const spokenNumber = digitsOnly
    .split('')
    .map((digit) => DIGIT_WORDS[Number(digit)])
    .join(' ');

  return [spokenPrefix, spokenNumber].filter(Boolean).join(', ');
}

export function buildSpeechText(
  payload: RecentCall,
  config: Partial<EstablishmentConfig>,
): string {
  const template = payload.nome_cliente && config.telao_tts_template_nome
    ? config.telao_tts_template_nome
    : (config.telao_tts_template || 'Senha {senha}, dirija-se ao {guiche}.');
  const defaultPrefix = payload.preferencial === 1 ? 'P' : 'A';
  const prefix = payload.prefixo_senha || defaultPrefix;
  const spokenTicket = formatTicketForSpeech(prefix, payload.numero);

  return template
    .replace(/\{senha\}/gi, spokenTicket)
    .replace(/\{nome\}/gi, payload.nome_cliente || '')
    .replace(/\{guiche\}/gi, payload.guiche || '')
    .replace(/\{balcao\}/gi, payload.balcao_nome || '')
    .replace(/\{local\}/gi, config.rotulo_local || 'Guichê');
}

export function buildMp3Candidates(
  apiUrl: string,
  number: string | number,
  isRepeat: boolean,
): string[] {
  const baseUrl = apiUrl.replace(/\/$/, '');
  const numericNumber = Number(number);
  const normalizedNumber = Number.isFinite(numericNumber) ? String(numericNumber) : String(number);
  const safeNumber = encodeURIComponent(normalizedNumber);

  if (isRepeat) {
    return [
      `${baseUrl}/tts/tipo2/Senha_${safeNumber}_2_chamada.mp3`,
      `${baseUrl}/tts/tipo2/Senha_${safeNumber}_2.mp3`,
      `${baseUrl}/tts/tipo1/Senha_${safeNumber}_1.mp3`,
    ];
  }

  return [
    `${baseUrl}/tts/tipo1/Senha_${safeNumber}_1.mp3`,
    `${baseUrl}/tts/tipo3/Senha_${safeNumber}_3.mp3`,
  ];
}

export function createAudioCallPlan(
  payload: RecentCall,
  config: Partial<EstablishmentConfig>,
  apiUrl: string,
): AudioCallPlan {
  const mode = normalizeTtsMode(config.telao_tts_modo);

  return {
    mode,
    mp3Candidates: mode === 'mp3' || mode === 'ambos'
      ? buildMp3Candidates(apiUrl, payload.numero, payload.repeticao === true)
      : [],
  };
}

export async function executeAudioCall(
  plan: AudioCallPlan,
  executor: AudioCallExecutor,
): Promise<AudioCallOutcome> {
  const emit = executor.onPhase || (() => undefined);
  const interrupted = () => !executor.isCurrent();
  const finishInterrupted = (): AudioCallOutcome => {
    emit('call_interrupted');
    return 'interrupted';
  };
  const finish = (outcome: AudioCallOutcome): AudioCallOutcome => {
    emit('call_complete', { outcome });
    return outcome;
  };

  emit('chime_start');
  try {
    const result = await executor.playChime();
    if (result === 'interrupted' || interrupted()) return finishInterrupted();
    emit('chime_complete');
  } catch (error) {
    if (interrupted()) return finishInterrupted();
    emit('chime_error', { error });
  }

  if (plan.mode === 'desativado') return finish('chime_only');

  if (plan.mode === 'mp3' || plan.mode === 'ambos') {
    for (const url of plan.mp3Candidates) {
      if (interrupted()) return finishInterrupted();
      emit('mp3_try', { url });
      try {
        const result = await executor.playMp3(url);
        if (result === 'interrupted' || interrupted()) return finishInterrupted();
        emit('mp3_complete', { url });
        return finish('mp3_completed');
      } catch (error) {
        if (interrupted()) return finishInterrupted();
        emit('mp3_error', { url, error });
      }
    }

    if (plan.mode === 'mp3') return finish('voice_unavailable');
    emit('synth_fallback');
  }

  if (interrupted()) return finishInterrupted();
  emit('synth_start');
  try {
    const result = await executor.speak();
    if (result === 'interrupted' || interrupted()) return finishInterrupted();
    emit('synth_complete');
    return finish('synth_completed');
  } catch (error) {
    if (interrupted()) return finishInterrupted();
    emit('synth_error', { error });
    return finish('voice_unavailable');
  }
}
