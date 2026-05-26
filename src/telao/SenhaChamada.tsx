import { useState, useEffect } from 'react';
import { getApiUrl } from '../shared/apiConfig';

export default function SenhaChamada({ ultimaSenha = null }: { ultimaSenha?: any }) {
  const [pulse, setPulse] = useState(false);
  const [config, setConfig] = useState<any>({});
  const API_URL = getApiUrl();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        const data = await res.json();
        setConfig(data);
      } catch (err) {}
    };
    fetchConfig();
  }, [API_URL]);

  useEffect(() => {
    if (ultimaSenha) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [ultimaSenha]);

  if (!ultimaSenha) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#041a14]">
        <div className="text-center">
          <span className="font-sans text-4xl font-bold text-white block uppercase">Atendimento</span>
          <span className="font-sans text-5xl font-black text-primary block uppercase mt-2">{config.rotulo_atendimento_geral || 'Geral'}</span>
        </div>
      </div>
    );
  }

  const senhaFormatada = String(ultimaSenha.numero).padStart(3, '0');

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[#041a14] p-12 relative overflow-hidden animate-fade-in">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[150px]"></div>
      </div>

      {/* Top Client Logo */}
      <div className="absolute top-10 left-10 opacity-50">
        {config.logo_cliente ? (
          <img src={`${API_URL}${config.logo_cliente}`} className="h-20 object-contain" alt="Logo" />
        ) : (
          <h2 className="font-sans text-4xl font-bold text-white uppercase tracking-widest">{config.nome_estabelecimento || 'ChamaAí'}</h2>
        )}
      </div>

      <div className="text-center z-10">
        <h2 className="font-sans text-[3rem] font-semibold text-white/50 tracking-[0.3em] uppercase mb-4">
          Senha Atual
        </h2>
        
        <div className={`font-sans text-[25rem] font-black leading-none tracking-tight text-white transition-all duration-300 drop-shadow-[0_0_50px_rgba(255,255,255,0.2)] ${pulse ? 'animate-pulse-call text-white' : ''}`}>
          {senhaFormatada}
        </div>

        {config.telao_ocultar_guiche !== '1' && (
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <div className="bg-white px-12 py-5 rounded-[32px] shadow-2xl flex flex-col items-center justify-center gap-2 border-b-[8px] border-outline-variant/30">
              {ultimaSenha.balcao_nome && (
                <span className="font-sans text-[2.5rem] font-black text-primary uppercase tracking-widest leading-none mb-1">
                  {ultimaSenha.balcao_nome}
                </span>
              )}
              <span className="font-sans text-[5rem] font-bold text-ink uppercase leading-none tracking-tighter text-center">
                {config.rotulo_local ? `${config.rotulo_local} ` : 'Guichê '}
                {ultimaSenha.guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
