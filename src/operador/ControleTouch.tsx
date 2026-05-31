import { useState, useEffect } from 'react';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';

export default function ControleTouch() {
  const [fila, setFila] = useState<any[]>([]);
  const [senhaAtual, setSenhaAtual] = useState<any>(null);
  const [guiche, setGuiche] = useState('Guichê 1');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  // Novos estados para tolerância de falhas, rede e configurações
  const [connectionError, setConnectionError] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [tempGuiche, setTempGuiche] = useState('');
  const [autoBoot, setAutoBoot] = useState(localStorage.getItem('app_mode') === 'touch');

  const API_URL = getApiUrl();

  useEffect(() => {
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
  }, []);

  const refreshData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fila`);
      if (res.ok) {
        const data = await res.json();
        setFila(Array.isArray(data) ? data : []);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch (err) {
      setConnectionError(true);
    }
  };

  useEffect(() => {
    try {
      const savedGuiche = localStorage.getItem('myStationName') || 'Guichê 1';
      setGuiche(savedGuiche);
      setTempGuiche(savedGuiche);
    } catch (e) {}

    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sincronização em tempo real via SSE
  const { data: sseEvent, connected: sseConnected } = useSSE(`${API_URL}/events`);

  useEffect(() => {
    if (!sseEvent) return;

    if (sseEvent.event === 'NOVA_SENHA_EMITIDA' || sseEvent.event === 'NOVA_SENHA_CHAMADA') {
      refreshData();
    } else if (sseEvent.event === 'SISTEMA_RESETADO') {
      setSenhaAtual(null);
      setFila([]);
      refreshData();
    }
  }, [sseEvent]);

  // Se o SSE mudar de estado de desconectado para conectado, atualiza a fila
  useEffect(() => {
    if (sseConnected) {
      refreshData();
    }
  }, [sseConnected]);

  const handleSaveConfig = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    localStorage.setItem('myStationName', tempGuiche.trim() || 'Guichê 1');
    
    if (autoBoot) {
      localStorage.setItem('app_mode', 'touch');
    } else {
      localStorage.removeItem('app_mode');
    }
    
    setShowConfigModal(false);
    window.location.reload();
  };

  const handleExit = () => {
    localStorage.removeItem('app_mode');
    window.location.href = '#/';
  };

  const chamarProxima = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chamar-proxima`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operador_id: 1, 
          guiche: guiche
        })
      });
      if (res.ok) {
        const result = await res.json();
        setSenhaAtual(result.data);
        refreshData();
        if (navigator.vibrate) navigator.vibrate(80);
        setConnectionError(false);
      } else if (res.status === 404) {
        if (navigator.vibrate) navigator.vibrate([30, 30]);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch (err) {
      setConnectionError(true);
    }
  };

  const repetirChamada = async () => {
    if (!senhaAtual) return;
    try {
      const res = await fetch(`${API_URL}/api/chamadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senha_id: senhaAtual.id,
          operador_id: 1,
          guiche: guiche
        })
      });
      if (res.ok) {
        if (navigator.vibrate) navigator.vibrate(40);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch (err) {
      setConnectionError(true);
    }
  };

  const estornar = async () => {
    if (!senhaAtual) return;
    try {
      const res = await fetch(`${API_URL}/api/senhas/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id })
      });
      if (res.ok) {
        setSenhaAtual(null);
        refreshData();
        if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch (err) {
      setConnectionError(true);
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const normalCount = fila.filter(s => s.preferencial === 0).length;
  const prefCount = fila.filter(s => s.preferencial === 1).length;

  const renderConfigModal = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative animate-scale-in">
        <div>
          <h3 className="font-sans text-2xl font-black text-white uppercase tracking-wider mb-2">Configurar Terminal</h3>
          <p className="text-xs font-sans text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
            Ajuste a conexão e identificação deste tablet.
          </p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div>
            <label className="block font-bold tracking-widest text-slate-400 uppercase mb-2 text-xs ml-1">IP do Servidor (Telão)</label>
            <input 
              type="text" 
              value={tempIp}
              onChange={(e) => setTempIp(e.target.value)}
              placeholder="Ex: 192.168.1.100"
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 text-white font-bold text-lg placeholder:text-slate-700"
              autoFocus
            />
            <p className="text-[9px] text-slate-500 mt-2 font-bold uppercase tracking-wider leading-relaxed">
              Deixe em branco para rodar localmente neste dispositivo (Localhost).
            </p>
          </div>

          <div>
            <label className="block font-bold tracking-widest text-slate-400 uppercase mb-2 text-xs ml-1">Nome / Número do Guichê</label>
            <input 
              type="text" 
              value={tempGuiche}
              onChange={(e) => setTempGuiche(e.target.value)}
              placeholder="Ex: Guichê 1"
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 text-white font-bold text-lg placeholder:text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800/60 rounded-2xl p-4 mt-2">
            <input 
              type="checkbox" 
              id="autoBootCheck" 
              checked={autoBoot}
              onChange={(e) => setAutoBoot(e.target.checked)}
              className="w-6 h-6 rounded border-slate-850 text-blue-600 bg-slate-900 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="autoBootCheck" className="text-xs font-bold text-slate-300 uppercase tracking-wider cursor-pointer select-none">
              Inicialização Automática (Abrir direto aqui)
            </label>
          </div>
        </div>

        <div className="flex gap-4 mt-2">
          <button 
            type="button"
            onClick={() => setShowConfigModal(false)}
            className="flex-1 py-4 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-850 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all active:scale-95"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onClick={handleSaveConfig}
            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold uppercase tracking-widest text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/10"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );

  if (connectionError && !showConfigModal) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl flex flex-col items-center text-center animate-fade-in">
          <div className="w-24 h-24 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mb-8 border border-rose-500/20">
            <span className="material-symbols-outlined text-[4rem] animate-pulse">wifi_off</span>
          </div>
          <h2 className="font-sans text-3xl font-black text-white uppercase tracking-wider mb-2">Servidor Offline</h2>
          <p className="text-slate-400 font-semibold text-sm mb-6 uppercase tracking-wider leading-relaxed">
            Não foi possível estabelecer conexão com o servidor do painel.
          </p>
          
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 w-full text-left mb-8 flex flex-col gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">IP do Servidor</span>
              <span className="font-mono text-lg font-bold text-blue-400">
                {localStorage.getItem('server_ip_override') || 'localhost (Local)'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">URL da API</span>
              <span className="font-mono text-sm text-slate-500 break-all">{API_URL || 'Nenhuma'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <button 
              onClick={() => {
                setConnectionError(false);
                refreshData();
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sans text-lg font-bold uppercase tracking-widest py-5 rounded-2xl transition-all shadow-xl shadow-blue-900/10 active:scale-95 flex items-center justify-center gap-3"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
              Tentar Novamente
            </button>
            <button 
              onClick={() => setShowConfigModal(true)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 font-sans text-lg font-bold uppercase tracking-widest py-5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <span className="material-symbols-outlined text-xl">settings</span>
              Configurar IP
            </button>
          </div>
        </div>

        {showConfigModal && renderConfigModal()}
      </div>
    );
  }

  return (
    <div className="touch-container">
       {/* Left side: Current Ticket & Stats */}
       <div className="w-full md:flex-1 flex flex-col gap-4 md:gap-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-white rounded-3xl p-4 md:p-6 border border-slate-200 shadow-sm">
             <div className="flex items-center gap-3 md:gap-4">
                <span className="material-symbols-outlined text-blue-600 text-3xl md:text-5xl">storefront</span>
                <div>
                   <h1 className="font-sans text-xl md:text-3xl font-bold uppercase tracking-widest">{guiche}</h1>
                   <div className="flex items-center gap-1.5 mt-0.5 md:mt-1">
                      <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                      <span className={`font-bold tracking-widest text-[9px] md:text-xs uppercase ${sseConnected ? 'text-emerald-600' : 'text-rose-500'}`}>
                         {sseConnected ? 'Conectado' : 'Conectando...'}
                      </span>
                   </div>
                </div>
             </div>
             <div className="flex items-center gap-2">
                 {deferredPrompt && (
                   <button 
                     onClick={handleInstallClick}
                     className="w-10 h-10 md:w-14 md:h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
                     title="Instalar App"
                   >
                     <span className="material-symbols-outlined text-xl md:text-2xl">download</span>
                   </button>
                 )}
                 <button 
                   onClick={() => setShowConfigModal(true)} 
                   className="w-10 h-10 md:w-14 md:h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors"
                   title="Configurar Painel"
                 >
                    <span className="material-symbols-outlined text-xl md:text-2xl">settings</span>
                 </button>
                 <button 
                   onClick={handleExit} 
                   className="w-10 h-10 md:w-14 md:h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors"
                   title="Sair"
                 >
                    <span className="material-symbols-outlined text-xl md:text-2xl">close</span>
                 </button>
              </div>
          </div>

          {/* Current Ticket */}
          <div className="flex-1 min-h-[200px] sm:min-h-[280px] md:min-h-0 bg-white rounded-[40px] flex flex-col items-center justify-center p-6 relative overflow-hidden border-2 border-slate-200 shadow-xl">
             {senhaAtual ? (
                <>
                   <span className="text-slate-400 font-bold uppercase tracking-[0.3em] mb-2 md:mb-4 text-sm md:text-xl">Em Atendimento</span>
                   <span className="font-sans text-7xl sm:text-8xl md:text-[10rem] lg:text-[14rem] font-black text-blue-600 leading-none drop-shadow-md">
                     {String(senhaAtual.numero).padStart(3, '0')}
                   </span>
                   <span className={`mt-4 md:mt-8 px-4 py-1.5 md:px-8 md:py-3 rounded-full font-bold uppercase tracking-widest text-sm md:text-2xl ${senhaAtual.preferencial ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                     {senhaAtual.preferencial ? 'ATENDIMENTO PRIORITÁRIO' : 'ATENDIMENTO NORMAL'}
                   </span>
                </>
             ) : (
                <div className="flex flex-col items-center opacity-30 text-slate-500">
                   <span className="material-symbols-outlined text-5xl md:text-[8rem] mb-2 md:mb-6">chair</span>
                   <span className="font-sans text-lg md:text-4xl uppercase tracking-widest text-center">Nenhum atendimento</span>
                </div>
             )}
          </div>

          {/* Counters */}
          <div className="grid grid-cols-2 gap-4 md:gap-6 h-20 sm:h-32 shrink-0">
             <div className="bg-white rounded-3xl flex flex-col items-center justify-center border-b-4 border-blue-500 shadow-sm p-2">
                <span className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-800">{normalCount}</span>
                <span className="text-slate-500 font-bold tracking-widest uppercase text-[10px] md:text-sm mt-0.5 md:mt-1">Fila Geral</span>
             </div>
             <div className="bg-white rounded-3xl flex flex-col items-center justify-center border-b-4 border-amber-500 shadow-sm p-2">
                <span className="text-2xl sm:text-3xl md:text-5xl font-black text-amber-500">{prefCount}</span>
                <span className="text-slate-500 font-bold tracking-widest uppercase text-[10px] md:text-sm mt-0.5 md:mt-1">Fila Preferencial</span>
             </div>
          </div>
       </div>

        {/* Right side: Action Buttons */}
        <div className="w-full md:flex-1 flex flex-col gap-4 md:gap-6 shrink-0">
           <button 
              onClick={chamarProxima}
              className="h-32 sm:h-56 md:h-auto md:flex-[2] bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white active:scale-[0.98] rounded-[32px] md:rounded-[40px] flex flex-col items-center justify-center gap-2 md:gap-6 transition-all shadow-xl p-4"
           >
              <span className="material-symbols-outlined text-4xl sm:text-[5rem] md:text-[8rem]">campaign</span>
              <span className="font-sans text-3xl sm:text-5xl md:text-7xl font-black uppercase tracking-widest">Próximo</span>
           </button>
           
           <button 
              onClick={repetirChamada}
              className="h-20 sm:h-28 md:h-auto md:flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white active:scale-[0.98] rounded-[32px] md:rounded-[40px] flex items-center justify-center gap-3 md:gap-6 transition-all shadow-md p-4"
           >
              <span className="material-symbols-outlined text-2xl sm:text-4xl md:text-6xl">refresh</span>
              <span className="font-sans text-xl sm:text-3xl md:text-5xl font-bold uppercase tracking-widest">Repetir</span>
           </button>

           <button 
              onClick={estornar}
              className="h-16 sm:h-20 md:h-auto md:flex-[0.6] bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-[0.98] rounded-[32px] md:rounded-[40px] flex items-center justify-center gap-3 md:gap-6 transition-all border-2 border-amber-500/30 text-amber-600 shadow-sm p-4"
           >
              <span className="material-symbols-outlined text-xl sm:text-3xl md:text-5xl">undo</span>
              <span className="font-sans text-sm sm:text-2xl md:text-3xl font-bold uppercase tracking-widest">Devolver à Fila</span>
           </button>
        </div>

        {showConfigModal && renderConfigModal()}
    </div>
  );
}
