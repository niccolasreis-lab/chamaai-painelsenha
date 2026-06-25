import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import type { EstablishmentConfig } from '../shared/types';

interface TelaoEsperaProps {
  code: string;
}

export default function TelaoEspera({ code }: TelaoEsperaProps) {
  const [config, setConfig] = useState<Partial<EstablishmentConfig>>({});
  const [copied, setCopied] = useState(false);
  const [showIpModal, setShowIpModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const API_URL = getApiUrl();
  const isLowPerformanceMode = 
    localStorage.getItem('telao_low_performance') === '1' || 
    new URLSearchParams(window.location.search).get('low_perf') === '1' ||
    new URLSearchParams(window.location.search).get('low_performance') === '1';

  const handleSaveIp = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    setShowIpModal(false);
    window.location.reload();
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações', err);
      }
    };
    fetchConfig();
  }, [API_URL]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (error) {
          console.error('Fallback copy failed', error);
        } finally {
          textArea.remove();
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar código:', err);
    }
  }, [code]);

  return (
    <div className="h-screen w-screen bg-[#041a14] text-white flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans select-none">
      {/* Dynamic Background Glows using radial-gradients instead of expensive blur filters */}
      {!isLowPerformanceMode && (
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
          <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)' }}></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, transparent 70%)' }}></div>
        </div>
      )}

      {/* Glassmorphic Card Container */}
      <div className={`z-10 max-w-2xl w-full bg-white/[0.03] ${isLowPerformanceMode ? '' : 'backdrop-blur-xl'} border border-white/10 rounded-[40px] p-12 shadow-2xl flex flex-col items-center text-center gap-8 relative`}>
        {/* Subtle decorative glow around the box */}
        {!isLowPerformanceMode && (
          <div className="absolute inset-0 -z-10 rounded-[40px] bg-gradient-to-br from-emerald-500/5 to-teal-500/5 blur-md"></div>
        )}

        {/* Branding Area */}
        <div className="flex flex-col items-center gap-4">
          {config.logo_cliente ? (
            <img 
              src={`${API_URL}${config.logo_cliente}`} 
              className="h-28 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]" 
              alt="Logo Estabelecimento" 
            />
          ) : (
            <div className="flex flex-col items-center">
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 uppercase tracking-tighter leading-none">ChamaAí</h1>
              <p className="text-emerald-400/60 font-bold uppercase tracking-[0.2em] text-xs mt-1">Fila & Painel Digital</p>
            </div>
          )}
          {config.nome_estabelecimento && config.logo_cliente && (
            <h2 className="text-2xl font-bold text-white/90 uppercase tracking-wider mt-2 border-t border-white/10 pt-2 px-6">
              {config.nome_estabelecimento}
            </h2>
          )}
        </div>

        {/* Separator Line */}
        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

        {/* Code Display Area */}
        <div className="flex flex-col items-center gap-3 w-full">
          <span className={`text-xs font-black uppercase tracking-[0.3em] transition-all duration-300 ${copied ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-white/50'}`}>
            {copied ? 'Código Copiado!' : 'Código de Vinculação'}
          </span>
          
          {/* Giant Monospace Glowing Code */}
          <div 
            onClick={handleCopy}
            title="Clique para copiar o código"
            className={`bg-black/40 border rounded-[32px] px-12 py-6 relative overflow-hidden shadow-inner group cursor-pointer transition-all duration-300 active:scale-[0.98] ${copied ? 'border-emerald-500/50 bg-black/60' : 'border-white/10 hover:border-emerald-500/30 hover:bg-black/60'}`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 transition-opacity duration-300 ${copied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}></div>
            <span className="font-mono text-[7.5rem] font-black tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/90 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)] pl-4 pointer-events-none">
              {code || '------'}
            </span>
          </div>
        </div>

        {/* Instructions */}
        <div className="flex flex-col gap-2 max-w-md">
          <h3 className="text-lg font-bold text-white/90 uppercase tracking-wide">Como Vincular?</h3>
          <p className="text-sm text-white/50 font-medium leading-relaxed">
            Abra o painel administrativo em outro dispositivo, acesse a página de <strong className="text-emerald-400 font-bold">Dispositivos / Devices</strong> e digite o código de 6 dígitos acima para liberar este telão.
          </p>
        </div>

        {/* Real-time Listening Indicator and Connection Setup */}
        <div className="flex flex-col items-center gap-3 mt-4 w-full">
          <div className="flex items-center gap-3 bg-emerald-500/10 px-6 py-3 rounded-full border border-emerald-500/20 animate-pulse">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              Aguardando vinculação em tempo real...
            </span>
          </div>

          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => setShowIpModal(true)}
              className="text-[10px] text-white/40 hover:text-white/80 font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors cursor-pointer outline-none"
            >
              <span className="material-symbols-outlined text-xs">hub</span>
              Configurar Conexão (Atual: {localStorage.getItem('server_ip_override') || 'Localhost'})
            </button>
            <span className="text-white/20 text-[10px] font-bold">|</span>
            <Link
              to="/"
              onClick={() => localStorage.removeItem('app_mode')}
              className="text-[10px] text-white/40 hover:text-white/80 font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors cursor-pointer outline-none"
            >
              <span className="material-symbols-outlined text-xs">arrow_back</span>
              Voltar ao Menu
            </Link>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-6 left-0 right-0 text-center text-[10px] text-white/20 font-bold uppercase tracking-[0.3em] z-10">
        ChamaAí Screen Engine • v1.0.38
      </div>

      {/* Connection IP Setup Modal */}
      {showIpModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1612] border border-emerald-900/30 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative text-left">
            <div>
              <h3 className="font-sans text-2xl font-bold text-white uppercase mb-2">Conectar ao Servidor</h3>
              <p className="text-sm font-sans text-white/60 font-medium">
                Digite o endereço IP do computador onde está rodando o Servidor Principal (Telão) para que esta TV se comunique com ele.
              </p>
            </div>
            <div>
              <label className="block font-bold tracking-widest text-emerald-400 uppercase mb-2 text-xs">IP do Servidor (Telão)</label>
              <input 
                type="text" 
                value={tempIp}
                onChange={(e) => setTempIp(e.target.value)}
                placeholder="Ex: 192.168.1.100"
                className="w-full bg-[#050d0a] border border-emerald-950 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-white font-bold text-lg placeholder:text-white/10"
                autoFocus
              />
              <p className="text-[10px] text-white/40 mt-2 font-semibold uppercase tracking-wider">
                Deixe em branco para conectar localmente (Localhost).
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowIpModal(false)}
                className="flex-1 py-4 bg-[#050d0a] hover:bg-white/5 text-white/60 border border-emerald-950 rounded-xl font-bold uppercase tracking-widest text-sm transition-all"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleSaveIp}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl font-bold uppercase tracking-widest text-sm transition-all shadow-lg shadow-emerald-900/20"
              >
                Salvar IP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
