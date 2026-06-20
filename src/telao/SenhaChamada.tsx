import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../shared/apiConfig';
import Logo from '../shared/Logo';

interface SenhaChamadaProps {
  ultimaSenha?: {
    id: number;
    numero: string | number;
    guiche?: string;
    balcao_nome?: string;
    nome_cliente?: string;
    repeticao?: boolean;
  } | null;
  config?: any;
}

export default function SenhaChamada({ ultimaSenha = null, config: propConfig }: SenhaChamadaProps) {
  const [pulse, setPulse] = useState(false);
  const [config, setConfig] = useState<any>(propConfig || {});
  const [isRepeticao, setIsRepeticao] = useState(false);
  const repeticaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const API_URL = getApiUrl();

  useEffect(() => {
    if (propConfig) {
      setConfig(propConfig);
      return;
    }
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        const data = await res.json();
        setConfig(data);
      } catch (err) {}
    };
    fetchConfig();
  }, [propConfig, API_URL]);

  useEffect(() => {
    if (ultimaSenha) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [ultimaSenha]);

  useEffect(() => {
    if (!ultimaSenha) {
      setIsRepeticao(false);
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
      return;
    }

    if (ultimaSenha.repeticao) {
      setIsRepeticao(true);

      // Limpar timer anterior se existir
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }

      // Auto-reset após 8 segundos
      repeticaoTimerRef.current = setTimeout(() => {
        setIsRepeticao(false);
      }, 8000);
    } else {
      // Nova senha normal — resetar imediatamente
      setIsRepeticao(false);
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
    }

    return () => {
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
    };
  }, [ultimaSenha]);

  if (!ultimaSenha) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-12 relative overflow-hidden">
        {/* Glows */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-violet-500/10 rounded-full blur-[150px] pointer-events-none"></div>
        
        <Logo variant="vertical" darkMode={true} size={110} className="mb-12 animate-fade-in" />
        <div className="text-center z-10">
          <span className="font-syne text-3xl font-bold text-white/40 block uppercase tracking-[0.25em]">Atendimento</span>
          <span className="font-syne text-5xl font-black text-cyan-400 block uppercase mt-3 tracking-wide">{config.rotulo_atendimento_geral || 'Geral'}</span>
        </div>
      </div>
    );
  }

  const senhaFormatada = String(ultimaSenha.numero).padStart(3, '0');

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-12 relative overflow-hidden animate-fade-in">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-500 rounded-full blur-[180px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-cyan-500 rounded-full blur-[180px]"></div>
      </div>

      {/* Top Client Logo */}
      <div className="absolute top-10 left-10 opacity-90">
        {config.logo_cliente ? (
          <img src={`${API_URL}${config.logo_cliente}`} className="h-16 object-contain rounded-xl shadow-lg border border-slate-800" alt="Logo" />
        ) : (
          <Logo variant="horizontal" darkMode={true} size={48} />
        )}
      </div>

      <div className="text-center z-10">
        {isRepeticao && (
          <div className="badge-segunda-chamada flex items-center justify-center gap-2 mb-4">
            <span className="
              font-syne text-2xl font-black tracking-widest uppercase
              text-orange-500 border-2 border-orange-500
              px-8 py-2 rounded-full bg-orange-500/10
            ">
              ⚠ 2ª CHAMADA
            </span>
          </div>
        )}

        <h2 className="font-syne text-[2.5rem] font-bold text-white/40 tracking-[0.3em] uppercase mb-4">
          Senha Atual
        </h2>

        <div 
          key={`call-${ultimaSenha.id}-${isRepeticao}`}
          className={`font-syne text-[26rem] font-extrabold leading-none tracking-tighter ${
            isRepeticao
              ? 'text-orange-500 animate-pulse-orange'
              : `text-white ${pulse ? 'animate-pulse-call' : ''}`
          }`}
          style={{
            willChange: 'opacity, transform',
            transform: 'translateZ(0)',
            textShadow: isRepeticao 
              ? '0 0 50px rgba(249, 115, 22, 0.8)' 
              : '0 0 40px rgba(79, 70, 229, 0.4)'
          }}
        >
          {senhaFormatada}
        </div>

        {ultimaSenha.nome_cliente && (
          <div className="font-dmsans text-4xl font-medium text-white/80 mt-4 select-none">
            {ultimaSenha.nome_cliente}
          </div>
        )}

        {config.telao_ocultar_guiche !== '1' && (
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <div className="bg-slate-900/60 backdrop-blur-xl px-16 py-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center gap-2 border border-slate-800 shadow-indigo-500/10">
              {ultimaSenha.balcao_nome && (
                <span className="font-syne text-[2.5rem] font-bold text-cyan-400 uppercase tracking-widest leading-none mb-1">
                  {ultimaSenha.balcao_nome}
                </span>
              )}
              <span className="font-syne text-[5.5rem] font-extrabold text-white uppercase leading-none tracking-tighter text-center">
                {config.rotulo_local ? `${config.rotulo_local} ` : 'Guichê '}
                {(ultimaSenha.guiche || '').replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
