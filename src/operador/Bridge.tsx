import { useState, useEffect } from 'react';
import { setServerIp } from '../shared/apiConfig';
import packageJson from '../../package.json';

export default function Bridge() {
  const [ip, setIp] = useState(localStorage.getItem('server_ip_override') || '');
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

  const handleConnect = () => {
    if (!ip) {
      setServerIp('');
      return;
    }
    setServerIp(ip);
  };

  return (
    <div className="min-h-[100dvh] bg-[#020617] text-white flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      {deferredPrompt && (
        <button 
          onClick={handleInstall}
          className="fixed top-6 right-6 z-50 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl shadow-blue-600/20 animate-bounce"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          INSTALAR APP
        </button>
      )}

      <div className="w-full max-w-md z-10 flex flex-col items-center">
        {/* Logo Section */}
        <div className="mb-12 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-600/40 mb-6 rotate-3">
            <span className="material-symbols-outlined text-5xl font-bold">hub</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-2 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
            CONECTOR <span className="text-blue-500">CHAMA<span className="italic">AÍ</span></span>
          </h1>
          <p className="text-slate-400 font-medium uppercase tracking-[0.2em] text-[10px]">Ponte de Conexão Mobile</p>
        </div>

        {/* Card */}
        <div className="w-full bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[40px] p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          <div className="mb-8">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 ml-2">
              Endereço IP do Servidor
            </label>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-500 group-focus-within:text-blue-500 transition-colors">
                lan
              </span>
              <input 
                type="text" 
                placeholder="Ex: 192.168.1.100"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-xl font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-700"
              />
            </div>
            <p className="mt-4 text-[10px] text-slate-500 leading-relaxed px-2">
              Digite o endereço IP que aparece na tela principal do sistema (PC do Telão).
            </p>
          </div>

          {/* Status Indicator */}
          {status !== 'idle' && (
            <div className={`mb-8 p-4 rounded-2xl flex items-start gap-3 animate-in zoom-in duration-300 ${
              status === 'testing' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
              status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              <span className={`material-symbols-outlined mt-0.5 ${status === 'testing' ? 'animate-spin' : ''}`}>
                {status === 'testing' ? 'sync' : status === 'success' ? 'check_circle' : 'error'}
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
            <button 
              onClick={handleConnect}
              disabled={status === 'testing'}
              className="w-full bg-white/10 hover:bg-white/20 text-white transition-all py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 border border-white/10 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-xl">sync</span>
              Salvar e Testar Conexão
            </button>

            {status === 'success' && (
              <div className="pt-4 space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10"></span></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black text-slate-500"><span className="bg-[#020617] px-4">Selecionar Interface</span></div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => window.location.hash = '/mobile'}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all py-5 rounded-2xl font-black text-lg flex items-center justify-between px-8 shadow-xl shadow-blue-600/20 group"
                  >
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-3xl">smartphone</span>
                      <div className="text-left">
                        <p className="leading-none">MOBILE</p>
                        <p className="text-[10px] font-medium opacity-60 mt-1">Vertical • Smartphone</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </button>

                  <button 
                    onClick={() => window.location.hash = '/operador-touch'}
                    className="w-full bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all py-5 rounded-2xl font-black text-lg flex items-center justify-between px-8 border border-white/5 group"
                  >
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-3xl">tablet_landscape</span>
                      <div className="text-left">
                        <p className="leading-none">TOUCH TV</p>
                        <p className="text-[10px] font-medium opacity-60 mt-1">Horizontal • Tablet/TV</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center opacity-40">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em]">
            CHAMAAÍ V{packageJson.version} • MOBILE BRIDGE
          </p>
        </div>
      </div>
    </div>
  );
}
