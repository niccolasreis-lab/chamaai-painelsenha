import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Radio, 
  LogIn, 
  DownloadCloud, 
  Download, 
  ArrowLeft, 
  Settings, 
  UserX, 
  CheckCircle2, 
  XCircle, 
  Megaphone, 
  RefreshCw, 
  Undo2, 
  AlertTriangle 
} from 'lucide-react';
import { useSSE } from '../shared/useSSE';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';

export default function ControleTouch() {
  const [ip] = useState(window.location.hostname || 'localhost');
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
    const hoje = new Date().toDateString();
    const ultimaData = localStorage.getItem('chamaaai_ultima_data');

    if (ultimaData && ultimaData !== hoje) {
      localStorage.removeItem('chamaaai_ultima_data');
      setSenhaAtual(null);
      setQueueCounts({ geral: 0, preferencial: 0 });
    }
    localStorage.setItem('chamaaai_ultima_data', hoje);

    if (ip && guiche) {
      setIsValidating(true);
      fetch(`http://${ip}:3001/health`)
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
    isSetup ? `http://${ip}:3001/events` : null
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
    } else if (sseData.event === 'DIA_RESETADO') {
      setSenhaAtual(null);
      setQueueCounts({ geral: 0, preferencial: 0 });
      fetchInitialData(ip, guiche);
      console.log('[ChamaAí] Dia resetado — estado recarregado');
    }
  }, [sseData, guiche, ip]);

  // Fetch queue counts and active called ticket on setup success
  const fetchInitialData = async (serverIp: string, guicheNum: string) => {
    try {
      // 1. Fetch queue counts
      const queueRes = await fetch(`http://${serverIp}:3001/api/fila`);
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        const geral = queueData.filter((s: any) => s.preferencial === 0).length;
        const pref = queueData.filter((s: any) => s.preferencial === 1).length;
        setQueueCounts({ geral, preferencial: pref });
      }

      // 2. Fetch last called ticket to find if there is an active one for this guichê
      const ticketsRes = await fetch(`http://${serverIp}:3001/api/senhas`);
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
      const configRes = await fetch(`http://${serverIp}:3001/api/configuracoes`);
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }
    } catch (e) {
      console.error('Erro ao buscar dados iniciais:', e);
    }
  };

  const handleConnect = async () => {
    if (!guiche.trim()) {
      setErrorMsg('Preencha o Número do Guichê.');
      return;
    }
    setErrorMsg('');
    setIsValidating(true);

    const cleanIp = ip.trim().replace(/^https?:\/\//i, '').replace(/:300[01]\/?$/, '');

    try {
      const res = await fetch(`http://${cleanIp}:3001/health`);
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
      const res = await fetch(`http://${ip}:3001/api/operador/proximo`, {
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
      const res = await fetch(`http://${ip}:3001/api/operador/repetir`, {
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
      const res = await fetch(`http://${ip}:3001/api/operador/devolver`, {
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
      const res = await fetch(`http://${ip}:3001/api/senhas/concluir`, {
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
      const res = await fetch(`http://${ip}:3001/api/senhas/cancelar`, {
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
      <div className="min-h-screen bg-background text-ink flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-surface rounded-lg p-8 border border-outline-variant shadow-md flex flex-col items-center">
          
          {/* Centralized Logo */}
          <div className="text-center mb-8 flex flex-col items-center gap-1">
            <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center shadow-sm mb-2">
              <Radio className="h-8 w-8 text-on-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold text-primary tracking-wider uppercase">ChamaAí</h1>
            <p className="text-[10px] font-bold text-ink-variant uppercase tracking-widest">Módulo Operador Touch</p>
          </div>

          <div className="w-full space-y-5">
            {/* Guichê Field */}
            <Input 
              type="number"
              label="Número do Guichê"
              value={guiche}
              onChange={e => setGuiche(e.target.value)}
              placeholder="Ex: 1"
            />

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-error-container/30 border border-error/20 rounded-sm p-3 text-error-ink text-xs font-bold text-center leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Connect Button */}
            <Button
              onClick={handleConnect}
              disabled={isValidating}
              loading={isValidating}
              className="w-full"
              icon={!isValidating ? <LogIn className="h-4 w-4" /> : undefined}
            >
              CONECTAR
            </Button>

            {/* PWA Install Button */}
            {deferredPrompt && (
              <Button
                onClick={handleInstallPWA}
                className="w-full bg-success text-white hover:brightness-95 active:brightness-90"
                icon={<DownloadCloud className="h-4 w-4" />}
              >
                Instalar no Aparelho
              </Button>
            )}

            {/* Back Button */}
            <Link
              to="/"
              onClick={() => localStorage.removeItem('app_mode')}
              className="w-full border border-outline-variant text-ink-variant py-3 rounded-sm font-bold uppercase tracking-widest hover:bg-surface-container-low transition-all text-center text-xs block outline-none"
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
    <div className="h-screen w-screen bg-background text-ink flex flex-row font-sans p-6 overflow-hidden select-none">
      
      {/* LEFT COLUMN (~40% width) */}
      <div className="w-[40%] flex flex-col gap-5 pr-3 h-full shrink-0">
        
        {/* Card 1: Guichê & Connection Status */}
        <div className="bg-surface border border-outline-variant rounded-md p-5 shadow-sm flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-display font-bold text-ink leading-none uppercase tracking-wide">
              GUICHÊ {guiche}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2.5 h-2.5 rounded-full ${sseConnected ? 'bg-success animate-pulse' : 'bg-error'}`}></span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${sseConnected ? 'text-success-ink' : 'text-error-ink'}`}>
                {sseConnected ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {deferredPrompt && (
              <Button
                onClick={handleInstallPWA}
                variant="ghost"
                className="w-12 h-12 p-0 flex items-center justify-center border border-outline-variant"
                title="Instalar Aplicativo (PWA)"
              >
                <Download className="h-5 w-5 text-success-ink" />
              </Button>
            )}
            <Link
              to="/"
              onClick={() => localStorage.removeItem('app_mode')}
              className="w-12 h-12 rounded-sm bg-surface-container hover:bg-surface-container-high text-ink flex items-center justify-center transition-all active:scale-95 outline-none border border-outline-variant"
              title="Voltar ao Menu Principal"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Button
              onClick={() => setIsSetup(false)}
              variant="ghost"
              className="w-12 h-12 p-0 flex items-center justify-center border border-outline-variant"
              title="Voltar à Tela de Conexão"
            >
              <Settings className="h-5 w-5 text-ink-variant" />
            </Button>
          </div>
        </div>

        {/* Card 2: Senha em Atendimento */}
        <div className="bg-surface border border-outline-variant rounded-md p-6 shadow-sm flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {senhaAtual ? (
            <div className="flex flex-col items-center">
              <span className="text-ink font-display font-bold text-6xl md:text-7xl leading-none tracking-tighter">
                {senhaAtual.numero}
              </span>
              <span className="text-ink-variant font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs mt-4">
                EM ATENDIMENTO
              </span>
              <span className={`mt-3 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
                senhaAtual.preferencial 
                  ? 'bg-warning-container text-warning-ink border-warning/20' 
                  : 'bg-primary/5 text-primary border-primary/20'
              }`}>
                {senhaAtual.preferencial ? 'Prioritário' : 'Normal'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center opacity-45 text-outline">
              <UserX className="h-16 w-16 mb-3" />
              <span className="text-xs font-bold uppercase tracking-widest">NENHUM ATENDIMENTO</span>
            </div>
          )}
        </div>

        {/* Card 3: Contadores de Fila */}
        <div className="grid grid-cols-2 gap-4 h-24 shrink-0">
          {/* Fila Geral */}
          <div className="bg-surface border-b-4 border-primary border border-outline-variant rounded-md flex flex-col items-center justify-center p-2 shadow-sm">
            <span className="text-3xl font-mono font-bold text-ink leading-none">{queueCounts.geral}</span>
            <span className="text-ink-variant font-bold uppercase tracking-widest text-[9px] mt-1">FILA GERAL</span>
          </div>
          
          {/* Fila Preferencial */}
          <div className="bg-surface border-b-4 border-warning border border-outline-variant rounded-md flex flex-col items-center justify-center p-2 shadow-sm">
            <span className="text-3xl font-mono font-bold text-warning-ink leading-none">{queueCounts.preferencial}</span>
            <span className="text-ink-variant font-bold uppercase tracking-widest text-[9px] mt-1">FILA PREFERENCIAL</span>
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
                  <Button
                    onClick={handleConcluir}
                    disabled={isActionPending}
                    className="flex-1 bg-success hover:brightness-95 active:brightness-90 text-white rounded-md flex flex-col items-center justify-center gap-2 border-none shadow-md"
                    icon={<CheckCircle2 className="h-6 w-6" />}
                  >
                    <span className="text-base font-bold tracking-wider">CONCLUIR</span>
                  </Button>
                )}
                {config.painel_habilitar_nao_compareceu !== '0' && (
                  <Button
                    onClick={handleCancelar}
                    disabled={isActionPending}
                    variant="danger"
                    className="flex-1 rounded-md flex flex-col items-center justify-center gap-2 shadow-md"
                    icon={<XCircle className="h-6 w-6" />}
                  >
                    <span className="text-base font-bold tracking-wider">NÃO COMP.</span>
                  </Button>
                )}
              </div>
            )}

            {/* Row 2: Chamar Próximo */}
            <Button
              onClick={handleProximo}
              disabled={isActionPending}
              variant="primary"
              className="flex-1 w-full rounded-md flex flex-col items-center justify-center gap-2 shadow-md"
              icon={<Megaphone className="h-6 w-6" />}
            >
              <span className="text-lg font-bold tracking-wider">CHAMAR PRÓXIMO</span>
            </Button>

            {/* Row 3: Repetir & Devolver */}
            {(config.painel_habilitar_repetir !== '0' || config.painel_habilitar_devolver !== '0') && (
              <div className="flex-1 w-full flex gap-4">
                {config.painel_habilitar_repetir !== '0' && (
                  <Button
                    onClick={handleRepetir}
                    disabled={isActionPending}
                    variant="secondary"
                    className="flex-1 bg-surface rounded-md flex items-center justify-center gap-2 shadow-sm border border-outline-variant hover:bg-surface-container-low"
                    icon={<RefreshCw className="h-5 w-5 text-primary" />}
                  >
                    <span className="text-sm font-bold tracking-wider">REPETIR</span>
                  </Button>
                )}
                {config.painel_habilitar_devolver !== '0' && (
                  <Button
                    onClick={() => setShowConfirmDevolver(true)}
                    disabled={isActionPending}
                    variant="secondary"
                    className="flex-1 bg-surface rounded-md flex items-center justify-center gap-2 shadow-sm border border-outline-variant hover:bg-surface-container-low"
                    icon={<Undo2 className="h-5 w-5 text-warning-ink" />}
                  >
                    <span className="text-sm font-bold tracking-wider text-warning-ink">DEVOLVER</span>
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          /* PRÓXIMO BUTTON (Full Height) */
          <Button
            onClick={handleProximo}
            disabled={isActionPending}
            className="h-full w-full bg-success hover:brightness-95 active:brightness-90 text-white rounded-md flex flex-col items-center justify-center gap-4 shadow-md"
            icon={<Megaphone className="h-16 w-16" />}
          >
            <span className="text-3xl font-display font-bold tracking-wide">CHAMAR PRÓXIMO</span>
          </Button>
        )}
      </div>

      {/* --- CONFIRM MODAL FOR DEVOLVER --- */}
      {showConfirmDevolver && (
        <Dialog
          open={showConfirmDevolver}
          onClose={() => setShowConfirmDevolver(false)}
          title="Confirmar Estorno"
          maxWidth="max-w-sm"
        >
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-warning-container text-warning-ink rounded-full flex items-center justify-center mx-auto mb-4 border border-warning/20">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <p className="text-ink-variant text-sm font-medium leading-relaxed">
                Tem certeza que deseja devolver a senha <strong className="text-ink">{senhaAtual?.numero}</strong> de volta para a fila de espera?
              </p>
            </div>
            
            <div className="flex gap-4">
              <Button
                variant="ghost"
                onClick={() => setShowConfirmDevolver(false)}
                className="flex-1"
              >
                CANCELAR
              </Button>
              <Button
                variant="secondary"
                onClick={handleDevolver}
                className="flex-1 bg-warning text-white hover:brightness-95 border-none"
              >
                CONFIRMAR
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
