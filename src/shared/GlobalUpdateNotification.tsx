import { useState, useEffect } from 'react';

export default function GlobalUpdateNotification() {
  const [updateState, setUpdateState] = useState<'idle' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [versionInfo, setVersionInfo] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if we are running in Electron and have access to the API
    const api = (window as any).api;
    if (!api) return;

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
      console.error('[UPDATE] Erro:', err);
      setUpdateState('error');
      setErrorMessage(err || 'Erro desconhecido');
    });

    // Check for updates periodically (e.g. every 1 hour)
    const checkInterval = setInterval(() => {
      try {
        api.checkForUpdates();
      } catch (e) {
        console.error('Erro ao verificar atualizações:', e);
      }
    }, 60 * 60 * 1000);

    // Initial check on mount
    try {
      api.checkForUpdates();
    } catch (e) {}

    return () => {
      if (typeof cleanupAvailable === 'function') cleanupAvailable();
      if (typeof cleanupProgress === 'function') cleanupProgress();
      if (typeof cleanupDownloaded === 'function') cleanupDownloaded();
      if (typeof cleanupError === 'function') cleanupError();
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

  if (updateState === 'idle' || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-surface/95 backdrop-blur-md border border-outline-variant/60 rounded-3xl p-5 shadow-2xl animate-scale-in flex flex-col gap-4 font-sans text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            updateState === 'downloaded' ? 'bg-success/15 text-success' :
            updateState === 'error' ? 'bg-error/15 text-error' : 'bg-primary/15 text-primary'
          }`}>
            <span className="material-symbols-outlined font-black">
              {updateState === 'downloaded' ? 'check_circle' :
               updateState === 'error' ? 'warning' : 'update'}
            </span>
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
              {updateState === 'downloaded' && 'A nova versão foi baixada e está pronta. Instale agora para atualizar.'}
              {updateState === 'error' && `Não foi possível atualizar: ${errorMessage}`}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setDismissed(true)} 
          className="text-ink-secondary/60 hover:text-ink hover:bg-outline-variant/40 w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {updateState === 'downloading' && (
        <div className="w-full bg-outline-variant/30 h-2.5 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}

      {updateState === 'downloaded' && (
        <div className="flex gap-3">
          <button 
            onClick={() => setDismissed(true)}
            className="flex-1 py-2.5 bg-surface-variant hover:bg-outline-variant/50 text-ink rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            Depois
          </button>
          <button 
            onClick={handleInstall}
            className="flex-1 py-2.5 bg-success hover:bg-success-hover text-white rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-success/20 active:scale-95 transition-all"
          >
            Instalar Agora
          </button>
        </div>
      )}
    </div>
  );
}
