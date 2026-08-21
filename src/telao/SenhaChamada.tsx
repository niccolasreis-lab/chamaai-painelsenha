import { useState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import Logo from '../shared/Logo';
import type { RecentCall, EstablishmentConfig } from '../shared/types';

interface SenhaChamadaProps {
  ultimaSenha?: RecentCall | null;
  config?: Partial<EstablishmentConfig> | null;
}

export default function SenhaChamada({ ultimaSenha = null, config: propConfig }: SenhaChamadaProps) {
  const [fetchedConfig, setFetchedConfig] = useState<Partial<EstablishmentConfig> | null>(null);
  const [prevTicket, setPrevTicket] = useState<{ id: string | number; repeticao?: boolean } | null>(null);
  const [isRepeticao, setIsRepeticao] = useState(false);
  const repeticaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const API_URL = getApiUrl();

  // Adjust state during render to avoid cascading renders
  if (ultimaSenha && (!prevTicket || prevTicket.id !== ultimaSenha.id)) {
    setPrevTicket({ id: ultimaSenha.id, repeticao: ultimaSenha.repeticao });
    setIsRepeticao(!!ultimaSenha.repeticao);
  }

  useEffect(() => {
    if (propConfig) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        const data = await res.json();
        setFetchedConfig(data);
      } catch (err) {
        console.error('[SenhaChamada] Erro ao buscar config', err);
      }
    };
    fetchConfig();
  }, [propConfig, API_URL]);

  const config = propConfig || fetchedConfig || {};

  useEffect(() => {
    if (isRepeticao) {
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
      repeticaoTimerRef.current = setTimeout(() => {
        setIsRepeticao(false);
      }, 8000);
    } else {
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
    }

    return () => {
      if (repeticaoTimerRef.current) {
        clearTimeout(repeticaoTimerRef.current);
      }
    };
  }, [isRepeticao]);

  const isLowPerformanceMode = 
    localStorage.getItem('telao_low_performance') === '1' || 
    new URLSearchParams(window.location.search).get('low_perf') === '1' ||
    new URLSearchParams(window.location.search).get('low_performance') === '1';

  if (!ultimaSenha) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-[clamp(1rem,4vmin,3rem)] relative overflow-hidden">
        {/* Glows using radial-gradients instead of expensive blur filters */}
        {!isLowPerformanceMode && (
          <>
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)' }}></div>
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)' }}></div>
          </>
        )}
        
        <Logo variant="vertical" darkMode={true} size={110} className="mb-[clamp(1.5rem,5vh,3rem)] max-h-[22vh] animate-fade-in" />
        <div className="text-center z-10">
          <span className="font-syne text-[clamp(1rem,2.2vw,1.875rem)] font-bold text-white/60 block uppercase tracking-[0.18em]">Atendimento</span>
          <span className="font-syne text-[clamp(2rem,4vw,3rem)] font-black text-cyan-400 block uppercase mt-3 tracking-wide text-balance">{config.rotulo_atendimento_geral || 'Geral'}</span>
        </div>
      </div>
    );
  }

  const senhaFormatada = String(ultimaSenha.numero).padStart(3, '0');
  const staticShadow = `
    0 2px 0 rgba(0,0,0,0.4),
    0 10px 30px rgba(0,0,0,0.6),
    0 0 60px rgba(0,0,0,0.3)
  `.trim().replace(/\s+/g, ' ');

  return (
    <section
      className="h-full min-h-0 w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-[clamp(1rem,3.5vmin,3rem)] relative overflow-hidden animate-fade-in"
      aria-live="assertive"
      aria-label={`Senha ${senhaFormatada} chamada`}
    >
      {/* Background decoration using radial-gradients instead of expensive blur filters */}
      {!isLowPerformanceMode && (
        <div className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }}></div>
        </div>
      )}

      {/* Top Client Logo */}
      <div className="absolute top-[clamp(1rem,3vmin,2.5rem)] left-[clamp(1rem,3vmin,2.5rem)] opacity-90 z-10 max-w-[28vw]">
        {config.logo_cliente ? (
          <img src={`${API_URL}${config.logo_cliente}`} className="h-[clamp(2.5rem,7vh,4rem)] max-w-full object-contain rounded-lg border border-slate-800" alt="Logo" />
        ) : (
          <Logo variant="horizontal" darkMode={true} size={48} />
        )}
      </div>

      <div className="text-center z-10 h-full min-h-0 w-full flex flex-col items-center justify-center gap-[clamp(0.35rem,1.4vh,1rem)] pt-[clamp(2.5rem,6vh,4.5rem)]">
        {isRepeticao && (
          <div className="badge-segunda-chamada flex items-center justify-center gap-2">
            <span className="
              font-syne text-[clamp(0.875rem,1.8vw,1.5rem)] font-black tracking-[0.12em] uppercase
              text-orange-500 border-2 border-orange-500
              px-[clamp(1rem,3vw,2rem)] py-[clamp(0.35rem,1vh,0.5rem)] rounded-full bg-orange-500/10
              flex items-center gap-2
            ">
              <AlertTriangle className="h-[1em] w-[1em]" aria-hidden="true" /> 2ª CHAMADA
            </span>
          </div>
        )}

        <h2 className="font-syne text-[clamp(1rem,2.4vw,2.5rem)] font-bold text-white/60 tracking-[0.18em] uppercase leading-none" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          Senha Atual
        </h2>

        <div 
          key={`call-${ultimaSenha.id}-${isRepeticao}`}
          data-testid="called-ticket-number"
          className={`font-syne font-black leading-[0.82] tabular-nums max-w-full whitespace-nowrap select-none ${
            isRepeticao
              ? 'text-orange-500 animate-pulse-orange'
              : 'text-white animate-pulse-call-once'
          }`}
          style={{
            textShadow: staticShadow,
            fontSize: 'clamp(7rem, min(42vw, 44vh), 58rem)',
            letterSpacing: 'clamp(0px, 0.25vw, 4px)'
          }}
        >
          {senhaFormatada}
        </div>

        {ultimaSenha.nome_cliente && (
          <div className="font-dmsans text-[clamp(1.25rem,3vw,2.25rem)] leading-tight font-medium text-white/90 max-w-[85vw] truncate select-none" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.8)' }}>
            {ultimaSenha.nome_cliente}
          </div>
        )}

        {config.telao_ocultar_guiche !== '1' && (
          <div className="mt-[clamp(0.25rem,1.5vh,1rem)] flex flex-col items-center justify-center text-center max-w-[92vw]">
            {ultimaSenha.balcao_nome && (
              <span className="font-syne text-[clamp(0.875rem,1.8vw,1.25rem)] font-bold text-cyan-400 uppercase tracking-[0.16em] leading-none mb-2 text-balance" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {ultimaSenha.balcao_nome}
              </span>
            )}
            <span className="font-syne text-[clamp(1.75rem,4.5vw,3.75rem)] font-extrabold text-white/90 uppercase leading-[1.05] tracking-[0.06em] text-center text-balance" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.6)' }}>
              {config.rotulo_local ? `${config.rotulo_local} ` : 'Guichê '}
              {(ultimaSenha.guiche || '').replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
