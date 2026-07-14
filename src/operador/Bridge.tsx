import { useState, useEffect } from 'react';
import { 
  DownloadCloud, 
  Network, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Smartphone, 
  Tablet, 
  ArrowRight 
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import packageJson from '../../package.json';

export default function Bridge() {
  const [ip] = useState(window.location.hostname || 'localhost');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    if (ip) {
      testConnection(ip);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const testConnection = async (targetIp: string) => {
    if (!targetIp) return;
    
    setStatus('testing');
    setErrorMessage('');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(`http://${targetIp}:3001/api/fila`, { 
         signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage('Servidor encontrado, mas retornou erro.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage('Não foi possível alcançar o servidor. Verifique se o IP está correto e se o dispositivo está na mesma rede Wi-Fi.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-ink flex flex-col items-center justify-center p-6 font-sans overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      {deferredPrompt && (
        <Button 
          onClick={handleInstall}
          variant="primary"
          size="sm"
          className="fixed top-6 right-6 z-toast shadow-lg animate-bounce"
          icon={<DownloadCloud className="h-4 w-4" />}
        >
          INSTALAR APP
        </Button>
      )}

      <div className="w-full max-w-md z-sticky flex flex-col items-center">
        {/* Logo Section */}
        <div className="mb-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-primary rounded-lg flex items-center justify-center shadow-md mb-6 rotate-3">
            <Network className="h-10 w-10 text-on-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight mb-2 text-ink">
            CONECTOR <span className="text-primary">CHAMA<span className="italic">AÍ</span></span>
          </h1>
          <p className="text-ink-variant font-medium uppercase tracking-[0.2em] text-[10px]">Ponte de Conexão Mobile</p>
        </div>

        {/* Card */}
        <div className="w-full bg-surface border border-outline-variant rounded-lg p-8 shadow-md">

          {/* Status Indicator */}
          {status !== 'idle' && (
            <div className={`mb-8 p-4 rounded-sm flex items-start gap-3 transition-colors ${
              status === 'testing' ? 'bg-primary-container/10 text-primary border border-primary-container/20' :
              status === 'success' ? 'bg-success-container/30 text-success-ink border border-success/20' :
              'bg-error-container/30 text-error-ink border border-error/20'
            }`}>
              <span className="shrink-0 mt-0.5">
                {status === 'testing' && <RefreshCw className="h-5 w-5 animate-spin" />}
                {status === 'success' && <CheckCircle2 className="h-5 w-5" />}
                {status === 'error' && <AlertTriangle className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  {status === 'testing' ? 'Testando Conexão...' : status === 'success' ? 'Conectado com Sucesso!' : 'Falha na Conexão'}
                </p>
                {errorMessage && <p className="text-[10px] opacity-80 mt-1">{errorMessage}</p>}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Button 
              onClick={() => testConnection(ip)}
              disabled={status === 'testing'}
              variant="secondary"
              className="w-full"
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Testar Conexão Novamente
            </Button>

            {status === 'success' && (
              <div className="pt-4 space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-outline-variant/50"></span></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black text-ink-variant"><span className="bg-surface px-4">Selecionar Interface</span></div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => window.location.hash = '/mobile'}
                    className="w-full bg-primary hover:brightness-95 active:scale-[0.98] transition-all py-4 rounded-sm font-bold text-base text-on-primary flex items-center justify-between px-6 shadow-sm group"
                  >
                    <div className="flex items-center gap-4">
                      <Smartphone className="h-6 w-6" />
                      <div className="text-left">
                        <p className="leading-none text-sm uppercase tracking-wider font-bold">Mobile</p>
                        <p className="text-[10px] font-normal opacity-70 mt-1">Vertical • Smartphone</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button 
                    onClick={() => window.location.hash = '/operador-touch'}
                    className="w-full bg-surface-container-low hover:bg-surface-container border border-outline-variant text-ink active:scale-[0.98] transition-all py-4 rounded-sm font-bold text-base flex items-center justify-between px-6 group"
                  >
                    <div className="flex items-center gap-4">
                      <Tablet className="h-6 w-6 text-primary" />
                      <div className="text-left">
                        <p className="leading-none text-sm uppercase tracking-wider font-bold">Touch TV</p>
                        <p className="text-[10px] font-normal text-ink-variant mt-1">Horizontal • Tablet/TV</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform text-primary" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center opacity-40">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-ink-variant">
            CHAMAAÍ V{packageJson.version} • MOBILE BRIDGE
          </p>
        </div>
      </div>
    </div>
  );
}
