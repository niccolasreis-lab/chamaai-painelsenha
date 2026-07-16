import { useState, useEffect } from 'react';
import { CheckCircle2, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './components';

export default function GlobalUpdateNotification() {
  const [updateState, setUpdateState] = useState<'idle' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [versionInfo, setVersionInfo] = useState<any>(null);
  const [errorMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Estados para exibir aviso pós-atualização
  const [justUpdatedInfo, setJustUpdatedInfo] = useState<any>(null);
  const [showSuccessCard, setShowSuccessCard] = useState(false);

  useEffect(() => {
    // Check if we are running in Electron and have access to the API
    const api = (window as any).api;
    if (!api) return;

    let successTimer: any = null;

    // Verifica se acabamos de atualizar
    try {
      api.checkUpdateStatus().then((status: any) => {
        console.log('[UPDATE STATUS] Status de atualização:', status);
        if (status && status.justUpdated) {
          setJustUpdatedInfo(status);
          setShowSuccessCard(true);
          successTimer = setTimeout(() => {
            setShowSuccessCard(false);
          }, 15000);
        }
      }).catch((e: any) => {
        console.error('[UPDATE STATUS] Erro ao obter status:', e);
      });
    } catch (e) {}

    // Listen to update events from main process
    const cleanupAvailable = api.onUpdateAvailable((info: any) => {
      console.log('[UPDATE] Disponível:', info);
      setVersionInfo(info);
      setUpdateState('available');
      setDismissed(false);
    });

    const cleanupProgress = api.onDownloadProgress((progressInfo: any) => {
      console.log('[UPDATE] Progresso:', progressInfo);
      setUpdateState('downloading');
      setProgress(Math.round(progressInfo.percent || 0));
      setDismissed(false);
    });

    const cleanupDownloaded = api.onUpdateDownloaded((info: any) => {
      console.log('[UPDATE] Baixado:', info);
      setUpdateState('downloaded');
      setDismissed(false);
    });

    const cleanupError = api.onUpdateError((err: any) => {
      console.error('[UPDATE] Erro silencioso em background:', err);
      // Mantemos o erro de segundo plano silencioso na interface geral.
      // Erros de atualização só serão mostrados em formato de alerta quando buscados manualmente em Configurações.
    });

    const runUpdateCheck = async () => {
      try {
        // Fetch config to check if auto update is enabled
        const host = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        const res = await fetch(`${host}/api/config`);
        if (res.ok) {
          const config = await res.json();
          if (config.atualizacao_automatica === '0') {
            return; // Skip auto update
          }
        }
        
        const updateRes = await api.checkForUpdates();
        if (updateRes && (updateRes.updateDownloaded || updateRes.isGitUpdate)) {
           setVersionInfo(updateRes.info);
           setUpdateState('downloaded');
           setDismissed(false);
        } else if (updateRes && updateRes.updateAvailable) {
           setVersionInfo(updateRes.info);
           setUpdateState('available');
           setDismissed(false);
        }
      } catch (e) {
        console.error('Erro ao verificar atualizações:', e);
      }
    };

    // Check for updates periodically (e.g. every 1 hour)
    const checkInterval = setInterval(runUpdateCheck, 60 * 60 * 1000);

    // Initial check on mount
    runUpdateCheck();

    return () => {
      if (typeof cleanupAvailable === 'function') cleanupAvailable();
      if (typeof cleanupProgress === 'function') cleanupProgress();
      if (typeof cleanupDownloaded === 'function') cleanupDownloaded();
      if (typeof cleanupError === 'function') cleanupError();
      if (successTimer) clearTimeout(successTimer);
      clearInterval(checkInterval);
    };
  }, []);

  const handleInstall = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.installUpdate();
    } catch (err) {
      console.error('Erro ao instalar atualização:', err);
    }
  };

  // Exibe o card de sucesso de atualização primeiro, se aplicável
  if (showSuccessCard && justUpdatedInfo) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-surface/95 backdrop-blur-md border border-success/30 rounded-3xl p-5 shadow-lg animate-scale-in flex flex-col gap-4 font-sans text-ink">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-success">
                Sistema Atualizado!
              </h4>
              <p className="text-xs text-ink mt-1 font-semibold leading-relaxed">
                Você já está utilizando a versão mais nova: <span className="px-2 py-0.5 bg-success/15 text-success rounded-full text-xs font-bold font-mono border border-success/20">v{justUpdatedInfo.currentVersion}</span>
              </p>
              {justUpdatedInfo.previousVersion && (
                <p className="text-[10px] text-ink-secondary mt-1.5 leading-relaxed">
                  Atualizado com sucesso a partir da versão v{justUpdatedInfo.previousVersion}.
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={() => setShowSuccessCard(false)} 
            className="text-ink-secondary/60 hover:text-ink hover:bg-outline-variant/40 w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (updateState === 'idle' || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-surface/95 backdrop-blur-md border border-outline-variant/60 rounded-3xl p-5 shadow-lg animate-scale-in flex flex-col gap-4 font-sans text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            updateState === 'downloaded' ? 'bg-success/15 text-success' :
            updateState === 'error' ? 'bg-error-container text-error' : 'bg-primary/15 text-primary'
          }`}>
            {updateState === 'downloaded' ? <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} /> :
             updateState === 'error' ? <AlertTriangle className="h-6 w-6" strokeWidth={2.5} /> : 
             <RefreshCw className="h-6 w-6" strokeWidth={2.5} />}
          </div>
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider">
              {updateState === 'available' && 'Atualização Disponível'}
              {updateState === 'downloading' && 'Baixando Atualização'}
              {updateState === 'downloaded' && 'Pronto para Instalar'}
              {updateState === 'error' && 'Falha na Atualização'}
            </h4>
            <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
              {updateState === 'available' && `Uma nova versão (${versionInfo?.version || ''}) está disponível e o download iniciou.`}
              {updateState === 'downloading' && `Baixando nova versão... ${progress}% concluído.`}
              {updateState === 'downloaded' && (versionInfo?.isGitUpdate ? 'Novo commit detectado no Git. Instale para sincronizar o código-fonte.' : 'A nova versão foi baixada e está pronta. Instale agora para atualizar.')}
              {updateState === 'error' && `Não foi possível atualizar: ${errorMessage}`}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setDismissed(true)} 
          className="text-ink-secondary/60 hover:text-ink hover:bg-outline-variant/40 w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {updateState === 'downloading' && (
        <div className="w-full bg-outline-variant/30 h-2.5 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out shadow-sm" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}

      {updateState === 'downloaded' && (
        <div className="flex gap-3">
          <Button 
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="flex-1 text-[10px] tracking-widest font-bold uppercase"
          >
            Depois
          </Button>
          <Button 
            onClick={handleInstall}
            className="flex-1 text-[10px] tracking-widest font-bold uppercase bg-success text-white hover:bg-success/90 border-transparent shadow-md"
          >
            Instalar Agora
          </Button>
        </div>
      )}
    </div>
  );
}
