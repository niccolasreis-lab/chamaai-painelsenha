import { useState, useEffect } from 'react';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';

export default function ControleTouch() {
  const [fila, setFila] = useState<any[]>([]);
  const [senhaAtual, setSenhaAtual] = useState<any>(null);
  const [guiche, setGuiche] = useState('Guichê 1');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const API_URL = getApiUrl();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const refreshData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fila`);
      if (res.ok) {
        const data = await res.json();
        setFila(Array.isArray(data) ? data : []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    try {
      const savedGuiche = localStorage.getItem('myStationName') || 'Guichê 1';
      setGuiche(savedGuiche);
    } catch (e) {}

    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sincronização em tempo real via SSE
  const { data: sseEvent } = useSSE(`${API_URL}/events`);

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
      } else if (res.status === 404) {
        // Fila vazia, nada a fazer
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
          guiche: guiche
        })
      });
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
      refreshData();
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

  const normalCount = fila.filter(s => s.preferencial === 0).length;
  const prefCount = fila.filter(s => s.preferencial === 1).length;

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
                   <p className="text-slate-500 font-bold tracking-widest text-[10px] md:text-sm mt-0.5 md:mt-1 uppercase">Painel Touch Horizontal</p>
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
                 <button onClick={() => window.location.href = '#/'} className="w-10 h-10 md:w-14 md:h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors">
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
    </div>
  );
}
