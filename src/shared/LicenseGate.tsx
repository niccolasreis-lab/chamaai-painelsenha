import { useState, useEffect } from 'react';
import { validateLicense } from './supabaseClient';

interface LicenseGateProps {
  children: React.ReactNode;
}

export default function LicenseGate({ children }: LicenseGateProps) {
  // Se NÃO está rodando no Electron (browser puro), libera direto sem verificar licença
  const isElectron = !!(window as any).api;

  const [isLocked, setIsLocked] = useState(isElectron); // browser = false (desbloqueado)
  const [isValidating, setIsValidating] = useState(isElectron); // browser = false (pronto)
  const [serialCode, setSerialCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Se for browser, não precisa verificar licença
    if (!isElectron) return;

    async function checkSavedLicense() {
      const savedKey = localStorage.getItem('app_license_key');
      
      if (!savedKey) {
        setIsValidating(false);
        return;
      }

      // Cache diário: se já validou hoje, liberar sem consultar o Supabase
      const today = new Date().toLocaleDateString('sv-SE'); // "2026-05-05"
      const lastCheck = localStorage.getItem('license_last_check');

      if (lastCheck === today) {
        // Já validou hoje, liberar direto
        setIsLocked(false);
        setIsValidating(false);
        return;
      }

      // Validar no Supabase (1x por dia)
      const result = await validateLicense(savedKey);
      
      if (result.isValid) {
        setIsLocked(false);
        localStorage.setItem('license_last_check', today);
        localStorage.setItem('license_last_success', today);
      } else {
        if (result.isNetworkError) {
          const lastSuccess = localStorage.getItem('license_last_success');
          if (lastSuccess) {
            const lastSuccessDate = new Date(lastSuccess).getTime();
            const todayDate = new Date(today).getTime();
            const diffDays = Math.floor((todayDate - lastSuccessDate) / (1000 * 3600 * 24));
            
            if (diffDays <= 7) {
              // Grace period: permite uso offline por até 7 dias sem internet
              console.warn(`[LicenseGate] Offline. Grace period ativo. Última validação com sucesso: ${diffDays} dias atrás.`);
              setIsLocked(false);
              setIsValidating(false);
              return;
            }
          }
        }
        setError(result.message || 'Licença inválida.');
        localStorage.removeItem('app_license_key');
        localStorage.removeItem('license_last_check');
      }
      setIsValidating(false);
    }

    checkSavedLicense();
  }, []);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialCode.trim()) return;

    setLoading(true);
    setError('');

    const result = await validateLicense(serialCode.trim());

    if (result.isValid) {
      const today = new Date().toLocaleDateString('sv-SE');
      localStorage.setItem('app_license_key', serialCode.trim());
      localStorage.setItem('license_last_check', today);
      localStorage.setItem('license_last_success', today);
      setIsLocked(false);
    } else {
      setError(result.message || 'Falha na ativação da licença.');
    }

    setLoading(false);
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans">
        <div className="w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-bold tracking-widest uppercase animate-pulse">Verificando Licença...</p>
      </div>
    );
  }

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans relative overflow-hidden p-4">
      {/* Background Decorativo */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-lg bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-10 shadow-2xl relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 bg-rose-500/10 rounded-3xl flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-rose-500 text-5xl">lock</span>
        </div>
        
        <h1 className="font-sans text-4xl font-bold text-white uppercase tracking-widest text-center mb-2">Sistema Bloqueado</h1>
        <p className="text-slate-400 font-medium text-center mb-8">
          Por favor, insira uma chave de licença válida para liberar o uso do aplicativo.
        </p>

        {error && (
          <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold p-4 rounded-xl text-center mb-6">
            <span className="material-symbols-outlined align-middle mr-2 text-lg">warning</span>
            {error}
          </div>
        )}

        <form onSubmit={handleActivate} className="w-full flex flex-col gap-4">
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Serial Key</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500">key</span>
              <input
                type="text"
                value={serialCode}
                onChange={(e) => setSerialCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors uppercase tracking-widest"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                required
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !serialCode.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sans text-xl font-bold uppercase tracking-widest py-4 rounded-xl mt-2 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">refresh</span>
            ) : (
              <>
                Ativar Sistema
                <span className="material-symbols-outlined text-lg">check_circle</span>
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center text-slate-500 text-xs font-bold uppercase tracking-widest">
          <p>
            Dúvidas?{' '}
            <a href="https://chamaai-nine.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 underline decoration-blue-500/30 underline-offset-4 transition-colors">
              Acesse nosso suporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
