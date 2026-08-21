
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import SenhaChamada from './SenhaChamada';
import EncartePrecos from './EncartePrecos';
import EncarteGranel from './EncarteGranel';
import TelaoEspera from './TelaoEspera';
import SmartMediaLayer from './SmartMediaLayer';
import { useSSE } from '../shared/useSSE';
import { getApiUrl, setServerIp } from '../shared/apiConfig';
import { invalidateTtsAudioRevision, useAudioPlayer } from '../hooks/useAudioPlayer';
import { VignetteAudioCoordinator } from './vignetteAudioCoordinator';
import { useTelaoAssetCache } from './useTelaoAssetCache';
import {
  isMediaAvailableForDisplay,
  readDisplayCache,
  writeDisplayCache,
  type EncarteDisplaySnapshot,
} from './displayCache';
import {
  buildSpeechText,
  createAudioCallPlan,
  executeAudioCall,
  type AudioCallPhase,
  type PlaybackResult,
} from './audioCallFlow';
import { ArrowLeft, Users, History, Ticket, Megaphone, Volume2, Clock, WifiOff } from 'lucide-react';
import type {
  ProdutoToledo,
  Categoria,
  TemaEncarte,
  EstablishmentConfig,
  PerfilTelao,
  MediaItem,
  RecentCall,
  SmartMediaSettings,
  VignetteOccurrence,
} from '../shared/types';

function haveSameModules(current: string[], next: string[]): boolean {
  return current.length === next.length && current.every((module, index) => module === next[index]);
}

async function falarSenha(
  texto: string,
  rate: number,
  pitch: number,
  vozGenero: string,
  isCurrent: () => boolean,
): Promise<PlaybackResult> {
  if (!('speechSynthesis' in window)) {
    throw new Error('speechSynthesis não é suportado neste dispositivo.');
  }

  const vozes = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const handleVoicesChanged = () => finish(window.speechSynthesis.getVoices());
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      resolve(voices);
    };
    const timeout = setTimeout(() => finish([]), 2000);
    const lista = window.speechSynthesis.getVoices();
    if (lista.length > 0) {
      finish(lista);
      return;
    }
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
  });

  if (!isCurrent()) return 'interrupted';

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(texto);

  let selectedVoice: SpeechSynthesisVoice | undefined;
  if (vozes.length > 0) {
    const ptVoices = vozes.filter((voice) => voice.lang.toLowerCase().startsWith('pt'));
    if (vozGenero === 'Masculina') {
      selectedVoice = ptVoices.find((voice) => /masculino|male|daniel|google de/i.test(voice.name));
    } else {
      selectedVoice = ptVoices.find((voice) => /feminina|female|maria|luciana/i.test(voice.name));
    }
    selectedVoice ||= ptVoices[0] || vozes[0];
  } else {
    console.warn('[TTS] Lista de vozes indisponível; usando a voz padrão do dispositivo.');
  }
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = 'pt-BR';
  utterance.rate = rate;
  utterance.pitch = pitch;

  return new Promise<PlaybackResult>((resolve, reject) => {
    utterance.onend = () => resolve('completed');
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') {
        resolve('interrupted');
        return;
      }
      reject(new Error(`Falha no sintetizador: ${event.error}`));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function logAudioPhase(
  callId: string | number,
  sequence: number,
  phase: AudioCallPhase | 'event_received',
  details: Record<string, unknown> = {},
): void {
  const safeDetails = Object.fromEntries(Object.entries(details).map(([key, value]) => {
    if (key === 'error') return [key, value instanceof Error ? value.message : String(value)];
    if (key === 'url' && typeof value === 'string') {
      if (value.startsWith('data:')) return [key, '[data-url omitida]'];
      try {
        return [key, new URL(value, window.location.href).pathname];
      } catch {
        return [key, '[url inválida]'];
      }
    }
    return [key, value];
  }));
  const payload = { callId, sequence, phase, ...safeDetails };
  if (phase.endsWith('_error')) console.error('[TELAO_AUDIO]', payload);
  else if (phase === 'call_interrupted') console.warn('[TELAO_AUDIO]', payload);
  else console.info('[TELAO_AUDIO]', payload);
}

type VignetteAudioRuntime = {
  apiUrl: string;
  volume: number;
  playDynamicUrl: (url: string, volume?: number) => Promise<PlaybackResult>;
  stopAudio: () => void;
};

function normalizeAudioVolume(value: unknown): number {
  const configuredVolume = Number(value ?? 80);
  return Number.isFinite(configuredVolume)
    ? Math.min(100, Math.max(0, configuredVolume)) / 100
    : 0.8;
}

export default function MediaIndoor() {
  const isDedicatedTelao = import.meta.env.VITE_APP_MODE === 'telao';
  const API_URL = getApiUrl();
  // Session / Pairing state
  const [telaoCode, setTelaoCode] = useState<string | null>(localStorage.getItem('telao_code'));
  const [perfil, setPerfil] = useState<PerfilTelao | null>(null);
  const parsedCategories = useMemo(() => (
    perfil?.encarte_categorias
      ? perfil.encarte_categorias.split(';').map((category: string) => category.trim()).filter(Boolean)
      : []
  ), [perfil?.encarte_categorias]);
  const [perfilLoading, setPerfilLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [serverAddress, setServerAddress] = useState(localStorage.getItem('server_ip_override') || '');
  const initFailureCountRef = useRef(0);

  const isLowPerformanceMode = 
    localStorage.getItem('telao_low_performance') === '1' || 
    new URLSearchParams(window.location.search).get('low_perf') === '1' ||
    new URLSearchParams(window.location.search).get('low_performance') === '1';

  // Active view state
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const activeModulesRef = useRef<string[]>([]);
  const [showingEncarte, setShowingEncarte] = useState(false);
  const [encarteRefreshKey, setEncarteRefreshKey] = useState(0);

  // Normal ticket and media state
  const [historico, setHistorico] = useState<RecentCall[]>([]);
  const [ultimaSenha, setUltimaSenha] = useState<RecentCall | null>(null);
  const [showMedia, setShowMedia] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [midias, setMidias] = useState<MediaItem[]>(() => (
    readDisplayCache<MediaItem[]>(API_URL, 'midias')?.data || []
  ));
  const [activeMidiaIndex, setActiveMidiaIndex] = useState(0);
  const [failedMidiaIds, setFailedMidiaIds] = useState<Set<string | number>>(() => new Set());
  const [config, setConfig] = useState<Partial<EstablishmentConfig>>({});
  const [smartMediaSettings, setSmartMediaSettings] = useState<SmartMediaSettings>({ midia_indoor_ativa: false, midia_indoor_layout: 'lateral' });
  const [pessoasAguardando, setPessoasAguardando] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRepeticao, setIsRepeticao] = useState(false);
  const repeticaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { resolve: resolveAssetUrl, sync: syncAssetCache } = useTelaoAssetCache(API_URL, telaoCode);
  const [encarteCache, setEncarteCache] = useState<{
    produtos: ProdutoToledo[];
    categorias: Categoria[];
    temaAtivo: TemaEncarte | null;
    loading: boolean;
    error: string | null;
    loadedAt: number | null;
  }>(() => {
    const cached = readDisplayCache<EncarteDisplaySnapshot>(API_URL, 'encarte');
    return {
      produtos: cached?.data.produtos || [],
      categorias: cached?.data.categorias || [],
      temaAtivo: cached?.data.temaAtivo || null,
      loading: false,
      error: null,
      loadedAt: cached?.savedAt || null,
    };
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const isMountedRef = useRef(true);
  const audioSequenceRef = useRef(0);
  const autoRecoverAttemptsRef = useRef(0);

  useEffect(() => {
    activeModulesRef.current = activeModules;
  }, [activeModules]);

  const refreshEncarteData = useCallback(async (reason: string) => {
    const modules = activeModulesRef.current;
    if (modules.length > 0 && !modules.includes('encarte')) {
      console.log(`[TELAO] Encarte desativado. Ignorando fetch (${reason}).`);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    console.log(`[TELAO] Buscando dados do Encarte. Motivo: ${reason}`);
    setEncarteCache(prev => ({ ...prev, loading: true }));

    try {
      const [prodRes, catRes, temaRes] = await Promise.all([
        fetch(`${API_URL}/api/toledo/produtos`, { signal: controller.signal }).then(r => {
          if (!r.ok) throw new Error('Falha ao buscar produtos');
          return r.json();
        }),
        fetch(`${API_URL}/api/categorias`, { signal: controller.signal }).then(r => {
          if (!r.ok) throw new Error('Falha ao buscar categorias');
          return r.json();
        }),
        fetch(`${API_URL}/api/telao/tema-atual`, { signal: controller.signal }).then(r => {
          if (!r.ok) return null;
          return r.json().catch(() => null);
        })
      ]);

      if (!isMountedRef.current) return;

      if (!Array.isArray(prodRes) || !Array.isArray(catRes) || prodRes.length === 0) {
        throw new Error('A origem do encarte retornou uma carga vazia ou inválida.');
      }

      const snapshot: EncarteDisplaySnapshot = {
        produtos: prodRes as ProdutoToledo[],
        categorias: catRes as Categoria[],
        temaAtivo: temaRes as TemaEncarte | null,
      };

      setEncarteCache({
        ...snapshot,
        loading: false,
        error: null,
        loadedAt: Date.now(),
      });
      writeDisplayCache(API_URL, 'encarte', snapshot);
      console.log(`[TELAO] Dados do encarte carregados com sucesso: ${prodRes.length} produtos.`);
    } catch (err: unknown) {
      const errorObj = err as Error;
      if (errorObj.name === 'AbortError') {
        if (abortControllerRef.current === controller && isMountedRef.current) {
          setEncarteCache(prev => ({
            ...prev,
            loading: false,
            error: 'Não foi possível atualizar o encarte agora.',
          }));
        }
        console.log('[TELAO] Fetch do encarte abortado por nova requisição.');
        return;
      }
      console.error('[TELAO] Erro ao carregar dados do Encarte:', err);
      if (!isMountedRef.current) return;
      setEncarteCache(prev => ({
        ...prev,
        loading: false,
        error: errorObj.message || 'Erro de rede',
      }));
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [API_URL]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const modulo_encarte = activeModules.includes('encarte');
    console.log("MODULO ENCARTES:", modulo_encarte);
    console.log("ENCARTE CACHE:", encarteCache?.produtos?.length);

    if (modulo_encarte && !encarteCache.loading && !encarteCache.error) {
      if (!encarteCache.loadedAt) {
        refreshEncarteData('Módulo encarte ativado no telão');
      } else if (!encarteCache.produtos?.length && autoRecoverAttemptsRef.current < 2) {
        autoRecoverAttemptsRef.current += 1;
        console.warn(`[TELAO] Encarte vazio no WebView — forçando refresh (tentativa ${autoRecoverAttemptsRef.current})`);
        refreshEncarteData("webview-auto-recover");
      }
    }
  }, [activeModules, encarteCache.loadedAt, encarteCache.loading, encarteCache.error, encarteCache.produtos, refreshEncarteData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const {
    initAudioContext,
    playDynamicUrl,
    stopAudio,
    isInitialized,
  } = useAudioPlayer();

  const vignetteRuntimeRef = useRef<VignetteAudioRuntime | null>(null);
  const vignetteCoordinatorRef = useRef<VignetteAudioCoordinator | null>(null);

  useEffect(() => {
    vignetteRuntimeRef.current = {
      apiUrl: API_URL,
      volume: normalizeAudioVolume(config.volume_audio),
      playDynamicUrl,
      stopAudio,
    };
  }, [API_URL, config.volume_audio, playDynamicUrl, stopAudio]);

  useEffect(() => {
    isMountedRef.current = true;
    const coordinator = new VignetteAudioCoordinator({
      playVignette: (occurrence) => {
        const runtime = vignetteRuntimeRef.current;
        if (!runtime) return Promise.resolve('interrupted');
        const baseUrl = runtime.apiUrl || window.location.origin;
        const absoluteUrl = new URL(occurrence.file_url, baseUrl).toString();
        return runtime.playDynamicUrl(absoluteUrl, runtime.volume);
      },
      interruptAudio: () => {
        vignetteRuntimeRef.current?.stopAudio();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      },
    });
    vignetteCoordinatorRef.current = coordinator;

    return () => {
      isMountedRef.current = false;
      audioSequenceRef.current += 1;
      coordinator.destroy();
      if (vignetteCoordinatorRef.current === coordinator) {
        vignetteCoordinatorRef.current = null;
      }
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle user interaction to unlock AudioContext
  useEffect(() => {
    const handleUserInteraction = () => {
      initAudioContext();
    };

    // Auto-inicializa o áudio se estiver rodando no Electron (telão passivo sem clique)
    const electronWindow = window as typeof window & {
      api?: { ping?: () => unknown };
    };
    const isElectron = typeof electronWindow.api?.ping === 'function';
    if (isElectron) {
      console.log('[TELAO] Electron detectado. Inicializando AudioContext automaticamente.');
      initAudioContext();
    }

    // Auto-inicializa o áudio se estiver rodando no APK Kiosk
    if ('AndroidKiosk' in window) {
      console.log('[TELAO] Kiosk Android detectado. Inicializando AudioContext automaticamente.');
      initAudioContext();
    }

    // Fallback: se após 2 segundos o AudioContext ainda estiver suspenso
    // (ex: tela passiva sem interação do usuário), força a inicialização
    const fallbackTimer = setTimeout(() => {
      console.log('[TELAO] Fallback: forçando inicialização do AudioContext após 2s.');
      initAudioContext();
    }, 2000);

    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    return () => {
      clearTimeout(fallbackTimer);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [initAudioContext]);

  // Initialize display session
  const initTelaoSession = async () => {
    try {
      const res = await fetch(`${API_URL}/api/telao/init`);
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      const data = await res.json();
      initFailureCountRef.current = 0;
      setConnectionError(false);
      localStorage.setItem('telao_code', data.code);
      setTelaoCode(data.code);
      setPerfilLoading(false);
    } catch (e) {
      console.error('Erro ao inicializar telão:', e);
      initFailureCountRef.current += 1;
      if (initFailureCountRef.current >= 2) {
        setConnectionError(true);
        setPerfilLoading(false);
      }
      setTimeout(initTelaoSession, 5000);
    }
  };

  // Fetch device pairing configuration profile
  const fetchPerfil = async (code: string) => {
    try {
      const res = await fetch(`${API_URL}/api/telao/profile/${code}`);
      if (res.ok) {
        const data = await res.json();
        setPerfil(data);
        
        // Resolve which modules are currently enabled
        const modules: string[] = [];
        if (data.modulo_painel) modules.push('painel');
        if (data.modulo_encarte) modules.push('encarte');
        if (data.modulo_midia) modules.push('midia');
        setActiveModules(previous => haveSameModules(previous, modules) ? previous : modules);
        setShowingEncarte(modules.includes('encarte') && !modules.includes('midia'));
      } else if (res.status === 404) {
        // DB got reset or this device got deleted/desvinculado
        localStorage.removeItem('telao_code');
        setTelaoCode(null);
        setPerfil(null);
        initTelaoSession();
      }
    } catch (e) {
      console.error('Erro ao buscar perfil do telão:', e);
    } finally {
      setPerfilLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (res.ok) {
        const data = await res.json();
        invalidateTtsAudioRevision(data.telao_tts_revision || 'initial');
        setConfig(data);
      }
    } catch (err) {
      console.error('Erro ao buscar configs', err);
    }
  };

  const fetchSmartMediaSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/media/settings`);
      if (res.ok) {
        setSmartMediaSettings(await res.json());
      }
    } catch (err) {
      console.error('[MediaIndoor] Erro ao buscar settings de mídia', err);
    }
  };

  const fetchMidias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/midias`);
      if (!res.ok) throw new Error(`Falha ao buscar mídias (${res.status})`);

      const data = await res.json();
      // Filtrar apenas mídias ativas e não expiradas para o Telão.
      const midiasAtivas = Array.isArray(data)
        ? (data as MediaItem[]).filter((m) => isMediaAvailableForDisplay(m))
        : [];
      writeDisplayCache(API_URL, 'midias', midiasAtivas);
        
      setMidias(prev => {
        const prevIds = prev.map(m => m.id).join(',');
        const newIds = midiasAtivas.map((m: MediaItem) => m.id).join(',');
          
        // Se a lista mudou, resetar o índice para evitar apontar para mídia inexistente
        if (prevIds !== newIds) {
          console.log(`[TELAO] Mídias atualizadas: ${prev.length} → ${midiasAtivas.length}`);
          setFailedMidiaIds(new Set());
          setActiveMidiaIndex(idx => {
            if (midiasAtivas.length === 0) return 0;
            // Clampa o índice ao novo tamanho
            return idx >= midiasAtivas.length ? 0 : idx;
          });
            
          // Se não há mais mídias e o encarte está ativo, forçar exibição do encarte
          if (midiasAtivas.length === 0 && activeModules.includes('encarte')) {
            setShowingEncarte(true);
          }

          // Parar o vídeo atual para não ficar preso com o src antigo
          if (videoRef.current) {
            try {
              videoRef.current.pause();
              videoRef.current.removeAttribute('src');
              videoRef.current.load();
            } catch {
              // ignore
            }
          }
        }

        return midiasAtivas;
      });
    } catch (err) {
      console.error('Erro ao buscar mídias', err);
    }
  };

  const fetchAguardando = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fila`);
      if (res.ok) {
        const data = await res.json();
        setPessoasAguardando(Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error('[MediaIndoor] Erro ao buscar fila', err);
    }
  };

  const fetchRecentCalls = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chamadas/recentes`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const seen = new Set<string>();
          const unique = (data as RecentCall[]).filter((s) => {
            const key = String(s.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setHistorico(unique.slice(0, 5));
          if (unique.length > 0) {
            setUltimaSenha(unique[0]);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de chamadas:', err);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const hoje = new Date().toDateString();
    const ultimaData = localStorage.getItem('chamaaai_ultima_data');

    if (ultimaData && ultimaData !== hoje) {
      localStorage.removeItem('chamaaai_ultima_data');
      setUltimaSenha(null);
      setHistorico([]);
    }
    localStorage.setItem('chamaaai_ultima_data', hoje);

    fetchConfig();
    fetchSmartMediaSettings();
    fetchMidias();
    fetchAguardando();
    fetchRecentCalls();

    if (telaoCode) {
      fetchPerfil(telaoCode);
    } else {
      initTelaoSession();
    }

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const queueTimer = setInterval(fetchAguardando, 30000);
    return () => {
      clearInterval(timer);
      clearInterval(queueTimer);
    };
  }, [telaoCode]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Connect only to paired screen SSE channel (which receives all pairing + queue events)
  const sseUrl = telaoCode ? `${API_URL}/api/telao/sse/${telaoCode}` : null;
  const { data: telaoSseEvent, connected: sseConnected } = useSSE(sseUrl);

  // Buscar perfil atualizado sempre que o telão se reconectar
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (sseConnected && telaoCode) {
      console.log('[TELAO] SSE reconectado. Sincronizando perfil e conteúdo...');
      fetchPerfil(telaoCode);
      fetchConfig();
      fetchSmartMediaSettings();
      fetchMidias();
      refreshEncarteData('SSE reconectado');
      window.dispatchEvent(new CustomEvent('MEDIA_CAMPAIGN_UPDATED'));
    }
  }, [sseConnected, telaoCode, refreshEncarteData]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  // O SSE entrega atualizações imediatas; esta revisão recupera eventos perdidos
  // durante suspensão da TV, troca de rede ou retomada do WebView.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!telaoCode) return;

    const contentRevalidationTimer = setInterval(() => {
      fetchPerfil(telaoCode);
      fetchConfig();
      fetchSmartMediaSettings();
      fetchMidias();
      refreshEncarteData('Revalidação periódica de 60s');
    }, 60_000);

    return () => clearInterval(contentRevalidationTimer);
  }, [telaoCode, activeModules, refreshEncarteData]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Watch unified SSE events (pairing events + queue/calling events) via window events
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const handleNovaSenhaChamada = (e: Event) => {
      const payload = (e as CustomEvent).detail as RecentCall;
      const sequence = ++audioSequenceRef.current;
      const plan = createAudioCallPlan(payload, config, API_URL);
      logAudioPhase(payload.id, sequence, 'event_received', {
        mode: plan.mode,
        repeat: payload.repeticao === true,
      });
      
      // PASSO 1: Atualizar o estado React imediatamente (agenda o re-render)
      setUltimaSenha(payload);
      setHistorico(prev => {
        const filtered = prev.filter(s => String(s.id) !== String(payload.id));
        return [payload, ...filtered].slice(0, 5);
      });
      setShowMedia(false);

      // Lógica de repetição
      if (payload.repeticao) {
        setIsRepeticao(true);
        if (repeticaoTimerRef.current) {
          clearTimeout(repeticaoTimerRef.current);
        }
        repeticaoTimerRef.current = setTimeout(() => {
          setIsRepeticao(false);
        }, 8000);
      } else {
        setIsRepeticao(false);
        if (repeticaoTimerRef.current) {
          clearTimeout(repeticaoTimerRef.current);
        }
      }

      // A chamada completa possui prioridade sobre qualquer vinheta.
      const coordinator = vignetteCoordinatorRef.current;
      if (!coordinator) {
        logAudioPhase(payload.id, sequence, 'call_error', {
          error: 'Coordenador de áudio indisponível.',
        });
      } else {
        void coordinator.startCall(async () => {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
          const isCurrent = () => (
            isMountedRef.current && audioSequenceRef.current === sequence
          );
          if (!isCurrent()) {
            logAudioPhase(payload.id, sequence, 'call_interrupted');
            return;
          }

          const volume = normalizeAudioVolume(config.volume_audio);
          const numericSetting = (
            value: string | null | undefined,
            fallback: number,
            minimum: number,
            maximum: number,
          ) => {
            const parsed = Number(value);
            return Number.isFinite(parsed)
              ? Math.min(maximum, Math.max(minimum, parsed))
              : fallback;
          };

          await executeAudioCall(plan, {
            isCurrent,
            playMp3: (url) => playDynamicUrl(url, volume),
            speak: () => falarSenha(
              buildSpeechText(payload, config),
              numericSetting(config.telao_tts_velocidade, 0.95, 0.1, 10),
              numericSetting(config.telao_tts_tom, 1, 0, 2),
              config.telao_tts_voz || 'Feminina',
              isCurrent,
            ),
            onPhase: (phase, details) => logAudioPhase(payload.id, sequence, phase, {
              ...details,
            }),
          });
        }).catch((error) => {
          logAudioPhase(payload.id, sequence, 'call_error', { error });
        });
      }
      fetchAguardando();
      
      const existingTimer = (window as unknown as { _mediaTimer?: ReturnType<typeof setTimeout> })._mediaTimer;
      if (existingTimer) clearTimeout(existingTimer);
      
      (window as unknown as { _mediaTimer?: ReturnType<typeof setTimeout> })._mediaTimer = setTimeout(() => {
        setShowMedia(true);
      }, 6000);
    };

    const handleVinhetaAgendada = (e: Event) => {
      const occurrence = (e as CustomEvent).detail as VignetteOccurrence | undefined;
      if (!occurrence
        || !Number.isInteger(occurrence.schedule_id)
        || typeof occurrence.file_url !== 'string'
        || typeof occurrence.scheduled_for !== 'string') {
        console.warn('[VINHETAS] Ocorrência SSE inválida ignorada.');
        return;
      }
      vignetteCoordinatorRef.current?.enqueue(occurrence);
    };

    const handleSenhaEstornada = (e: Event) => {
      const data = (e as CustomEvent).detail;
      fetchAguardando();
      const estornadaId = data?.id;
      setHistorico(prev => {
        const newHistory = prev.filter(s => s.id !== estornadaId);
        setUltimaSenha(currentActive => {
          if (currentActive && currentActive.id === estornadaId) {
            return newHistory.length > 0 ? newHistory[0] : null;
          }
          return currentActive;
        });
        return newHistory;
      });
      setUltimaSenha(currentActive => {
        if (currentActive && currentActive.id === estornadaId) {
          setIsRepeticao(false);
          if (repeticaoTimerRef.current) {
            clearTimeout(repeticaoTimerRef.current);
          }
        }
        return currentActive;
      });
    };

    const handleQueueUpdate = (e: Event) => {
      const data = (e as CustomEvent).detail;
      const { geral, preferencial } = data || {};
      setPessoasAguardando((geral || 0) + (preferencial || 0));
    };

    const handleConfigAtualizada = () => {
      autoRecoverAttemptsRef.current = 0;
      fetchConfig();
      void syncAssetCache();
      refreshEncarteData('SSE: CONFIG_ATUALIZADA');
    };

    const handleMediaSettingsUpdated = () => {
      autoRecoverAttemptsRef.current = 0;
      fetchSmartMediaSettings();
      refreshEncarteData('SSE: MEDIA_SETTINGS_UPDATED');
    };

    const handleMediaThemeUpdated = () => {
      autoRecoverAttemptsRef.current = 0;
      refreshEncarteData('SSE: MEDIA_THEME_UPDATED');
    };

    const handleMidiasAtualizadas = () => {
      fetchMidias();
      void syncAssetCache();
    };

    const handleToledoPrecosAtualizados = () => {
      autoRecoverAttemptsRef.current = 0;
      setEncarteRefreshKey(prev => prev + 1);
      refreshEncarteData('SSE: TOLEDO_PRECOS_ATUALIZADOS');
    };

    const handleSistemaResetado = () => {
      setUltimaSenha(null);
      setHistorico([]);
      setShowMedia(true);
      setIsRepeticao(false);
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
      fetchAguardando();
    };

    const handleTelaoVinculado = (e: Event) => {
      const data = (e as CustomEvent).detail;
      setPerfil(data);
      
      const modules: string[] = [];
      if (data.modulo_painel) modules.push('painel');
      if (data.modulo_encarte) modules.push('encarte');
      if (data.modulo_midia) modules.push('midia');
      setActiveModules(previous => haveSameModules(previous, modules) ? previous : modules);
      setShowingEncarte(modules.includes('encarte') && !modules.includes('midia'));
    };

    const handleTelaoDesvinculado = () => {
      localStorage.removeItem('telao_code');
      setTelaoCode(null);
      setPerfil(null);
      setActiveModules([]);
    };

    const handleDiaResetado = () => {
      setUltimaSenha(null);
      setHistorico([]);
      setShowMedia(true);
      setIsRepeticao(false);
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
      fetchAguardando();
      fetchRecentCalls();
      refreshEncarteData('SSE: DIA_RESETADO');
      console.log('[ChamaAí] Dia resetado — estado recarregado via Window Event');
    };

    const handleRecarregarPagina = () => {
      window.location.reload();
    };

    window.addEventListener('NOVA_SENHA_CHAMADA', handleNovaSenhaChamada);
    window.addEventListener('VINHETA_AGENDADA', handleVinhetaAgendada);
    window.addEventListener('SENHA_ESTORNADA', handleSenhaEstornada);
    window.addEventListener('queue-update', handleQueueUpdate);
    window.addEventListener('CONFIG_ATUALIZADA', handleConfigAtualizada);
    window.addEventListener('MEDIA_SETTINGS_UPDATED', handleMediaSettingsUpdated);
    window.addEventListener('MEDIA_THEME_UPDATED', handleMediaThemeUpdated);
    window.addEventListener('MIDIAS_ATUALIZADAS', handleMidiasAtualizadas);
    window.addEventListener('TOLEDO_PRECOS_ATUALIZADOS', handleToledoPrecosAtualizados);
    window.addEventListener('SISTEMA_RESETADO', handleSistemaResetado);
    window.addEventListener('TELAO_VINCULADO', handleTelaoVinculado);
    window.addEventListener('TELAO_ATUALIZADO', handleTelaoVinculado);
    window.addEventListener('TELAO_DESVINCULADO', handleTelaoDesvinculado);
    window.addEventListener('DIA_RESETADO', handleDiaResetado);
    window.addEventListener('RECARREGAR_PAGINA', handleRecarregarPagina);

    return () => {
      window.removeEventListener('NOVA_SENHA_CHAMADA', handleNovaSenhaChamada);
      window.removeEventListener('VINHETA_AGENDADA', handleVinhetaAgendada);
      window.removeEventListener('SENHA_ESTORNADA', handleSenhaEstornada);
      window.removeEventListener('queue-update', handleQueueUpdate);
      window.removeEventListener('CONFIG_ATUALIZADA', handleConfigAtualizada);
      window.removeEventListener('MEDIA_SETTINGS_UPDATED', handleMediaSettingsUpdated);
      window.removeEventListener('MEDIA_THEME_UPDATED', handleMediaThemeUpdated);
      window.removeEventListener('MIDIAS_ATUALIZADAS', handleMidiasAtualizadas);
      window.removeEventListener('TOLEDO_PRECOS_ATUALIZADOS', handleToledoPrecosAtualizados);
      window.removeEventListener('SISTEMA_RESETADO', handleSistemaResetado);
      window.removeEventListener('TELAO_VINCULADO', handleTelaoVinculado);
      window.removeEventListener('TELAO_ATUALIZADO', handleTelaoVinculado);
      window.removeEventListener('TELAO_DESVINCULADO', handleTelaoDesvinculado);
      window.removeEventListener('DIA_RESETADO', handleDiaResetado);
      window.removeEventListener('RECARREGAR_PAGINA', handleRecarregarPagina);
    };
  }, [API_URL, config, playDynamicUrl, refreshEncarteData, syncAssetCache]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Rotate between media and active modules
  const nextMedia = useCallback(() => {
    if (activeModules.includes('midia') && midias.length > 0) {
      const nextIndex = (activeMidiaIndex + 1) % midias.length;
      const encartePos = Math.max(0, Math.min(parseInt(String(config.toledo_encarte_posicao ?? '0'), 10) || 0, midias.length - 1));
      
      if (activeModules.includes('encarte') && !showingEncarte && activeMidiaIndex === encartePos) {
        setShowingEncarte(true);
        return;
      }
      
      setActiveMidiaIndex(nextIndex);
    } else if (activeModules.includes('encarte') && !showingEncarte) {
      setShowingEncarte(true);
    }
  }, [midias.length, activeMidiaIndex, activeModules, showingEncarte, config.toledo_encarte_posicao]);

  const handleNativeMediaError = useCallback((mediaId: string | number, error: unknown) => {
    console.error('[MEDIA ERROR] Arquivo inválido ou indisponível. Pulando...', error);
    setFailedMidiaIds(previous => {
      const next = new Set(previous);
      next.add(mediaId);
      return next;
    });
    nextMedia();
  }, [nextMedia]);

  const onEncarteComplete = useCallback(() => {
    setShowingEncarte(false);
    if (midias.length > 0) {
      setActiveMidiaIndex(prev => (prev + 1) % midias.length);
    }
    // If multiple modules, we alternate Encarte and Midia
    if (activeModules.includes('midia') && activeModules.includes('encarte')) {
      // Completed encarte slide, now switch to midia carousel
    }
  }, [midias.length, activeModules]);

  // Handle transition timers
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (smartMediaSettings.midia_indoor_ativa) return;
    if (midias.length > 0 && showMedia && !showingEncarte && activeModules.includes('midia')) {
      const current = midias[activeMidiaIndex];
      if (!current) {
        // Índice inválido após remoção de mídia — resetar
        setActiveMidiaIndex(0);
        return;
      }
      if (current.tipo === 'imagem') {
        const timer = setTimeout(nextMedia, 10000);
        return () => clearTimeout(timer);
      } else if (current.tipo === 'video') {
        // Fallback watchdog case the video completely freezes and onEnded never fires
        const watchdogTimer = setTimeout(() => {
          console.warn('[MEDIA WATCHDOG] Vídeo não completou no tempo esperado. Avançando...');
          nextMedia();
        }, 120000); // 2 minutos máximo por vídeo
        return () => clearTimeout(watchdogTimer);
      }
    } else if ((midias.length === 0 || !activeModules.includes('midia')) && activeModules.includes('encarte') && !showingEncarte && showMedia) {
      const timer = setTimeout(() => setShowingEncarte(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeMidiaIndex, midias, showMedia, showingEncarte, activeModules, nextMedia, smartMediaSettings.midia_indoor_ativa]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Ensure video element reloads and plays when src changes or when recovering from senha overlay
  useEffect(() => {
    if (smartMediaSettings.midia_indoor_ativa) {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {
          // ignore
        }
      }
      return;
    }
    const currentMidia = midias[activeMidiaIndex];
    if (showMedia && currentMidia && currentMidia.tipo === 'video' && videoRef.current) {
      // We do not call load() blindly because it resets the video if it's the same src.
      // But we always ensure it's playing if showMedia is true.
      videoRef.current.play().catch(e => console.warn('Autoplay bloqueado pelo navegador:', e));
    }
  }, [midias, activeMidiaIndex, showMedia, smartMediaSettings.midia_indoor_ativa]);

  // Apply real-time consolidated waiting count
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (telaoSseEvent?.data?.aguardando_count !== undefined) {
      setPessoasAguardando(telaoSseEvent.data.aguardando_count);
    }
  }, [telaoSseEvent]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (connectionError && !telaoCode) {
    return (
      <main className="h-screen w-screen bg-[#041a14] text-white flex items-center justify-center p-[5vw] font-sans">
        <section className="w-full max-w-3xl text-center">
          <WifiOff className="h-16 w-16 mx-auto text-amber-300" aria-hidden="true" />
          <h1 className="mt-8 text-4xl md:text-5xl font-bold tracking-[-0.03em]">Conecte este telão ao servidor</h1>
          <p className="mt-4 text-xl text-emerald-50/80">Informe o IP do computador onde o ChamaAí está aberto. Exemplo: 192.168.1.50</p>
          <form
            className="mt-10 flex flex-col sm:flex-row gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const normalized = serverAddress.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '');
              if (normalized) setServerIp(normalized);
            }}
          >
            <label className="sr-only" htmlFor="server-address">IP do servidor</label>
            <input
              id="server-address"
              autoFocus
              inputMode="decimal"
              value={serverAddress}
              onChange={(event) => setServerAddress(event.target.value)}
              placeholder="192.168.1.50"
              className="min-h-16 flex-1 rounded-xl bg-white text-slate-950 px-6 text-2xl outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
            />
            <button type="submit" className="min-h-16 rounded-xl bg-emerald-400 px-8 text-xl font-bold text-emerald-950 outline-none focus-visible:ring-4 focus-visible:ring-white active:bg-emerald-300">
              Conectar
            </button>
          </form>
          <p className="mt-6 text-base text-emerald-50/60">Servidor esperado: porta 3001. O telão tentará reconectar automaticamente.</p>
        </section>
      </main>
    );
  }

  if (perfilLoading) {
    return (
      <div className="h-screen w-screen bg-[#041a14] flex flex-col items-center justify-center text-white font-sans uppercase tracking-[0.2em] text-sm gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-emerald-400 animate-spin"></div>
        <span>Carregando interface...</span>
      </div>
    );
  }

  // Not paired -> Show wait waiting screen
  if (!perfil || perfil.status !== 'vinculado') {
    return <TelaoEspera code={telaoCode || ''} />;
  }

  const activeMidiaCandidate = midias[activeMidiaIndex];
  const activeMidia = activeMidiaCandidate && !failedMidiaIds.has(activeMidiaCandidate.id)
    ? activeMidiaCandidate
    : undefined;
  const showingPriceEncarte = activeModules.includes('encarte') && showingEncarte;
  
  const isSmartMediaFull = smartMediaSettings.midia_indoor_ativa && smartMediaSettings.midia_indoor_layout === 'full';
  const shouldShowNativeContent = !isSmartMediaFull;

  // A composição antiga por dispositivo foi removida. O posicionamento da
  // mídia agora possui uma única fonte: Configurações > Mídia Indoor.
  const layout: string = 'classic';

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden font-sans text-ink relative">
      <header className="h-32 bg-white border-b border-outline-variant/30 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          {!isDedicatedTelao && <Link
            to="/" 
            onClick={() => localStorage.removeItem('app_mode')}
            className="p-2 mr-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center outline-none" 
            title="Voltar ao Menu Principal"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>}
          {config.logo_cliente ? (
            <img src={resolveAssetUrl(config.logo_cliente)} className="h-20 object-contain" alt="Logo" />
          ) : (
            <div className="flex flex-col">
              <h1 className="font-sans text-3xl font-bold text-primary leading-none uppercase tracking-tighter">ChamaAí</h1>
              <p className="font-sans text-sm font-bold text-ink-secondary uppercase">Sistema de Gestão de Atendimento</p>
            </div>
          )}
          {config.logo_cliente && (
            <div className="border-l border-outline-variant/30 pl-4">
              <h1 className="font-sans text-2xl font-bold text-ink-secondary leading-none uppercase tracking-tight">{config.nome_estabelecimento || 'ChamaAí'}</h1>
            </div>
          )}
        </div>
        <div className="flex items-center gap-8">
          {/* Active paired screen indicator */}
          <div className="hidden lg:flex items-center gap-2 bg-[#041a14]/5 border border-emerald-500/10 px-4 py-2 rounded-2xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-ink-secondary uppercase tracking-widest leading-none">{perfil.nome}</span>
          </div>

          {/* Aguardando Badge */}
          <div className="flex items-center gap-6 bg-blue-500/5 px-8 py-3 rounded-3xl">
            <Users className="text-blue-500 h-14 w-14" />
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-ink-secondary uppercase tracking-[0.2em] mb-1">Aguardando</span>
              <span className="font-sans text-[4.5rem] font-black tracking-tighter text-blue-600 leading-none">{pessoasAguardando}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Intelligent Layout Wrapper */}
      <div className={`flex-1 flex overflow-hidden relative ${smartMediaSettings.midia_indoor_ativa && smartMediaSettings.midia_indoor_layout === 'rodape' ? 'flex-col' : 'flex-row'}`}>
      
        {smartMediaSettings.midia_indoor_ativa && (smartMediaSettings.midia_indoor_layout === 'background' || smartMediaSettings.midia_indoor_layout === 'full') && (
          <SmartMediaLayer 
            layout={smartMediaSettings.midia_indoor_layout} 
            isCalling={!showMedia} 
            onNext={nextMedia} 
            encarteProdutos={encarteCache.produtos}
            encarteCategorias={encarteCache.categorias}
            encarteTemaAtivo={encarteCache.temaAtivo}
            encarteLoading={encarteCache.loading}
            encarteError={encarteCache.error}
            lowPerformanceMode={isLowPerformanceMode}
            assetUrlResolver={resolveAssetUrl}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden relative z-10">
          {/* Main Body Area */}
          <div className="flex-1 flex overflow-hidden relative">
        {layout === 'l-shape' ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#041a14]">
            <div className="flex-1 flex overflow-hidden">
              {/* Media Area (Centralizada) */}
              <div className="flex-[72] relative bg-[#041a14] overflow-hidden flex items-center justify-center border-r border-outline-variant/10">
                <div className="h-full w-full">
                  {shouldShowNativeContent && showingPriceEncarte ? (
                    config.toledo_encarte_estilo === 'granel' ? (
                      <EncarteGranel
                        key={`encarte-granel-${encarteRefreshKey}`}
                        duracao={parseInt(String(config.toledo_encarte_duracao ?? '15'), 10)}
                        itensPorSlide={parseInt(String(config.toledo_itens_por_slide ?? '12'), 10)}
                        onComplete={onEncarteComplete}
                        config={config}
                        categoriasFiltro={parsedCategories}
                        produtos={encarteCache.produtos}
                        categorias={encarteCache.categorias}
                        temaAtivo={encarteCache.temaAtivo}
                        loading={encarteCache.loading}
                        error={encarteCache.error}
                        lowPerformanceMode={isLowPerformanceMode}
                      />
                    ) : (
                      <EncartePrecos
                        key={`encarte-${encarteRefreshKey}`}
                        duracao={parseInt(String(config.toledo_encarte_duracao ?? '15'), 10)}
                        itensPorSlide={parseInt(String(config.toledo_itens_por_slide ?? '12'), 10)}
                        onComplete={onEncarteComplete}
                        config={config}
                        categoriasFiltro={parsedCategories}
                        produtos={encarteCache.produtos}
                        categorias={encarteCache.categorias}
                        temaAtivo={encarteCache.temaAtivo}
                        loading={encarteCache.loading}
                        error={encarteCache.error}
                        lowPerformanceMode={isLowPerformanceMode}
                      />
                    )
                  ) : shouldShowNativeContent && activeModules.includes('midia') && activeMidia ? (
                    <div className="h-full w-full animate-fade-in relative">
                      {activeMidia.tipo === 'video' ? (
                        <video 
                          ref={videoRef}
                          src={resolveAssetUrl(activeMidia.caminho)}
                          className="w-full h-full object-cover"
                          autoPlay
                          muted
                          loop={midias.length === 1 && !activeModules.includes('encarte')}
                          onEnded={nextMedia}
                          onPause={(e) => {
                            const video = e.target as HTMLVideoElement;
                            if (!video.ended && showMedia) {
                              video.play().catch(() => {});
                            }
                          }}
                          onError={(e) => {
                            handleNativeMediaError(activeMidia.id, e);
                          }}
                          playsInline
                          preload="auto"
                        />
                      ) : (
                        <img 
                          key={activeMidia.id}
                          src={resolveAssetUrl(activeMidia.caminho)}
                          alt={activeMidia.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            handleNativeMediaError(activeMidia.id, e);
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center p-20">
                      <div className="text-center">
                        {config.logo_cliente ? (
                          <img src={resolveAssetUrl(config.logo_cliente)} className="h-40 object-contain mb-8 drop-shadow-2xl" alt="Logo" />
                        ) : (
                          <h2 className="font-sans text-6xl font-bold text-white mb-6 uppercase tracking-widest drop-shadow-lg">
                            {config.nome_estabelecimento || 'ChamaAí'}
                          </h2>
                        )}
                        <p className="font-sans text-3xl font-medium text-white/70 uppercase tracking-widest">
                          {config.logo_cliente ? (config.nome_estabelecimento || 'ChamaAí') : 'Sua Fila Digital'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chamada no Canto (Last Called Ticket Card + Recent History) */}
              <div className="flex-[28] flex flex-col bg-surface shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-outline-variant/30 p-6 overflow-hidden">
                <div className="bg-primary/5 border-2 border-primary/20 rounded-[2rem] p-6 text-center shadow-sm mb-6">
                  <span className="text-xs font-bold text-primary uppercase tracking-[0.2em] block mb-2">Última Chamada</span>
                  {ultimaSenha ? (
                    <div>
                      <span className="font-sans text-[4.5rem] font-black tracking-tighter text-primary leading-none block">
                        {String(ultimaSenha.numero).padStart(3, '0')}
                        {isRepeticao && (
                          <span className="text-xs text-orange-400 font-medium ml-2">↩ repetida</span>
                        )}
                      </span>
                      {ultimaSenha.nome_cliente && (
                        <span className="font-sans text-lg font-medium text-ink-secondary/70 block mt-1 select-none">
                          {ultimaSenha.nome_cliente.trim()}
                        </span>
                      )}
                      <span className="font-sans text-2xl font-bold text-ink block mt-3 uppercase leading-none">
                        {ultimaSenha.guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
                      </span>
                      <span className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mt-2">
                        {ultimaSenha.balcao_nome || 'Balcão'}
                      </span>
                    </div>
                  ) : (
                    <div className="py-8 text-ink-secondary/30 font-bold uppercase tracking-widest text-sm">
                      Nenhuma Senha
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/30 pb-2">
                    <History className="text-primary h-5 w-5" />
                    <h3 className="font-sans text-sm font-bold text-ink uppercase tracking-widest">Histórico</h3>
                  </div>
                  
                  <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                    {historico.slice(1, 5).map(senha => (
                      <div key={senha.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-outline-variant/50 shadow-sm opacity-80">
                        <span className="font-sans text-2xl font-black text-ink">
                          {String(senha.numero).padStart(3, '0')}
                        </span>
                        <span className="font-sans text-sm font-bold text-ink-secondary uppercase">
                          {senha.guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
                        </span>
                      </div>
                    ))}
                    {historico.length <= 1 && (
                      <div className="py-8 text-center text-xs font-bold text-ink-secondary/20 uppercase tracking-widest">
                        Aguardando Chamada
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Ticker do L-Shape */}
            {config.telao_ticker_texto && (
              <div className="h-14 bg-ink text-white flex items-center justify-between shrink-0 relative overflow-hidden border-t border-white/10 z-10">
                <div className="flex-1 overflow-hidden relative h-full flex items-center">
                  <div 
                    className="whitespace-nowrap inline-block font-sans text-lg font-bold uppercase tracking-[0.1em] text-white/90"
                    style={{ animation: 'marquee 25s linear infinite' }}
                  >
                    <span className="text-primary mx-6">⚡</span>
                    {config.telao_ticker_texto}
                    <span className="text-primary mx-6">⚡</span>
                    {config.telao_ticker_texto}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Media / Call Focus Area */}
            <div className={`${layout === 'classic' ? 'flex-1' : 'flex-[78]'} relative bg-[#041a14] overflow-hidden border-r border-outline-variant/20`}>
              <div className="h-full w-full">
                {shouldShowNativeContent && showingPriceEncarte ? (
                  config.toledo_encarte_estilo === 'granel' ? (
                    <EncarteGranel
                      key={`encarte-granel-${encarteRefreshKey}`}
                      duracao={parseInt(String(config.toledo_encarte_duracao ?? '15'), 10)}
                      itensPorSlide={parseInt(String(config.toledo_itens_por_slide ?? '12'), 10)}
                      onComplete={onEncarteComplete}
                      config={config}
                      categoriasFiltro={parsedCategories}
                      produtos={encarteCache.produtos}
                      categorias={encarteCache.categorias}
                      temaAtivo={encarteCache.temaAtivo}
                      loading={encarteCache.loading}
                      error={encarteCache.error}
                      lowPerformanceMode={isLowPerformanceMode}
                    />
                  ) : (
                    <EncartePrecos
                      key={`encarte-${encarteRefreshKey}`}
                      duracao={parseInt(String(config.toledo_encarte_duracao ?? '15'), 10)}
                      itensPorSlide={parseInt(String(config.toledo_itens_por_slide ?? '12'), 10)}
                      onComplete={onEncarteComplete}
                      config={config}
                      categoriasFiltro={parsedCategories}
                      produtos={encarteCache.produtos}
                      categorias={encarteCache.categorias}
                      temaAtivo={encarteCache.temaAtivo}
                      loading={encarteCache.loading}
                      error={encarteCache.error}
                      lowPerformanceMode={isLowPerformanceMode}
                    />
                  )
                ) : shouldShowNativeContent && activeModules.includes('midia') && activeMidia ? (
                  <div className="h-full w-full animate-fade-in relative">
                    {activeMidia.tipo === 'video' ? (
                      <video 
                        ref={videoRef}
                        src={resolveAssetUrl(activeMidia.caminho)}
                        className="w-full h-full object-cover"
                        autoPlay
                        muted
                        loop={midias.length === 1 && !activeModules.includes('encarte')}
                        onEnded={nextMedia}
                        onPause={(e) => {
                          const video = e.target as HTMLVideoElement;
                          if (!video.ended && showMedia) {
                            video.play().catch(() => {});
                          }
                        }}
                        onError={(e) => {
                          handleNativeMediaError(activeMidia.id, e);
                        }}
                        playsInline
                        preload="auto"
                      />
                    ) : (
                      <img 
                        key={activeMidia.id}
                        src={resolveAssetUrl(activeMidia.caminho)}
                        alt={activeMidia.nome}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          handleNativeMediaError(activeMidia.id, e);
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center p-20">
                    <div className="text-center">
                      {config.logo_cliente ? (
                        <img src={resolveAssetUrl(config.logo_cliente)} className="h-40 object-contain mb-8 drop-shadow-2xl" alt="Logo" />
                      ) : (
                        <h2 className="font-sans text-6xl font-bold text-white mb-6 uppercase tracking-widest drop-shadow-lg">
                          {config.nome_estabelecimento || 'ChamaAí'}
                        </h2>
                      )}
                      <p className="font-sans text-3xl font-medium text-white/70 uppercase tracking-widest">
                        {config.logo_cliente ? (config.nome_estabelecimento || 'ChamaAí') : 'Sua Fila Digital'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar History Area */}
            {layout === 'sidebar' && activeModules.includes('painel') && (
              <div className="flex-[28] flex flex-col bg-surface shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-outline-variant/30">
                <div className="p-8 flex-1 overflow-hidden">
                  <div className="flex items-center gap-3 mb-8 border-b border-outline-variant/30 pb-4">
                    <History className="text-primary h-8 w-8" />
                    <h2 className="font-sans text-2xl font-bold text-ink uppercase tracking-widest">Histórico</h2>
                  </div>
                  
                  <div className="space-y-5">
                    {historico.length > 0 ? (
                      historico.slice(0, 5).map((senha, idx) => (
                        <div key={senha.id} className={`flex items-center gap-6 px-8 py-5 bg-white rounded-[2rem] border shadow-sm transition-all ${idx === 0 ? 'border-primary ring-4 ring-primary/10 bg-primary/5 scale-[1.03] mb-6' : 'border-outline-variant/50 opacity-60'}`}>
                          <span className={`font-sans text-[5.5rem] font-black leading-none tracking-tighter ${idx === 0 ? 'text-primary' : 'text-ink'}`}>
                            {String(senha.numero).padStart(3, '0')}
                            {idx === 0 && isRepeticao && (
                              <span className="text-xs text-orange-400 font-medium ml-2">↩ repetida</span>
                            )}
                          </span>
                          
                          <div className="w-[4px] h-16 bg-primary/20 rounded-full shrink-0"></div>

                          <div className="flex flex-col leading-tight">
                            {senha.nome_cliente && (
                              <span className="font-sans text-lg font-medium text-ink-secondary/70 mb-1 select-none">
                                {senha.nome_cliente.trim()}
                              </span>
                            )}
                            <span className="font-sans text-[1.3rem] font-bold text-ink-secondary uppercase tracking-widest">
                              {senha.balcao_nome || config.rotulo_local || 'Balcão'}
                            </span>
                            <span className="font-sans text-[2.5rem] font-bold text-ink uppercase leading-none">
                              {senha.guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20">
                        <Clock className="h-24 w-24 text-ink/50" />
                        <p className="text-sm font-bold uppercase tracking-[0.3em] mt-4">Aguardando Chamada</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto p-10 flex flex-col items-center text-center gap-6 border-t border-outline-variant/20">
                   <div className={`p-6 rounded-full flex items-center justify-center ${!showMedia ? 'bg-primary/10 text-primary' : 'bg-surface-variant text-ink-secondary/30'}`}>
                      {showMedia ? (
                         <Ticket className="h-16 w-16" />
                      ) : (
                         <Megaphone className="h-16 w-16 animate-bounce" />
                      )}
                   </div>
                   <p className={`font-sans text-2xl font-bold uppercase tracking-widest ${showMedia ? 'text-ink-secondary/40' : 'text-primary animate-pulse'}`}>
                      {showMedia ? 'Aguardando chamada...' : 'Senha Chamada!'}
                   </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Footer Area (Letreiro Digital) */}
      {layout !== 'l-shape' && config.mostrar_rodape !== '0' && (
        <footer className="h-14 bg-ink text-white flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div 
              className="whitespace-nowrap inline-block font-sans text-[1.1rem] font-bold uppercase tracking-[0.1em] text-white/90"
              style={{ animation: 'marquee 25s linear infinite' }}
            >
              <span className="text-primary mx-6">⚡</span>
              {config.texto_rodape || 'Aproveite nossas promoções exclusivas! • Peça já o seu cartão ChamaAí e ganhe 10% de desconto.'}
              <span className="text-primary mx-6">⚡</span>
              {config.texto_rodape || 'Aproveite nossas promoções exclusivas! • Peça já o seu cartão ChamaAí e ganhe 10% de desconto.'}
            </div>
          </div>
          <div className="font-sans text-lg font-bold shrink-0 flex items-center gap-2 bg-ink pl-8 pr-8 z-10 h-full border-l border-white/10 shadow-[-10px_0_15px_rgba(0,0,0,0.5)]">
            <span className="lowercase font-sans opacity-60">{currentTime.toLocaleDateString('pt-BR', { weekday: 'short' })}.</span>
            {currentTime.toLocaleDateString('pt-BR')} <span className="opacity-40 mx-1">•</span> {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </footer>
      )}
        </div>
        
        {smartMediaSettings.midia_indoor_ativa && (smartMediaSettings.midia_indoor_layout === 'lateral' || smartMediaSettings.midia_indoor_layout === 'rodape') && (
          <SmartMediaLayer 
            layout={smartMediaSettings.midia_indoor_layout} 
            isCalling={!showMedia} 
            onNext={nextMedia} 
            encarteProdutos={encarteCache.produtos}
            encarteCategorias={encarteCache.categorias}
            encarteTemaAtivo={encarteCache.temaAtivo}
            encarteLoading={encarteCache.loading}
            encarteError={encarteCache.error}
            lowPerformanceMode={isLowPerformanceMode}
            assetUrlResolver={resolveAssetUrl}
          />
        )}
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      
      {/* Fullscreen Call Overlay */}
      {!showMedia && ultimaSenha && (
        <div className="absolute inset-0 z-50">
          <SenhaChamada key={`call-${ultimaSenha.id}-${ultimaSenha.repeticao}`} ultimaSenha={ultimaSenha} config={config} />
        </div>
      )}

      {/* Activation Overlay */}
      {!isInitialized && (
        <div 
          onClick={initAudioContext}
          className="fixed bottom-6 right-6 z-[9999] bg-primary hover:bg-primary-hover text-white font-bold py-4 px-8 rounded-3xl shadow-2xl border border-white/20 flex items-center gap-3 cursor-pointer select-none transition-all active:scale-95"
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
            animation: 'totemGlow 2s infinite'
          }}
        >
          <Volume2 className="h-6 w-6" />
          <span className="font-sans text-sm uppercase tracking-widest leading-none">Clique para ativar áudio</span>
        </div>
      )}
    </div>
  );
}
