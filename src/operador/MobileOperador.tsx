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
  const API_URL = getApiUrl();

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

  useEffect(() => {
    fetchFila();
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

  if (error || showConfig) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center justify-center font-rajdhani">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-blue-500 text-4xl">settings_remote</span>
            </div>
            <h2 className="text-3xl font-oswald font-bold uppercase tracking-widest">Configuração Mobile</h2>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-rajdhani select-none overflow-hidden touch-none">
      {/* Header Mobile */}
      <header className="px-6 py-8 flex items-center justify-between bg-slate-900/50 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-2xl">sensors</span>
          </div>
          <div>
            <h1 className="font-oswald text-xl font-bold uppercase tracking-wider leading-none">Balcão {guiche}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowConfig(true)}
          className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 active:bg-slate-700"
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
      </header>

      {/* Stats Cards */}
      <div className="p-6 grid grid-cols-2 gap-4 shrink-0">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-white">{aguardandoCount}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Total na Fila</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-amber-500">{prefCount}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Preferencial</span>
        </div>
      </div>

      {/* Main Focus Area: Current Ticket */}
      <div className="flex-1 px-6 flex flex-col justify-center items-center">
        <div className="w-full aspect-square bg-slate-900 rounded-[3rem] border-2 border-slate-800 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-600/30"></div>
          {senhaAtual ? (
            <>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.4em] mb-6">Chamada Atual</span>
              <span className="font-oswald text-[10rem] font-black text-blue-500 leading-none">
                {String(senhaAtual.numero).padStart(3, '0')}
              </span>
              <div className={`mt-8 px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest ${senhaAtual.preferencial ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                {senhaAtual.preferencial ? 'Atendimento Prioritário' : 'Atendimento Normal'}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-20">
              <span className="material-symbols-outlined text-[6rem] mb-4">touch_app</span>
              <span className="font-oswald text-2xl uppercase tracking-widest">Toque para chamar</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="p-8 pb-12 flex flex-col gap-6 shrink-0 bg-gradient-to-t from-slate-950 to-transparent">
        <button 
          onClick={chamarProxima}
          disabled={aguardandoCount === 0}
          className={`w-full py-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-2xl ${aguardandoCount > 0 ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-slate-800 text-slate-600 grayscale'}`}
        >
          <span className="material-symbols-outlined text-5xl">campaign</span>
          <span className="font-oswald text-4xl font-bold uppercase tracking-[0.1em]">Chamar Próximo</span>
        </button>

        <div className="flex gap-4">
          <button 
            onClick={repetirChamada}
            disabled={!senhaAtual}
            className="flex-1 bg-slate-800 hover:bg-slate-700 py-6 rounded-3xl flex items-center justify-center gap-3 active:scale-95 transition-all border border-slate-700 disabled:opacity-20"
          >
            <span className="material-symbols-outlined text-2xl">refresh</span>
            <span className="font-oswald text-xl font-bold uppercase tracking-wider">Repetir</span>
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-20 bg-slate-800 hover:bg-slate-700 rounded-3xl flex items-center justify-center active:scale-95 transition-all border border-slate-700"
          >
            <span className="material-symbols-outlined">sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
