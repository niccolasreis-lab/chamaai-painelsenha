import { useState, useEffect } from 'react';
import { 
  Tv, 
  Radio, 
  DownloadCloud, 
  Settings, 
  Pointer, 
  CheckCircle2, 
  XCircle, 
  Megaphone, 
  RefreshCw, 
  Undo2, 
  RotateCw 
} from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';

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
      <div className="min-h-screen bg-background text-ink p-6 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Tv className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wider">Configuração Mobile</h2>
            <p className="text-ink-variant text-sm mt-1">Conecte seu dispositivo ao servidor principal.</p>
          </div>

          <div className="space-y-4 bg-surface p-6 rounded-md border border-outline-variant shadow-sm">
            <Input 
              type="text" 
              label="IP do Servidor (Telão)"
              value={tempIp}
              onChange={e => setTempIp(e.target.value)}
              placeholder="Ex: 192.168.1.100"
            />

            <Input 
              type="number" 
              label="Seu Número de Balcão"
              value={guiche}
              onChange={e => setGuiche(e.target.value)}
            />

            <Button 
              onClick={handleSaveConfig}
              className="w-full pt-1"
            >
              Salvar e Conectar
            </Button>
          </div>

          {error && !showConfig && (
            <p className="text-error-ink text-center font-bold uppercase text-xs tracking-wider animate-pulse">
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
    <div className="min-h-screen bg-background text-ink flex flex-col font-sans select-none overflow-hidden touch-none">
      {/* Header Mobile/Tablet */}
      <header className="px-6 py-4 flex items-center justify-between bg-surface border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-sm flex items-center justify-center">
            <Radio className="text-on-primary h-5 w-5" />
          </div>
          <div>
            <h1 className="font-sans text-base font-bold uppercase tracking-wider leading-none">Balcão {guiche}</h1>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
              <span className="text-[10px] font-bold text-success-ink uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {deferredPrompt && (
            <Button 
              onClick={handleInstallClick}
              variant="ghost"
              className="w-10 h-10 p-0 border border-outline-variant"
              title="Instalar App"
            >
              <DownloadCloud className="h-5 w-5 text-success-ink" />
            </Button>
          )}
          <Button 
            onClick={() => setShowConfig(true)}
            variant="ghost"
            className="w-10 h-10 p-0 border border-outline-variant"
          >
            <Settings className="h-5 w-5 text-ink-variant" />
          </Button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="p-4 grid grid-cols-2 gap-4 shrink-0 max-w-4xl mx-auto w-full">
        <div className="bg-surface border border-outline-variant p-4 rounded-sm flex flex-col items-center justify-center shadow-sm">
          <span className="text-4xl font-mono font-bold text-ink">{aguardandoCount}</span>
          <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider mt-1">Total na Fila</span>
        </div>
        <div className="bg-surface border border-outline-variant p-4 rounded-sm flex flex-col items-center justify-center shadow-sm">
          <span className="text-4xl font-mono font-bold text-warning-ink">{prefCount}</span>
          <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider mt-1">Preferencial</span>
        </div>
      </div>

      {/* Main Focus Area: Current Ticket */}
      <div className="flex-1 px-4 flex flex-col justify-center items-center">
        <div className="w-full max-w-sm aspect-square bg-surface rounded-md border border-outline-variant flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary/20"></div>
          {senhaAtual ? (
            <>
              <span className="text-xs font-bold text-ink-variant uppercase tracking-wider mb-4">Chamada Atual</span>
              <span className="font-display text-8xl font-bold text-primary leading-none">
                {String(senhaAtual.numero).padStart(3, '0')}
              </span>
              <div className={`mt-6 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                senhaAtual.preferencial 
                  ? 'bg-warning-container text-warning-ink border-warning/20' 
                  : 'bg-primary/5 text-primary border-primary/20'
              }`}>
                {senhaAtual.preferencial ? 'Atendimento Prioritário' : 'Atendimento Normal'}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center opacity-40 text-outline">
              <Pointer className="h-12 w-12 mb-3" />
              <span className="text-sm font-bold uppercase tracking-wider">Toque para chamar</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="p-4 pb-6 flex flex-col gap-4 shrink-0 bg-surface border-t border-outline-variant">
        {senhaAtual && (config.painel_habilitar_concluir !== '0' || config.painel_habilitar_nao_compareceu !== '0') && (
          <div className="flex gap-4 max-w-4xl mx-auto w-full animate-fade-in">
            {config.painel_habilitar_concluir !== '0' && (
              <Button 
                onClick={concluirAtendimento}
                className="flex-1 bg-success hover:brightness-95 text-white py-4 font-bold"
                icon={<CheckCircle2 className="h-5 w-5" />}
              >
                Concluir
              </Button>
            )}
            
            {config.painel_habilitar_nao_compareceu !== '0' && (
              <Button 
                onClick={naoCompareceu}
                variant="danger"
                className="flex-1 py-4 font-bold"
                icon={<XCircle className="h-5 w-5" />}
              >
                Não Comp.
              </Button>
            )}
          </div>
        )}

        <Button 
          onClick={chamarProxima}
          disabled={aguardandoCount === 0}
          className="w-full max-w-4xl mx-auto py-5 bg-success hover:brightness-95 active:brightness-90 text-white font-bold text-lg tracking-wider"
          icon={<Megaphone className="h-6 w-6" />}
        >
          Chamar Próximo
        </Button>

        <div className="flex gap-4 max-w-4xl mx-auto w-full">
          {config.painel_habilitar_repetir !== '0' && (
            <Button 
              onClick={repetirChamada}
              disabled={!senhaAtual}
              variant="secondary"
              className="flex-1 py-3 border border-outline-variant"
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Repetir
            </Button>
          )}
          
          {config.painel_habilitar_devolver !== '0' && (
            <Button 
              onClick={estornar}
              disabled={!senhaAtual}
              variant="secondary"
              className="flex-1 py-3 border border-warning/30 text-warning-ink hover:bg-warning-container/30"
              icon={<Undo2 className="h-4 w-4 text-warning-ink" />}
            >
              Devolver
            </Button>
          )}

          <Button 
            onClick={() => window.location.reload()}
            variant="secondary"
            className="w-12 p-0 border border-outline-variant"
            icon={<RotateCw className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
}
