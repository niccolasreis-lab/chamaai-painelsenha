import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSSE } from '../shared/useSSE';

export default function ControleTouch() {
  const [ip, setIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [guiche, setGuiche] = useState(localStorage.getItem('operator_guiche') || '');
  const [isSetup, setIsSetup] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState<any>(null);
  const [queueCounts, setQueueCounts] = useState({ geral: 0, preferencial: 0 });
  const [showConfirmDevolver, setShowConfirmDevolver] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [config, setConfig] = useState<any>({});

  // Listen to beforeinstallprompt for PWA install capability
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  // Validate server connection on initial load if configuration already exists
  useEffect(() => {
    if (ip && guiche) {
      setIsValidating(true);
      fetch(`http://${ip}:3000/health`)
        .then((res) => {
          if (res.ok) {
            setIsSetup(true);
            fetchInitialData(ip, guiche);
          } else {
            setErrorMsg('Servidor não encontrado. Verifique o IP e a rede Wi-Fi.');
          }
        })
        .catch(() => {
          setErrorMsg('Servidor não encontrado. Verifique o IP e a rede Wi-Fi.');
        })
        .finally(() => {
          setIsValidating(false);
        });
    }
  }, []);

  // Set up real-time SSE syncing
  const { data: sseData, connected: sseConnected } = useSSE(
    isSetup ? `http://${ip}:3000/events` : null
  );

  // Listen to SSE updates
  useEffect(() => {
    if (!sseData) return;

    if (sseData.event === 'queue-update') {
      setQueueCounts({
        geral: sseData.data.geral || 0,
        preferencial: sseData.data.preferencial || 0,
      });
    } else if (sseData.event === 'ticket-called') {
      if (sseData.data.guiche === `Guichê ${guiche}`) {
        if (sseData.data.numero === null) {
          setSenhaAtual(null);
        } else {
          setSenhaAtual({
            id: sseData.data.id,
            numero: sseData.data.numero,
            preferencial: sseData.data.preferencial,
          });
        }
      }
    }
  }, [sseData, guiche]);

  // Fetch queue counts and active called ticket on setup success
  const fetchInitialData = async (serverIp: string, guicheNum: string) => {
    try {
      // 1. Fetch queue counts
      const queueRes = await fetch(`http://${serverIp}:3000/api/fila`);
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        const geral = queueData.filter((s: any) => s.preferencial === 0).length;
        const pref = queueData.filter((s: any) => s.preferencial === 1).length;
        setQueueCounts({ geral, preferencial: pref });
      }

      // 2. Fetch last called ticket to find if there is an active one for this guichê
      const ticketsRes = await fetch(`http://${serverIp}:3000/api/senhas`);
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        const active = ticketsData.find(
          (s: any) => s.status === 'chamada' && s.guiche === `Guichê ${guicheNum}`
        );
        if (active) {
          setSenhaAtual({
            id: active.id,
            numero: `${active.preferencial ? 'P' : 'A'}-${String(active.numero).padStart(3, '0')}`,
            preferencial: active.preferencial,
          });
        }
      }

      // 3. Fetch configurations
      const configRes = await fetch(`http://${serverIp}:3000/api/configuracoes`);
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }
    } catch (e) {
      console.error('Erro ao buscar dados iniciais:', e);
    }
  };

  const handleConnect = async () => {
    if (!ip.trim() || !guiche.trim()) {
      setErrorMsg('Preencha os campos de IP e Guichê.');
      return;
    }
    setErrorMsg('');
    setIsValidating(true);

    const cleanIp = ip.trim().replace(/^https?:\/\//i, '').replace(/:3000\/?$/, '');

    try {
      const res = await fetch(`http://${cleanIp}:3000/health`);
      if (res.ok) {
        localStorage.setItem('server_ip_override', cleanIp);
        localStorage.setItem('operator_guiche', guiche.trim());
        setIsSetup(true);
        fetchInitialData(cleanIp, guiche.trim());
      } else {
        setErrorMsg('Servidor não encontrado. Verifique o IP e a rede Wi-Fi.');
      }
    } catch (err) {
      setErrorMsg('Servidor não encontrado. Verifique o IP e a rede Wi-Fi.');
    } finally {
      setIsValidating(false);
    }
  };

  const triggerVibration = (pattern: number | number[]) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const handleProximo = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    triggerVibration(100); // Short vibration

    try {
      const res = await fetch(`http://${ip}:3000/api/operador/proximo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiche }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          setSenhaAtual({
            id: result.data.id,
            numero: result.data.numero,
            preferencial: result.data.preferencial,
          });
        }
      } else {
        if (res.status === 404) {
          alert('Fila vazia! Nenhuma senha aguardando.');
        } else {
          alert('Erro ao chamar o próximo cliente.');
        }
      }
    } catch (err) {
      alert('Sem comunicação com o servidor.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRepetir = async () => {
    if (isActionPending || !senhaAtual) return;
    setIsActionPending(true);
    triggerVibration(50); // Single tap vibration

    try {
      const res = await fetch(`http://${ip}:3000/api/operador/repetir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiche }),
      });
      if (!res.ok) {
        alert('Erro ao repetir a chamada.');
      }
    } catch (err) {
      alert('Sem comunicação com o servidor.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDevolver = async () => {
    setShowConfirmDevolver(false);
    if (isActionPending || !senhaAtual) return;
    setIsActionPending(true);
    triggerVibration([50, 50, 50]); // Triple short vibration

    try {
      const res = await fetch(`http://${ip}:3000/api/operador/devolver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiche }),
      });
      if (res.ok) {
        setSenhaAtual(null);
      } else {
        alert('Erro ao devolver a senha à fila.');
      }
    } catch (err) {
      alert('Sem comunicação com o servidor.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleConcluir = async () => {
    if (isActionPending || !senhaAtual) return;
    setIsActionPending(true);
    triggerVibration(50);

    try {
      const res = await fetch(`http://${ip}:3000/api/senhas/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche: `Guichê ${guiche}` }),
      });
      if (res.ok) {
        setSenhaAtual(null);
      } else {
        alert('Erro ao concluir atendimento.');
      }
    } catch (err) {
      alert('Sem comunicação com o servidor.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCancelar = async () => {
    if (isActionPending || !senhaAtual) return;
    setIsActionPending(true);
    triggerVibration(50);

    try {
      const res = await fetch(`http://${ip}:3000/api/senhas/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche: `Guichê ${guiche}` }),
      });
      if (res.ok) {
        setSenhaAtual(null);
      } else {
        alert('Erro ao cancelar atendimento.');
      }
    } catch (err) {
      alert('Sem comunicação com o servidor.');
    } finally {
      setIsActionPending(false);
    }
  };

  // --- SCREEN 1: Setup & Connection ---
  if (!isSetup) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] text-[#1E293B] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-col items-center">
          
          {/* Centralized Logo */}
          <div className="text-center mb-8 flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-5xl text-[#2563EB]">sensors</span>
            <h1 className="text-4xl font-extrabold text-[#2563EB] tracking-wider uppercase">ChamaAí</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Módulo Operador Touch</p>
          </div>

          <div className="w-full space-y-5">
            {/* IP Address Field */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">IP do Servidor</label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="Ex: 192.168.1.100"
                className="w-full bg-[#F8F9FA] border border-slate-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 rounded-2xl px-5 py-4 focus:outline-none font-bold text-lg text-slate-800 placeholder:text-slate-300"
              />
            </div>

            {/* Guichê Field */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Número do Guichê</label>
              <input
                type="number"
                value={guiche}
                onChange={(e) => setGuiche(e.target.value)}
                placeholder="Ex: 1"
                className="w-full bg-[#F8F9FA] border border-slate-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 rounded-2xl px-5 py-4 focus:outline-none font-bold text-lg text-slate-800 placeholder:text-slate-300"
              />
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-600 text-xs font-bold text-center leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Connect Button */}
            <button
              onClick={handleConnect}
              disabled={isValidating}
              className="w-full bg-[#2563EB] text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-[#1D4ED8] transition-all active:scale-[0.98] shadow-lg shadow-[#2563EB]/15 flex items-center justify-center gap-3 disabled:opacity-50 outline-none"
            >
              {isValidating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Conectando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl">login</span>
                  CONECTAR
                </>
              )}
            </button>

            {/* PWA Install Button */}
            {deferredPrompt && (
              <button
                onClick={handleInstallPWA}
                className="w-full bg-[#16A34A] text-white py-3.5 rounded-2xl font-bold uppercase tracking-widest hover:bg-[#15803D] transition-all active:scale-[0.98] shadow-lg shadow-[#16A34A]/15 flex items-center justify-center gap-3 outline-none"
              >
                <span className="material-symbols-outlined text-xl">download_for_offline</span>
                Instalar no Aparelho
              </button>
            )}

            {/* Back Button */}
            <Link
              to="/"
              onClick={() => localStorage.removeItem('app_mode')}
              className="w-full border border-slate-200 text-slate-500 py-3 rounded-2xl font-bold uppercase tracking-widest hover:bg-slate-50 transition-all text-center text-xs block outline-none"
            >
              Voltar ao Menu Principal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- SCREEN 2: Operator Landscape Workspace ---
  return (
    <div className="h-screen w-screen bg-[#F8F9FA] text-[#1E293B] flex flex-row font-sans p-6 overflow-hidden select-none">
      
      {/* LEFT COLUMN (~40% width) */}
      <div className="w-[40%] flex flex-col gap-5 pr-3 h-full shrink-0">
        
        {/* Card 1: Guichê & Connection Status */}
        <div className="bg-white border border-slate-200/80 rounded-[20px] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-black text-[#1E293B] leading-none uppercase tracking-wide">
              GUICHÊ {guiche}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2.5 h-2.5 rounded-full ${sseConnected ? 'bg-[#16A34A] animate-pulse' : 'bg-[#EF4444]'}`}></span>
              <span className={`text-[10px] font-black uppercase tracking-widest ${sseConnected ? 'text-[#16A34A]' : 'text-[#EF4444]'}`}>
                {sseConnected ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {deferredPrompt && (
              <button
                onClick={handleInstallPWA}
                className="w-12 h-12 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#16A34A] flex items-center justify-center transition-all active:scale-95 outline-none border-none"
                title="Instalar Aplicativo (PWA)"
              >
                <span className="material-symbols-outlined text-2xl font-bold">download</span>
              </button>
            )}
            <Link
              to="/"
              onClick={() => localStorage.removeItem('app_mode')}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-95 outline-none"
              title="Voltar ao Menu Principal"
            >
              <span className="material-symbols-outlined text-2xl">arrow_back</span>
            </Link>
            <button
              onClick={() => setIsSetup(false)}
              className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-95 outline-none"
              title="Voltar à Tela de Conexão"
            >
              <span className="material-symbols-outlined text-2xl">settings</span>
            </button>
          </div>
        </div>

        {/* Card 2: Senha em Atendimento */}
        <div className="bg-white border border-slate-200/80 rounded-[20px] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {senhaAtual ? (
            <div className="flex flex-col items-center">
              <span className="text-[#1E293B] font-black text-6xl md:text-7xl lg:text-8xl leading-none tracking-tighter">
                {senhaAtual.numero}
              </span>
              <span className="text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px] md:text-xs mt-4">
                EM ATENDIMENTO
              </span>
              <span className={`mt-3 px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest ${senhaAtual.preferencial ? 'bg-amber-50 text-amber-600 border border-amber-200/50' : 'bg-blue-50 text-blue-600 border border-blue-200/50'}`}>
                {senhaAtual.preferencial ? 'Prioritário' : 'Normal'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center opacity-40 text-slate-400">
              <span className="material-symbols-outlined text-6xl mb-3 text-slate-300">chair</span>
              <span className="text-xs font-black uppercase tracking-widest">NENHUM ATENDIMENTO</span>
            </div>
          )}
        </div>

        {/* Card 3: Contadores de Fila */}
        <div className="grid grid-cols-2 gap-4 h-24 shrink-0">
          {/* Fila Geral */}
          <div className="bg-white border-b-4 border-[#2563EB] border border-slate-200/80 rounded-[20px] flex flex-col items-center justify-center p-2 shadow-[0_4px_12px_rgba(0,0,0,0.01)]">
            <span className="text-3xl font-black text-slate-800 leading-none">{queueCounts.geral}</span>
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">FILA GERAL</span>
          </div>
          
          {/* Fila Preferencial */}
          <div className="bg-white border-b-4 border-[#D97706] border border-slate-200/80 rounded-[20px] flex flex-col items-center justify-center p-2 shadow-[0_4px_12px_rgba(0,0,0,0.01)]">
            <span className="text-3xl font-black text-[#D97706] leading-none">{queueCounts.preferencial}</span>
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">FILA PREFERENCIAL</span>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN (~60% width) */}
      <div className="w-[60%] flex flex-col gap-4 pl-3 h-full justify-between">
        {senhaAtual ? (
          <>
            {/* Row 1: Concluir & Não Compareceu */}
            {(config.painel_habilitar_concluir !== '0' || config.painel_habilitar_nao_compareceu !== '0') && (
              <div className="flex-1 w-full flex gap-4 animate-fade-in">
                {config.painel_habilitar_concluir !== '0' && (
                  <button
                    onClick={handleConcluir}
                    disabled={isActionPending}
                    className="flex-1 bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold uppercase tracking-widest rounded-3xl flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all shadow-lg shadow-[#16A34A]/10 border-none outline-none disabled:opacity-50 select-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-2xl md:text-3xl">check_circle</span>
                    <span className="text-base md:text-lg lg:text-xl font-black">CONCLUIR</span>
                  </button>
                )}
                {config.painel_habilitar_nao_compareceu !== '0' && (
                  <button
                    onClick={handleCancelar}
                    disabled={isActionPending}
                    className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white font-extrabold uppercase tracking-widest rounded-3xl flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all shadow-lg shadow-[#EF4444]/10 border-none outline-none disabled:opacity-50 select-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-2xl md:text-3xl">cancel</span>
                    <span className="text-base md:text-lg lg:text-xl font-black">NÃO COMP.</span>
                  </button>
                )}
              </div>
            )}

            {/* Row 2: Chamar Próximo */}
            <button
              onClick={handleProximo}
              disabled={isActionPending}
              className="flex-1 w-full bg-slate-800 hover:bg-slate-700 text-white font-extrabold uppercase tracking-widest rounded-3xl flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all shadow-md border-none outline-none disabled:opacity-50 select-none cursor-pointer"
            >
              <span className="material-symbols-outlined text-2xl md:text-3xl">campaign</span>
              <span className="text-lg md:text-xl font-black">CHAMAR PRÓXIMO</span>
            </button>

            {/* Row 3: Repetir & Devolver */}
            {(config.painel_habilitar_repetir !== '0' || config.painel_habilitar_devolver !== '0') && (
              <div className="flex-1 w-full flex gap-4">
                {config.painel_habilitar_repetir !== '0' && (
                  <button
                    onClick={handleRepetir}
                    disabled={isActionPending}
                    className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold uppercase tracking-widest rounded-3xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md border-none outline-none disabled:opacity-50 select-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xl md:text-2xl">refresh</span>
                    <span className="text-sm md:text-base font-black">REPETIR</span>
                  </button>
                )}
                {config.painel_habilitar_devolver !== '0' && (
                  <button
                    onClick={() => setShowConfirmDevolver(true)}
                    disabled={isActionPending}
                    className="flex-1 bg-white hover:bg-amber-50/30 text-[#D97706] border-2 border-[#D97706] font-extrabold uppercase tracking-widest rounded-3xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm outline-none disabled:opacity-50 select-none cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xl md:text-2xl">undo</span>
                    <span className="text-sm md:text-base font-black">DEVOLVER</span>
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          /* PRÓXIMO BUTTON (Full Height) */
          <button
            onClick={handleProximo}
            disabled={isActionPending}
            className="h-full w-full bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold uppercase tracking-widest rounded-[40px] flex flex-col items-center justify-center gap-4 active:scale-[0.98] transition-all shadow-2xl shadow-[#16A34A]/20 border-none outline-none disabled:opacity-50 select-none cursor-pointer"
          >
            <span className="material-symbols-outlined text-7xl md:text-8xl">campaign</span>
            <span className="text-4xl md:text-5xl lg:text-6xl font-black">CHAMAR PRÓXIMO</span>
          </button>
        )}
      </div>

      {/* --- CONFIRM MODAL FOR DEVOLVER --- */}
      {showConfirmDevolver && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-[24px] p-6 max-w-sm w-full shadow-2xl flex flex-col gap-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-50 text-[#D97706] rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-250/20">
                <span className="material-symbols-outlined text-3xl">warning</span>
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-wide">Confirmar Estorno</h3>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mt-2 leading-relaxed">
                Tem certeza que deseja devolver a senha <strong className="text-slate-800">{senhaAtual?.numero}</strong> de volta para a fila de espera?
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmDevolver(false)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase tracking-widest text-xs transition-all active:scale-95"
              >
                CANCELAR
              </button>
              <button
                onClick={handleDevolver}
                className="flex-1 py-4 bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all active:scale-95"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
