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
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-50 flex text-slate-900 p-6 gap-6 font-sans select-none overflow-hidden touch-none overscroll-none">
       {/* Left side: Current Ticket & Stats */}
       <div className="flex-1 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-blue-600 text-5xl">storefront</span>
                <div>
                   <h1 className="font-sans text-3xl font-bold uppercase tracking-widest">{guiche}</h1>
                   <p className="text-slate-500 font-bold tracking-widest text-sm mt-1 uppercase">Painel Touch Horizontal</p>
                </div>
             </div>
             <div className="flex items-center gap-2">
                 {deferredPrompt && (
                   <button 
                     onClick={handleInstallClick}
                     className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
                     title="Instalar App"
                   >
                     <span className="material-symbols-outlined">download</span>
                   </button>
                 )}
                 <button onClick={() => window.location.href = '#/'} className="w-14 h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined">close</span>
                 </button>
              </div>
          </div>

          {/* Current Ticket */}
          <div className="flex-1 bg-white rounded-[40px] flex flex-col items-center justify-center relative overflow-hidden border-2 border-slate-200 shadow-xl">
             {senhaAtual ? (
                <>
                   <span className="text-slate-400 font-bold uppercase tracking-[0.3em] mb-4 text-xl">Em Atendimento</span>
                   <span className="font-sans text-[14rem] font-black text-blue-600 leading-none drop-shadow-md">
                     {String(senhaAtual.numero).padStart(3, '0')}
                   </span>
                   <span className={`mt-8 px-8 py-3 rounded-full font-bold uppercase tracking-widest text-2xl ${senhaAtual.preferencial ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                     {senhaAtual.preferencial ? 'ATENDIMENTO PRIORITÁRIO' : 'ATENDIMENTO NORMAL'}
                   </span>
                </>
             ) : (
                <div className="flex flex-col items-center opacity-30 text-slate-500">
                  <span className="material-symbols-outlined text-[8rem] mb-6">chair</span>
                  <span className="font-sans text-4xl uppercase tracking-widest">Nenhum atendimento</span>
                </div>
             )}
          </div>

          {/* Counters */}
          <div className="grid grid-cols-2 gap-6 h-32">
             <div className="bg-white rounded-3xl flex flex-col items-center justify-center border-b-4 border-blue-500 shadow-sm">
                <span className="text-5xl font-black text-slate-800">{normalCount}</span>
                <span className="text-slate-500 font-bold tracking-widest uppercase text-sm mt-1">Fila Geral</span>
             </div>
             <div className="bg-white rounded-3xl flex flex-col items-center justify-center border-b-4 border-amber-500 shadow-sm">
                <span className="text-5xl font-black text-amber-500">{prefCount}</span>
                <span className="text-slate-500 font-bold tracking-widest uppercase text-sm mt-1">Fila Preferencial</span>
             </div>
          </div>
       </div>

       {/* Right side: Action Buttons */}
       <div className="flex-1 flex flex-col gap-6">
          <button 
             onClick={chamarProxima}
             className="flex-[2] bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white active:scale-[0.98] rounded-[40px] flex flex-col items-center justify-center gap-6 transition-all shadow-xl"
          >
             <span className="material-symbols-outlined text-[8rem]">campaign</span>
             <span className="font-sans text-7xl font-black uppercase tracking-widest">Próximo</span>
          </button>
          
          <button 
             onClick={repetirChamada}
             className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white active:scale-[0.98] rounded-[40px] flex items-center justify-center gap-6 transition-all shadow-md"
          >
             <span className="material-symbols-outlined text-6xl">refresh</span>
             <span className="font-sans text-5xl font-bold uppercase tracking-widest">Repetir</span>
          </button>

          <button 
             onClick={estornar}
             className="flex-[0.6] bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-[0.98] rounded-[40px] flex items-center justify-center gap-6 transition-all border-2 border-amber-500/30 text-amber-600 shadow-sm"
          >
             <span className="material-symbols-outlined text-5xl">undo</span>
             <span className="font-sans text-3xl font-bold uppercase tracking-widest">Devolver à Fila</span>
          </button>
       </div>
    </div>
  );
}
