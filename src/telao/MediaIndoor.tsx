import { useState, useEffect } from 'react';
import SenhaChamada from './SenhaChamada';
import { useSSE } from '../shared/useSSE';
import { getApiUrl } from '../shared/apiConfig';
import { playNotificationSound } from '../shared/sounds';

export default function MediaIndoor() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [ultimaSenha, setUltimaSenha] = useState<any>(null);
  const [showMedia, setShowMedia] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [midias, setMidias] = useState<any[]>([]);
  const [activeMidiaIndex, setActiveMidiaIndex] = useState(0);
  const [config, setConfig] = useState<any>({});
  const [pessoasAguardando, setPessoasAguardando] = useState(0);
  const API_URL = getApiUrl();

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Erro ao buscar configs', err);
    }
  };

  const fetchMidias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/midias`);
      const data = await res.json();
      setMidias(data);
    } catch (err) {
      console.error('Erro ao buscar mídias', err);
    }
  };

  const fetchAguardando = async () => {
    try {
      const res = await fetch(`${API_URL}/api/senhas`);
      const data = await res.json();
      const aguardando = data.filter((s: any) => s.status === 'aguardando').length;
      setPessoasAguardando(aguardando);
    } catch (err) {}
  };

  useEffect(() => {
    fetchMidias();
    fetchConfig();
    fetchAguardando();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    // Refresh aguardando count periodically as well
    const queueTimer = setInterval(fetchAguardando, 30000);
    return () => {
      clearInterval(timer);
      clearInterval(queueTimer);
    };
  }, []);

  const { data: sseEvent } = useSSE(`${API_URL}/events`);

  const playBell = () => {
    try {
      const soundType = config.tipo_som || 'bell';
      const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
      playNotificationSound(soundType, config.volume_audio || 80, customUrl);
    } catch (err) {
      console.error('Erro ao tocar som', err);
    }
  };

  useEffect(() => {
    if (!sseEvent) return;

    if (sseEvent.event === 'NOVA_SENHA_CHAMADA') {
      const payload = sseEvent.data;
      setUltimaSenha(payload);
      setHistorico(prev => [payload, ...prev].slice(0, 5));
      playBell();
      fetchAguardando();
    } else if (sseEvent.event === 'NOVA_SENHA_EMITIDA') {
      fetchAguardando();
    } else if (sseEvent.event === 'SENHA_ESTORNADA') {
      setShowMedia(true);
      fetchAguardando();
      // sseEvent.data contém o ID da senha estornada
      setHistorico(prev => prev.filter(s => s.id !== sseEvent.data?.id));
    } else if (sseEvent.event === 'CONFIG_ATUALIZADA') {
      fetchConfig();
    } else if (sseEvent.event === 'SISTEMA_RESETADO') {
      setUltimaSenha(null);
      setHistorico([]);
      fetchAguardando();
    }
  }, [sseEvent]);

  const nextMedia = () => {
    if (midias.length > 0) {
      setActiveMidiaIndex((prev) => (prev + 1) % midias.length);
    }
  };

  // Handle Image timer (Videos handle themselves via onEnded)
  useEffect(() => {
    if (midias.length > 0 && showMedia) {
      const current = midias[activeMidiaIndex];
      if (current.tipo === 'imagem') {
        const timer = setTimeout(nextMedia, 10000); // 10s for images
        return () => clearTimeout(timer);
      }
    }
  }, [activeMidiaIndex, midias, showMedia]);

  useEffect(() => {
    // Atualiza o contador de aguardando imediatamente se vier no evento
    if (sseEvent?.aguardando_count !== undefined) {
      setPessoasAguardando(sseEvent.aguardando_count);
    } else if (novaSenhaEmitida?.aguardando_count !== undefined) {
      setPessoasAguardando(novaSenhaEmitida.aguardando_count);
    } else if (sseEvent || novaSenhaEmitida) {
      fetchAguardando();
    }
    
    if (sseEvent) {
      setUltimaSenha(sseEvent);
      setHistorico((prev) => {
        // Se já existe no histórico, move para o topo (repetição)
        const filtered = prev.filter(s => s.id !== sseEvent.id);
        return [sseEvent, ...filtered].slice(0, 5);
      });
      setShowMedia(false);
      
      // Return to media after 6 seconds (dá mais tempo para o cliente ver)
      const timer = setTimeout(() => setShowMedia(true), 6000);
      return () => clearTimeout(timer);
    }
  }, [sseEvent, novaSenhaEmitida]);

  const activeMidia = midias[activeMidiaIndex];

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden font-rajdhani text-ink">
      {/* Top Header Area */}
      <header className="h-20 bg-white border-b border-outline-variant/30 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          {config.logo_cliente ? (
            <img src={`${API_URL}${config.logo_cliente}`} className="h-12 object-contain" alt="Logo" />
          ) : (
            <div className="flex flex-col">
              <h1 className="font-oswald text-3xl font-bold text-primary leading-none uppercase tracking-tighter">ChamaAí</h1>
              <p className="font-rajdhani text-sm font-bold text-ink-secondary uppercase">Sistema de Gestão de Atendimento</p>
            </div>
          )}
          {config.logo_cliente && (
            <div className="border-l border-outline-variant/30 pl-4">
              <h1 className="font-oswald text-2xl font-bold text-ink-secondary leading-none uppercase tracking-tight">{config.nome_estabelecimento || 'ChamaAí'}</h1>
            </div>
          )}
        </div>
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-6 bg-blue-500/10 px-8 py-4 rounded-[2rem] border border-blue-500/20 shadow-lg shadow-blue-500/5">
            <span className="material-symbols-outlined text-blue-500 text-[3rem]">groups</span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-ink-secondary uppercase tracking-widest mb-1">Aguardando</span>
              <span className="text-5xl font-black text-blue-600">{pessoasAguardando}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-ink-secondary">
             <span className="material-symbols-outlined text-3xl">cloud_done</span>
             <div className="bg-success/10 text-success px-4 py-1 rounded-full text-xs font-bold uppercase border border-success/20 flex items-center gap-2">
               <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
               ONLINE
             </div>
          </div>
        </div>
      </header>

      {/* Main Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Media / Call Focus Area (78%) */}
        <div className="flex-[78] relative bg-[#041a14] overflow-hidden border-r border-outline-variant/20">
          <div className="h-full w-full">
            {activeMidia ? (
              <div className="h-full w-full animate-fade-in relative">
                {activeMidia.tipo === 'video' ? (
                  <video 
                    key={activeMidia.id}
                    src={`${API_URL}${activeMidia.caminho}`} 
                    className="w-full h-full object-contain"
                    autoPlay
                    muted
                    onEnded={nextMedia}
                  />
                ) : (
                  <img 
                    key={activeMidia.id}
                    src={`${API_URL}${activeMidia.caminho}`} 
                    alt={activeMidia.nome}
                    className="w-full h-full object-contain"
                  />
                )}
                

              </div>
            ) : (
              /* Background Branding when no media */
              <div className="h-full w-full flex flex-col items-center justify-center p-20">
                <div className="text-center">
                  {config.logo_cliente ? (
                    <img src={`${API_URL}${config.logo_cliente}`} className="h-40 object-contain mb-8 drop-shadow-2xl" alt="Logo" />
                  ) : (
                    <h2 className="font-oswald text-6xl font-bold text-white mb-6 uppercase tracking-widest drop-shadow-lg">
                      {config.nome_estabelecimento || 'ChamaAí'}
                    </h2>
                  )}
                  <p className="font-rajdhani text-3xl font-medium text-white/70 uppercase tracking-widest">
                    {config.logo_cliente ? (config.nome_estabelecimento || 'ChamaAí') : 'Sua Fila Digital'}
                  </p>
                </div>
              </div>
            )}


          </div>
        </div>

        {/* Sidebar History Area (28%) */}
        <div className="flex-[28] flex flex-col bg-surface shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-outline-variant/30">
          {/* Recent Calls Section */}
          <div className="p-8 flex-1 overflow-hidden">
            <div className="flex items-center gap-3 mb-8 border-b border-outline-variant/30 pb-4">
              <span className="material-symbols-outlined text-primary text-3xl font-bold">history</span>
              <h2 className="font-oswald text-2xl font-bold text-ink uppercase tracking-widest">Histórico</h2>
            </div>
            
            <div className="space-y-6">
              {historico.length > 0 ? (
                historico.slice(0, 5).map((senha, idx) => (
                  <div key={senha.id} className={`flex items-center justify-between p-6 bg-white rounded-[32px] border shadow-sm transition-all ${idx === 0 ? 'border-primary ring-4 ring-primary/10 bg-primary/5 scale-105 mb-10' : 'border-outline-variant opacity-70'}`}>
                    <div className="flex flex-col">
                      <span className="font-oswald text-[1.2rem] font-bold text-primary uppercase tracking-[0.2em] leading-none mb-2">
                        {config.rotulo_local ? `${config.rotulo_local} ` : 'LOCAL '}
                        {senha.guiche.replace(/guichê[:\s]*/gi, '').trim()}
                      </span>
                      <span className="font-barlow text-[5rem] font-black text-ink leading-none tracking-tighter">
                         {String(senha.numero).padStart(3, '0')}
                      </span>
                    </div>
                    
                    <div className="w-2 h-20 bg-primary/20 rounded-full"></div>
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
             <p className={`font-oswald text-2xl font-bold uppercase tracking-widest ${showMedia ? 'text-ink-secondary/40' : 'text-primary animate-pulse'}`}>
                {showMedia ? 'Aguardando chamada...' : 'Senha Chamada!'}
             </p>
          </div>
        </div>
      </div>

      {/* Bottom Footer Area */}
      {config.mostrar_rodape !== '0' && (
        <footer className="h-14 bg-white border-t border-outline-variant/30 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <p className="font-rajdhani text-sm font-bold text-ink-secondary/60 uppercase tracking-widest">
              {config.texto_rodape || 'ChamaAí - Atendimento de Segunda a Sexta, 8h às 18h'}
            </p>
          </div>
          <div className="font-oswald text-lg font-bold text-ink-secondary flex items-center gap-2">
            <span className="lowercase font-rajdhani">{currentTime.toLocaleDateString('pt-BR', { weekday: 'short' })}.</span>
            {currentTime.toLocaleDateString('pt-BR')} · {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </footer>
      )}
      {/* Fullscreen Call Overlay */}
      {!showMedia && ultimaSenha && (
        <div className="absolute inset-0 z-50">
          <SenhaChamada ultimaSenha={ultimaSenha} />
        </div>
      )}
    </div>
  );
}
