import { useState, useEffect } from 'react';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';

export default function MobileOperador() {
  const [fila, setFila] = useState<any[]>([]);
  const [senhaAtual, setSenhaAtual] = useState<any>(null);
  const [guiche, setGuiche] = useState(localStorage.getItem('mobile_guiche') || '1');
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [error, setError] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [config, setConfig] = useState<any>({});
  const API_URL = getApiUrl();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const fetchFila = async () => {
    try {
      setError(false);
      const res = await fetch(`${API_URL}/api/fila`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFila(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(true);
    }
  };
  
  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    const hoje = new Date().toDateString();
    const ultimaData = localStorage.getItem('chamaaai_ultima_data');

    if (ultimaData && ultimaData !== hoje) {
      localStorage.removeItem('chamaaai_ultima_data');
      setSenhaAtual(null);
      setFila([]);
    }
    localStorage.setItem('chamaaai_ultima_data', hoje);

    fetchFila();
    fetchConfig();
    const interval = setInterval(fetchFila, 10000);
    return () => clearInterval(interval);
  }, [API_URL]);

  const { data: sseEvent } = useSSE(`${API_URL}/events`);

  useEffect(() => {
    if (!sseEvent) return;
    if (sseEvent.event === 'NOVA_SENHA_EMITIDA' || sseEvent.event === 'NOVA_SENHA_CHAMADA') {
      fetchFila();
    } else if (sseEvent.event === 'SISTEMA_RESETADO') {
      setSenhaAtual(null);
      fetchFila();
    } else if (sseEvent.event === 'DIA_RESETADO') {
      setSenhaAtual(null);
      setFila([]);
      fetchFila();
      fetchConfig();
      console.log('[ChamaAí] Dia resetado — estado recarregado');
    }
  }, [sseEvent]);

  const handleSaveConfig = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    localStorage.setItem('mobile_guiche', guiche);
    window.location.reload();
  };

  const chamarProxima = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chamar-proxima`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operador_id: 1,
          guiche: `Balcão ${guiche}`
        })
      });
      if (res.ok) {
        const result = await res.json();
        setSenhaAtual(result.data);
        fetchFila();
        if (navigator.vibrate) navigator.vibrate(100);
      }
    } catch (err) {}
  };

  const repetirChamada = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/chamadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senha_id: senhaAtual.id,
          operador_id: 1,
          guiche: `Balcão ${guiche}`
        })
      });
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err) {}
  };

  const estornar = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/senhas/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id })
      });
      setSenhaAtual(null);
      fetchFila();
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    } catch (err) {}
  };

  const concluirAtendimento = async () => {
    if (!senhaAtual) return;
    try {
      const res = await fetch(`${API_URL}/api/senhas/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche: `Balcão ${guiche}` })
      });
      if (res.ok) {
        setSenhaAtual(null);
        fetchFila();
        if (navigator.vibrate) navigator.vibrate(50);
      }
    } catch (err) {}
  };

  const naoCompareceu = async () => {
    if (!senhaAtual) return;
    try {
      const res = await fetch(`${API_URL}/api/senhas/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche: `Balcão ${guiche}` })
      });
      if (res.ok) {
        setSenhaAtual(null);
        fetchFila();
        if (navigator.vibrate) navigator.vibrate(50);
      }
    } catch (err) {}
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

  if (error || showConfig) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-blue-500 text-4xl">settings_remote</span>
            </div>
            <h2 className="text-3xl font-sans font-bold uppercase tracking-widest">Configuração Mobile</h2>
            <p className="text-slate-400 mt-2">Conecte seu dispositivo ao servidor principal.</p>
          </div>

          <div className="space-y-6 bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700/50">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">IP do Servidor (Telão)</label>
              <input 
                type="text" 
                value={tempIp}
                onChange={(e) => setTempIp(e.target.value)}
                placeholder="Ex: 192.168.1.100"
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 font-bold text-xl text-blue-400 placeholder:text-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Seu Número de Balcão</label>
              <input 
                type="number" 
                value={guiche}
                onChange={(e) => setGuiche(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 font-bold text-xl text-blue-400"
              />
            </div>

            <button 
              onClick={handleSaveConfig}
              className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all active:scale-95"
            >
              Salvar e Conectar
            </button>
          </div>

          {error && !showConfig && (
            <p className="text-rose-500 text-center font-bold animate-pulse uppercase text-xs tracking-widest">
              Não foi possível conectar ao servidor.
            </p>
          )}
        </div>
      </div>
    );
  }

  const aguardandoCount = fila.length;
  const prefCount = fila.filter(s => s.preferencial === 1).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden touch-none">
      {/* Header Mobile/Tablet */}
      <header className="px-6 py-8 md:px-12 md:py-10 flex items-center justify-between bg-slate-900/50 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-2xl md:text-4xl">sensors</span>
          </div>
          <div>
            <h1 className="font-sans text-xl md:text-3xl font-bold uppercase tracking-wider leading-none">Balcão {guiche}</h1>
            <div className="flex items-center gap-1.5 md:gap-2 mt-1 md:mt-2">
              <span className="w-2 h-2 md:w-3 md:h-3 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] md:text-sm font-bold text-emerald-500 uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="w-12 h-12 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center active:bg-blue-600/30"
              title="Instalar App"
            >
              <span className="material-symbols-outlined">download</span>
            </button>
          )}
          <button 
            onClick={() => setShowConfig(true)}
            className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 active:bg-slate-700"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="p-6 md:p-12 md:pb-6 grid grid-cols-2 gap-4 md:gap-8 shrink-0 max-w-4xl mx-auto w-full">
        <div className="bg-slate-900 border border-slate-800 p-5 md:py-10 rounded-[2rem] md:rounded-[3rem] flex flex-col items-center justify-center">
          <span className="text-4xl md:text-7xl font-black text-white">{aguardandoCount}</span>
          <span className="text-[10px] md:text-base font-bold text-slate-500 uppercase tracking-widest mt-1 md:mt-3">Total na Fila</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 md:py-10 rounded-[2rem] md:rounded-[3rem] flex flex-col items-center justify-center">
          <span className="text-4xl md:text-7xl font-black text-amber-500">{prefCount}</span>
          <span className="text-[10px] md:text-base font-bold text-slate-500 uppercase tracking-widest mt-1 md:mt-3">Preferencial</span>
        </div>
      </div>

      {/* Main Focus Area: Current Ticket */}
      <div className="flex-1 px-6 md:px-12 flex flex-col justify-center items-center">
        <div className="w-full max-w-4xl aspect-square md:aspect-video bg-slate-900 rounded-[3rem] md:rounded-[4rem] border-2 border-slate-800 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 md:h-2 bg-blue-600/30"></div>
          {senhaAtual ? (
            <>
              <span className="text-xs md:text-2xl font-bold text-slate-500 uppercase tracking-[0.4em] mb-6 md:mb-10">Chamada Atual</span>
              <span className="font-sans text-[10rem] md:text-[18rem] font-black text-blue-500 leading-none">
                {String(senhaAtual.numero).padStart(3, '0')}
              </span>
              <div className={`mt-8 md:mt-12 px-5 py-2 md:px-8 md:py-4 rounded-full text-[10px] md:text-base font-bold uppercase tracking-widest ${senhaAtual.preferencial ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                {senhaAtual.preferencial ? 'Atendimento Prioritário' : 'Atendimento Normal'}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-20">
              <span className="material-symbols-outlined text-[6rem] md:text-[10rem] mb-4 md:mb-8">touch_app</span>
              <span className="font-sans text-2xl md:text-5xl uppercase tracking-widest">Toque para chamar</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="p-8 pb-12 md:p-12 md:pb-16 flex flex-col gap-6 md:gap-8 shrink-0 bg-gradient-to-t from-slate-950 to-transparent">
        {senhaAtual && (config.painel_habilitar_concluir !== '0' || config.painel_habilitar_nao_compareceu !== '0') && (
          <div className="flex gap-4 md:gap-8 max-w-4xl mx-auto w-full animate-fade-in">
            {config.painel_habilitar_concluir !== '0' && (
              <button 
                onClick={concluirAtendimento}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-6 md:py-10 rounded-3xl md:rounded-[3rem] flex items-center justify-center gap-3 md:gap-6 active:scale-95 transition-all text-white font-sans text-xl md:text-4xl font-bold uppercase tracking-wider cursor-pointer"
              >
                <span className="material-symbols-outlined text-2xl md:text-5xl">check_circle</span>
                <span>Concluir</span>
              </button>
            )}
            
            {config.painel_habilitar_nao_compareceu !== '0' && (
              <button 
                onClick={naoCompareceu}
                className="flex-1 bg-rose-600 hover:bg-rose-500 py-6 md:py-10 rounded-3xl md:rounded-[3rem] flex items-center justify-center gap-3 md:gap-6 active:scale-95 transition-all text-white font-sans text-xl md:text-4xl font-bold uppercase tracking-wider cursor-pointer"
              >
                <span className="material-symbols-outlined text-2xl md:text-5xl">cancel</span>
                <span>Não Comp.</span>
              </button>
            )}
          </div>
        )}

        <button 
          onClick={chamarProxima}
          disabled={aguardandoCount === 0}
          className={`w-full max-w-4xl mx-auto py-8 md:py-14 rounded-[2.5rem] md:rounded-[4rem] flex md:flex-row flex-col items-center justify-center gap-2 md:gap-6 transition-all active:scale-95 shadow-2xl ${aguardandoCount > 0 ? 'bg-blue-600 text-white shadow-blue-600/20 md:hover:bg-blue-500' : 'bg-slate-800 text-slate-600 grayscale'}`}
        >
          <span className="material-symbols-outlined text-5xl md:text-[5rem]">campaign</span>
          <span className="font-sans text-4xl md:text-7xl font-bold uppercase tracking-[0.1em]">Chamar Próximo</span>
        </button>

        <div className="flex gap-4 md:gap-8 max-w-4xl mx-auto w-full">
          {config.painel_habilitar_repetir !== '0' && (
            <button 
              onClick={repetirChamada}
              disabled={!senhaAtual}
              className="flex-1 bg-slate-800 hover:bg-slate-700 py-6 md:py-10 rounded-3xl md:rounded-[3rem] flex items-center justify-center gap-3 md:gap-6 active:scale-95 transition-all border border-slate-700 disabled:opacity-20"
            >
              <span className="material-symbols-outlined text-2xl md:text-5xl">refresh</span>
              <span className="font-sans text-xl md:text-4xl font-bold uppercase tracking-wider">Repetir</span>
            </button>
          )}
          
          {config.painel_habilitar_devolver !== '0' && (
            <button 
              onClick={estornar}
              disabled={!senhaAtual}
              className="flex-1 bg-amber-600/20 hover:bg-amber-600/40 py-6 md:py-10 rounded-3xl md:rounded-[3rem] flex items-center justify-center gap-3 md:gap-6 active:scale-95 transition-all border-2 border-amber-500/50 text-amber-500 disabled:opacity-20"
            >
              <span className="material-symbols-outlined text-2xl md:text-5xl">undo</span>
              <span className="font-sans text-xl md:text-4xl font-bold uppercase tracking-wider">Devolver</span>
            </button>
          )}

          <button 
            onClick={() => window.location.reload()}
            className="w-20 md:w-28 bg-slate-800 hover:bg-slate-700 rounded-3xl md:rounded-[3rem] flex items-center justify-center active:scale-95 transition-all border border-slate-700"
          >
            <span className="material-symbols-outlined md:text-[3rem]">sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
