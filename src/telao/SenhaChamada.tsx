import { useState, useEffect, useRef } from 'react';
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
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-12 relative overflow-hidden">
        <div className="broadcast-scanlines" />
        <div className="broadcast-vignette" />
        {/* Glows using radial-gradients instead of expensive blur filters */}
        {!isLowPerformanceMode && (
          <>
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)' }}></div>
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)' }}></div>
          </>
        )}
        
        <Logo variant="vertical" darkMode={true} size={110} className="mb-12 animate-fade-in" />
        <div className="text-center z-10">
          <span className="font-syne text-3xl font-bold text-white/40 block uppercase tracking-[0.25em]">Atendimento</span>
          <span className="font-syne text-5xl font-black text-cyan-400 block uppercase mt-3 tracking-wide">{config.rotulo_atendimento_geral || 'Geral'}</span>
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
    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-12 relative overflow-hidden animate-fade-in">
      <div className="broadcast-scanlines" />
      <div className="broadcast-vignette" />

      {/* Background decoration using radial-gradients instead of expensive blur filters */}
      {!isLowPerformanceMode && (
        <div className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full" style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }}></div>
        </div>
      )}

      {/* Top Client Logo */}
      <div className="absolute top-10 left-10 opacity-90 z-10">
        {config.logo_cliente ? (
          <img src={`${API_URL}${config.logo_cliente}`} className="h-16 object-contain rounded-xl shadow-lg border border-slate-800" alt="Logo" />
        ) : (
          <Logo variant="horizontal" darkMode={true} size={48} />
        )}
      </div>

      <div className="text-center z-10 flex flex-col items-center justify-center">
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

        <h2 className="font-syne text-[2.5rem] font-bold text-white/40 tracking-[0.3em] uppercase mb-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          Senha Atual
        </h2>

        <div 
          key={`call-${ultimaSenha.id}-${isRepeticao}`}
          className={`font-syne text-[30rem] lg:text-[32rem] font-black leading-none tracking-wide transform scale-105 select-none ${
            isRepeticao
              ? 'text-orange-500'
              : 'text-white'
          }`}
          style={{
            textShadow: staticShadow,
            letterSpacing: '4px'
          }}
        >
          {senhaFormatada}
        </div>

        {ultimaSenha.nome_cliente && (
          <div className="font-dmsans text-4xl font-medium text-white/90 mt-4 select-none" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.8)' }}>
            {ultimaSenha.nome_cliente}
          </div>
        )}

        {config.telao_ocultar_guiche !== '1' && (
          <div className="mt-8 flex flex-col items-center justify-center text-center">
            {ultimaSenha.balcao_nome && (
              <span className="font-syne text-xl font-bold text-cyan-400 uppercase tracking-[0.25em] leading-none mb-2" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                {ultimaSenha.balcao_nome}
              </span>
            )}
            <span className="font-syne text-5xl font-extrabold text-white/90 uppercase leading-none tracking-wider text-center" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.6)' }}>
              {config.rotulo_local ? `${config.rotulo_local} ` : 'Guichê '}
              {(ultimaSenha.guiche || '').replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
