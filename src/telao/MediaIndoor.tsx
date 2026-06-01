import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import SenhaChamada from './SenhaChamada';
import EncartePrecos from './EncartePrecos';
import EncarteGranel from './EncarteGranel';
import TelaoEspera from './TelaoEspera';
import { useSSE } from '../shared/useSSE';
import { getApiUrl } from '../shared/apiConfig';
import { playNotificationSound } from '../shared/sounds';

export default function MediaIndoor() {
  // Session / Pairing state
  const [telaoCode, setTelaoCode] = useState<string | null>(localStorage.getItem('telao_code'));
  const [perfil, setPerfil] = useState<any>(null);
  const [perfilLoading, setPerfilLoading] = useState(true);

  // Active view state
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [showingEncarte, setShowingEncarte] = useState(false);
  const [encarteRefreshKey, setEncarteRefreshKey] = useState(0);

  // Normal ticket and media state
  const [historico, setHistorico] = useState<any[]>([]);
  const [ultimaSenha, setUltimaSenha] = useState<any>(null);
  const [showMedia, setShowMedia] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [midias, setMidias] = useState<any[]>([]);
  const [activeMidiaIndex, setActiveMidiaIndex] = useState(0);
  const [config, setConfig] = useState<any>({});
  const [pessoasAguardando, setPessoasAguardando] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  
  const API_URL = getApiUrl();

  // Initialize display session
  const initTelaoSession = async () => {
    try {
      const res = await fetch(`${API_URL}/api/telao/init`);
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('telao_code', data.code);
        setTelaoCode(data.code);
        setPerfilLoading(false);
      }
    } catch (e) {
      console.error('Erro ao inicializar telão:', e);
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
        setActiveModules(modules);
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
        setConfig(data);
      }
    } catch (err) {
      console.error('Erro ao buscar configs', err);
    }
  };

  const fetchMidias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/midias`);
      if (res.ok) {
        const data = await res.json();
        // Filtrar apenas mídias ativas e não expiradas para o Telão
        const midiasAtivas = Array.isArray(data) 
          ? data.filter((m: any) => m.ativo === 1 && m.status === 'ativo')
          : [];
        setMidias(midiasAtivas);
      }
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
    } catch (err) {}
  };

  const fetchRecentCalls = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chamadas/recentes`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistorico(data.slice(0, 5));
          if (data.length > 0) {
            setUltimaSenha(data[0]);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de chamadas:', err);
    }
  };

  // Run initializations
  useEffect(() => {
    fetchConfig();
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

  // Connect only to paired screen SSE channel (which receives all pairing + queue events)
  const sseUrl = telaoCode ? `${API_URL}/api/telao/sse/${telaoCode}` : null;
  const { data: telaoSseEvent } = useSSE(sseUrl);

  const playBell = () => {
    try {
      const soundType = config.tipo_som || 'bell';
      const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
      playNotificationSound(soundType, config.volume_audio || 80, customUrl);
    } catch (err) {
      console.error('Erro ao tocar som', err);
    }
  };

  // Watch unified SSE events (pairing events + queue/calling events)
  useEffect(() => {
    if (!telaoSseEvent) return;

    if (telaoSseEvent.event === 'NOVA_SENHA_CHAMADA') {
      const payload = telaoSseEvent.data;
      setUltimaSenha(payload);
      
      setHistorico(prev => {
        const filtered = prev.filter(s => s.id !== payload.id);
        return [payload, ...filtered].slice(0, 5);
      });
      
      playBell();
      fetchAguardando();
      
      // Focus called ticket in full screen
      setShowMedia(false);
      
      const existingTimer = (window as any)._mediaTimer;
      if (existingTimer) clearTimeout(existingTimer);
      
      (window as any)._mediaTimer = setTimeout(() => {
        setShowMedia(true);
      }, 6000);

    } else if (telaoSseEvent.event === 'NOVA_SENHA_EMITIDA' || telaoSseEvent.event === 'SENHA_ESTORNADA') {
      fetchAguardando();
      if (telaoSseEvent.event === 'SENHA_ESTORNADA') {
        setHistorico(prev => prev.filter(s => s.id !== telaoSseEvent.data?.id));
      }
    } else if (telaoSseEvent.event === 'queue-update') {
      const { geral, preferencial } = telaoSseEvent.data || {};
      setPessoasAguardando((geral || 0) + (preferencial || 0));
    } else if (telaoSseEvent.event === 'CONFIG_ATUALIZADA') {
      fetchConfig();
    } else if (telaoSseEvent.event === 'MIDIAS_ATUALIZADAS') {
      fetchMidias();
    } else if (telaoSseEvent.event === 'TOLEDO_PRECOS_ATUALIZADOS') {
      setEncarteRefreshKey(prev => prev + 1);
    } else if (telaoSseEvent.event === 'SISTEMA_RESETADO') {
      setUltimaSenha(null);
      setHistorico([]);
      setShowMedia(true);
      fetchAguardando();
    } else if (telaoSseEvent.event === 'TELAO_VINCULADO' || telaoSseEvent.event === 'TELAO_ATUALIZADO') {
      const data = telaoSseEvent.data;
      setPerfil(data);
      
      const modules: string[] = [];
      if (data.modulo_painel) modules.push('painel');
      if (data.modulo_encarte) modules.push('encarte');
      if (data.modulo_midia) modules.push('midia');
      setActiveModules(modules);
      setShowingEncarte(modules.includes('encarte') && !modules.includes('midia'));
    } else if (telaoSseEvent.event === 'TELAO_DESVINCULADO') {
      localStorage.removeItem('telao_code');
      setTelaoCode(null);
      setPerfil(null);
      setActiveModules([]);
    } else if (telaoSseEvent.event === 'RECARREGAR_PAGINA') {
      window.location.reload();
    }
  }, [telaoSseEvent]);

  // Rotate between media and active modules
  const nextMedia = useCallback(() => {
    if (midias.length > 0) {
      const nextIndex = (activeMidiaIndex + 1) % midias.length;
      const encartePos = parseInt(config.toledo_encarte_posicao || '0', 10);
      
      if (activeModules.includes('encarte') && !showingEncarte && activeMidiaIndex === encartePos) {
        setShowingEncarte(true);
        return;
      }
      
      setActiveMidiaIndex(nextIndex);
    } else if (activeModules.includes('encarte') && !showingEncarte) {
      setShowingEncarte(true);
    }
  }, [midias.length, activeMidiaIndex, activeModules, showingEncarte, config.toledo_encarte_posicao]);

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
  useEffect(() => {
    if (midias.length > 0 && showMedia && !showingEncarte && activeModules.includes('midia')) {
      const current = midias[activeMidiaIndex];
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
    } else if (midias.length === 0 && activeModules.includes('encarte') && !showingEncarte && showMedia) {
      const timer = setTimeout(() => setShowingEncarte(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeMidiaIndex, midias, showMedia, showingEncarte, activeModules, nextMedia]);

  // Ensure video element reloads and plays when src changes or when recovering from senha overlay
  useEffect(() => {
    const currentMidia = midias[activeMidiaIndex];
    if (showMedia && currentMidia && currentMidia.tipo === 'video' && videoRef.current) {
      // We do not call load() blindly because it resets the video if it's the same src.
      // But we always ensure it's playing if showMedia is true.
      videoRef.current.play().catch(e => console.warn('Autoplay bloqueado pelo navegador:', e));
    }
  }, [midias, activeMidiaIndex, showMedia]);

  // Apply real-time consolidated waiting count
  useEffect(() => {
    if (telaoSseEvent?.data?.aguardando_count !== undefined) {
      setPessoasAguardando(telaoSseEvent.data.aguardando_count);
    }
  }, [telaoSseEvent]);

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

  // Resolve filters for price list categories
  const parsedCategories = perfil.encarte_categorias
    ? perfil.encarte_categorias.split(';').map((c: string) => c.trim()).filter(Boolean)
    : [];

  const activeMidia = midias[activeMidiaIndex];

  // Resolve Toledo Config style overrides based on paired profile status
  const showingPriceEncarte = activeModules.includes('encarte') && showingEncarte;

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden font-sans text-ink">
      <header className="h-32 bg-white border-b border-outline-variant/30 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            to="/" 
            onClick={() => localStorage.removeItem('app_mode')}
            className="p-2 mr-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center outline-none" 
            title="Voltar ao Menu Principal"
          >
            <span className="material-symbols-outlined text-2xl font-bold">arrow_back</span>
          </Link>
          {config.logo_cliente ? (
            <img src={`${API_URL}${config.logo_cliente}`} className="h-20 object-contain" alt="Logo" />
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
            <span className="material-symbols-outlined text-blue-500 text-[3.5rem]">groups</span>
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-ink-secondary uppercase tracking-[0.2em] mb-1">Aguardando</span>
              <span className="font-sans text-[4.5rem] font-black tracking-tighter text-blue-600 leading-none">{pessoasAguardando}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Media / Call Focus Area (78%) */}
        <div className="flex-[78] relative bg-[#041a14] overflow-hidden border-r border-outline-variant/20">
          <div className="h-full w-full">
            {showingPriceEncarte ? (
              config.toledo_encarte_estilo === 'granel' ? (
                <EncarteGranel
                  key={`encarte-granel-${encarteRefreshKey}`}
                  duracao={parseInt(config.toledo_encarte_duracao || '15', 10)}
                  itensPorSlide={parseInt(config.toledo_itens_por_slide || '12', 10)}
                  onComplete={onEncarteComplete}
                  config={config}
                  categoriasFiltro={parsedCategories}
                />
              ) : (
                <EncartePrecos
                  key={`encarte-${encarteRefreshKey}`}
                  duracao={parseInt(config.toledo_encarte_duracao || '15', 10)}
                  itensPorSlide={parseInt(config.toledo_itens_por_slide || '12', 10)}
                  onComplete={onEncarteComplete}
                  config={config}
                  categoriasFiltro={parsedCategories}
                />
              )
            ) : activeModules.includes('midia') && activeMidia ? (
              <div className="h-full w-full animate-fade-in relative">
                {activeMidia.tipo === 'video' ? (
                  <video 
                    ref={videoRef}
                    src={`${API_URL}${activeMidia.caminho}`} 
                    className="w-full h-full object-contain"
                    autoPlay
                    muted
                    loop={midias.length === 1 && !activeModules.includes('encarte')}
                    onEnded={nextMedia}
                    onPause={(e) => {
                      // Se o vídeo for pausado pelo SO durante o toque da campainha e ainda não acabou
                      const video = e.target as HTMLVideoElement;
                      if (!video.ended && showMedia) {
                        console.warn('[MEDIA] Vídeo pausado inesperadamente (provavelmente ducking de áudio). Forçando play...');
                        video.play().catch(() => {});
                      }
                    }}
                    onError={(e) => {
                      console.error('[MEDIA ERROR] Erro na reprodução do vídeo. Pulando...', e);
                      nextMedia();
                    }}
                    playsInline
                    preload="auto"
                  />
                ) : (
                  <img 
                    key={activeMidia.id}
                    src={`${API_URL}${activeMidia.caminho}`} 
                    alt={activeMidia.nome}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error('[MEDIA ERROR] Erro ao carregar imagem. Pulando...', e);
                      nextMedia();
                    }}
                  />
                )}
              </div>
            ) : (
              /* Branding default screen if no other visual module is selected */
              <div className="h-full w-full flex flex-col items-center justify-center p-20">
                <div className="text-center">
                  {config.logo_cliente ? (
                    <img src={`${API_URL}${config.logo_cliente}`} className="h-40 object-contain mb-8 drop-shadow-2xl" alt="Logo" />
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

        {/* Sidebar History Area (28%) - Displayed only if painel module is active */}
        {activeModules.includes('painel') && (
          <div className="flex-[28] flex flex-col bg-surface shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-outline-variant/30">
            {/* Recent Calls Section */}
            <div className="p-8 flex-1 overflow-hidden">
              <div className="flex items-center gap-3 mb-8 border-b border-outline-variant/30 pb-4">
                <span className="material-symbols-outlined text-primary text-3xl font-bold">history</span>
                <h2 className="font-sans text-2xl font-bold text-ink uppercase tracking-widest">Histórico</h2>
              </div>
              
              <div className="space-y-5">
                {historico.length > 0 ? (
                  historico.slice(0, 5).map((senha, idx) => (
                    <div key={senha.id} className={`flex items-center gap-6 px-8 py-5 bg-white rounded-[2rem] border shadow-sm transition-all ${idx === 0 ? 'border-primary ring-4 ring-primary/10 bg-primary/5 scale-[1.03] mb-6' : 'border-outline-variant/50 opacity-60'}`}>
                      {/* Número da senha */}
                      <span className={`font-sans text-[5.5rem] font-black leading-none tracking-tighter ${idx === 0 ? 'text-primary' : 'text-ink'}`}>
                        {String(senha.numero).padStart(3, '0')}
                      </span>
                      
                      {/* Separador */}
                      <div className="w-[4px] h-16 bg-primary/20 rounded-full shrink-0"></div>

                      {/* Nome do setor */}
                      <div className="flex flex-col leading-tight">
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
                    <span className="material-symbols-outlined text-[6rem]">pending_actions</span>
                    <p className="text-sm font-bold uppercase tracking-[0.3em] mt-4">Aguardando Chamada</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Sidebar (Status) */}
            <div className="mt-auto p-10 flex flex-col items-center text-center gap-6 border-t border-outline-variant/20">
               <div className={`p-6 rounded-full ${!showMedia ? 'bg-primary/10 text-primary' : 'bg-surface-variant text-ink-secondary/30'}`}>
                  <span className="material-symbols-outlined text-[4rem]">
                     {showMedia ? 'confirmation_number' : 'campaign'}
                  </span>
               </div>
               <p className={`font-sans text-2xl font-bold uppercase tracking-widest ${showMedia ? 'text-ink-secondary/40' : 'text-primary animate-pulse'}`}>
                  {showMedia ? 'Aguardando chamada...' : 'Senha Chamada!'}
               </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Area (Letreiro Digital) */}
      {config.mostrar_rodape !== '0' && (
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
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      
      {/* Fullscreen Call Overlay (Only if ticket calling is enabled in profile modules) */}
      {!showMedia && ultimaSenha && activeModules.includes('painel') && (
        <div className="absolute inset-0 z-50">
          <SenhaChamada ultimaSenha={ultimaSenha} config={config} />
        </div>
      )}
    </div>
  );
}
