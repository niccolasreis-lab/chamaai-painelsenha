interface LogoProps {
  className?: string;
  variant?: 'horizontal' | 'vertical' | 'iconOnly';
  darkMode?: boolean;
  size?: number;
}

export default function Logo({ className = '', variant = 'horizontal', darkMode = false, size }: LogoProps) {
  // Cores
  const textColor = darkMode ? '#FFFFFF' : '#1B1B24';
  const subtextColor = darkMode ? '#94A3B8' : '#64748B';
  const primaryIndigo = '#4F46E5';
  const electricCyan = '#06B6D4';

  const renderIcon = (iconSize: number) => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="ticketGrad" x1="15" y1="15" x2="105" y2="105" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={primaryIndigo} />
          <stop offset="100%" stopColor={electricCyan} />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Círculo de Fundo Suave (Sombra de Profundidade) */}
      <circle cx="60" cy="60" r="50" fill={primaryIndigo} fillOpacity="0.06" />
      
      {/* O Ticket de Fila Geométrico */}
      {/* Desenhado usando paths para ter o picote nas laterais (semicírculos recortados) */}
      <path
        d="M 25 35 
           A 5 5 0 0 1 30 30 
           L 90 30 
           A 5 5 0 0 1 95 35 
           L 95 52 
           A 8 8 0 0 0 87 60 
           A 8 8 0 0 0 95 68 
           L 95 85 
           A 5 5 0 0 1 90 90 
           L 30 90 
           A 5 5 0 0 1 25 85 
           L 25 68 
           A 8 8 0 0 0 33 60 
           A 8 8 0 0 0 25 52 
           Z"
        fill="url(#ticketGrad)"
        stroke={darkMode ? '#334155' : '#E2E8F0'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      
      {/* Linhas Internas Tecnológicas (Indicando a Senha / Número Chamado) */}
      <rect x="42" y="44" width="36" height="6" rx="3" fill="#FFFFFF" fillOpacity="0.95" />
      <rect x="42" y="56" width="24" height="6" rx="3" fill="#FFFFFF" fillOpacity="0.95" />
      
      {/* Conexão Digital (Linha de IA que sai do ticket com um nó final brilhante) */}
      <path
        d="M 68 59 L 80 59 L 83 62"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 3"
      />
      
      {/* Ponto de Conexão Inteligente (Glow no canto) */}
      <circle cx="83" cy="62" r="4" fill={electricCyan} stroke="#FFFFFF" strokeWidth="1" filter="url(#glow)" />
      
      {/* Linha que entra no ticket pela esquerda, representando a entrada na fila */}
      <path
        d="M 12 60 L 22 60"
        stroke={electricCyan}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="12" cy="60" r="2.5" fill={primaryIndigo} />
    </svg>
  );

  if (variant === 'iconOnly') {
    return renderIcon(size || 48);
  }

  if (variant === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        {renderIcon(size || 72)}
        <div className="mt-4">
          <span className="font-sans text-3xl font-black uppercase tracking-wider" style={{ color: textColor }}>
            Chama
            <span style={{ color: electricCyan }}>AI</span>
          </span>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] mt-1.5" style={{ color: subtextColor }}>
            Gestão Inteligente de Filas
          </p>
        </div>
      </div>
    );
  }

  // Horizontal por padrão
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      {renderIcon(size || 42)}
      <div className="flex flex-col justify-center leading-none">
        <span className="font-sans text-2xl font-black uppercase tracking-wide" style={{ color: textColor }}>
          Chama
          <span style={{ color: electricCyan }}>AI</span>
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: subtextColor }}>
          Gestão de Filas
        </span>
      </div>
    </div>
  );
}
