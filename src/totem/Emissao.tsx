import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Printer, 
  Delete, 
  Pointer, 
  WifiOff, 
  Network, 
  Users, 
  Ticket, 
  ArrowLeft 
} from 'lucide-react';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';
import Logo from '../shared/Logo';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';

export default function Emissao() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>({});
  const [pessoasAguardando, setPessoasAguardando] = useState(0);
  const [saudacao, setSaudacao] = useState('BEM-VINDO(A)');

  // White-Labeling e Totem adicionais
  const [showNameModal, setShowNameModal] = useState(false);
  const [preferencialForName, setPreferencialForName] = useState(false);
  const [clienteNome, setClienteNome] = useState('');
  const [isIdle, setIsIdle] = useState(false);
  const [midias, setMidias] = useState<any[]>([]);
  const [activeMidiaIdx, setActiveMidiaIdx] = useState(0);
  const [screensaverTime, setScreensaverTime] = useState(new Date());
  
  const idleTimerRef = useRef<any>(null);
  const isFetching = useRef(false);

  const API_URL = getApiUrl();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [error, setError] = useState(false);
  const [printerError, setPrinterError] = useState<{ visible: boolean; message: string; senhaNumero?: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    const atualizarSaudacao = () => {
      const horaAtual = new Date().getHours();
      let novaSaudacao = 'BEM-VINDO(A)';

      if (horaAtual >= 5 && horaAtual < 12) {
        novaSaudacao = 'BOM DIA!';
      } else if (horaAtual >= 12 && horaAtual < 18) {
        novaSaudacao = 'BOA TARDE!';
      } else {
        novaSaudacao = 'BOA NOITE!';
      }
      setSaudacao(novaSaudacao);
    };

    atualizarSaudacao();
    const interval = setInterval(atualizarSaudacao, 3600000);
    return () => clearInterval(interval);
  }, []);

  const fetchConfig = async () => {
    try {
      setError(false);
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConfig(data);
      if (data.totem_screensaver_ativo === '1') {
        fetchMidias();
      }
    } catch (err) {
      console.error('Erro ao carregar configurações', err);
      setError(true);
    }
  };

  const fetchFila = async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      const res = await fetch(`${API_URL}/api/fila`);
      const data = await res.json();
      setPessoasAguardando(Array.isArray(data) ? data.length : 0);
    } catch (err) {
    } finally {
      isFetching.current = false;
    }
  };

  const fetchMidias = async () => {
    try {
      const res = await fetch(`${API_URL}/api/midias`);
      if (res.ok) {
        const data = await res.json();
        const activeMidias = Array.isArray(data)
          ? data.filter((m: any) => m.ativo === 1 && m.status === 'ativo')
          : [];
        setMidias(activeMidias);
      }
    } catch (e) {
      console.error('Erro ao buscar mídias para screensaver:', e);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [API_URL]);

  useEffect(() => {
    if (isIdle) return;

    fetchFila();
    const interval = setInterval(fetchFila, 15000);
    return () => clearInterval(interval);
  }, [API_URL, isIdle]);

  // Sincronização em tempo real via SSE
  const { data: sseEvent } = useSSE(`${API_URL}/events`);

  useEffect(() => {
    if (!sseEvent) return;

    if (sseEvent.event === 'NOVA_SENHA_EMITIDA' || sseEvent.event === 'NOVA_SENHA_CHAMADA' || sseEvent.event === 'SISTEMA_RESETADO') {
      if (!isIdle) fetchFila();
    } else if (sseEvent.event === 'RECARREGAR_PAGINA') {
      window.location.reload();
    }
  }, [sseEvent, isIdle]);

  // Idle Timer Watcher para Screensaver
  useEffect(() => {
    if (config.totem_screensaver_ativo !== '1') {
      setIsIdle(false);
      return;
    }

    const timeoutSec = parseInt(config.totem_screensaver_timeout || '120', 10);

    const resetTimer = () => {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, timeoutSec * 1000);
    };

    resetTimer();

    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [config.totem_screensaver_ativo, config.totem_screensaver_timeout]);

  // Rotação de mídia no Screensaver
  useEffect(() => {
    if (!isIdle || midias.length === 0) return;

    const intervalSec = parseInt(config.totem_screensaver_intervalo || '10', 10);
    const interval = setInterval(() => {
      setActiveMidiaIdx(prev => (prev + 1) % midias.length);
    }, intervalSec * 1000);

    return () => clearInterval(interval);
  }, [isIdle, midias, config.totem_screensaver_intervalo]);

  // Atualização da hora no Screensaver
  useEffect(() => {
    if (!isIdle) return;
    const interval = setInterval(() => {
      setScreensaverTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isIdle]);

  const handleSaveIp = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    window.location.reload();
  };

  const handleReprint = async () => {
    if (!window.api?.reprintLastTicket) return;
    const result = await window.api.reprintLastTicket();
    if (result.success) {
      setPrinterError({ visible: false, message: '' });
    } else {
      setPrinterError(prev => ({ ...prev, message: result.error || 'Falha ao reimprimir.' }));
    }
  };

  const emitirSenhaComNome = async (preferencial: boolean, nome: string) => {
    try {
      const res = await fetch(`${API_URL}/api/senhas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balcao_id: 1, preferencial, nome_cliente: nome.trim() || null })
      });
      const data = await res.json();

      // Redireciona imediatamente — senha já está registrada no banco
      navigate('/totem/confirmacao', { state: { senha: data } });

      // Dispara a impressão e verifica o resultado
      if (window.api?.printTicket) {
        window.api.printTicket({
          ticketId: data.id,
          numero: String(data.numero).padStart(3, '0'),
          balcao: config.nome_estabelecimento || 'Balcão Geral',
          data: new Date().toLocaleString('pt-BR'),
          preferencial: data.preferencial,
          nome_cliente: data.nome_cliente || undefined,
          logo: config.logo_cliente ? `${API_URL}${config.logo_cliente}` : undefined,
          mostraEncarte: config.toledo_encarte_ativo === '1'
        }).then(result => {
          if (!result.success) {
            setPrinterError({
              visible: true,
              message: result.error || 'Falha desconhecida na impressora.',
              senhaNumero: String(data.numero).padStart(3, '0'),
            });
          }
        }).catch(err => console.error('Erro na impressão', err));
      }
    } catch (err) {
      console.error('Erro ao emitir senha', err);
      alert('Erro de conexão ao emitir senha. Tente novamente.');
    }
  };

  const handleBotaoEmitir = (preferencial: boolean) => {
    if (config.totem_solicita_nome === '1') {
      setPreferencialForName(preferencial);
      setClienteNome('');
      setShowNameModal(true);
    } else {
      emitirSenhaComNome(preferencial, '');
    }
  };

  // Componente Modal de IP
  const ConfigModal = () => {
    return (
      <Dialog
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Configuração de Rede"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-variant font-medium">Digite o IP ou o Nome do computador principal (Telão) para conectar este totem.</p>
          <Input 
            type="text" 
            label="ENDEREÇO DO SERVIDOR"
            value={tempIp}
            onChange={(e) => setTempIp(e.target.value)}
            placeholder="Ex: 192.168.1.100 ou NOME-DO-PC"
            autoFocus
          />
          <div className="flex gap-4 mt-2">
            <Button 
              onClick={() => setShowConfigModal(false)}
              variant="secondary"
              className="flex-1 py-3 font-bold uppercase tracking-widest text-sm"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveIp}
              className="flex-1 py-3 font-bold uppercase tracking-widest text-sm"
            >
              Conectar
            </Button>
          </div>
        </div>
      </Dialog>
    );
  };

  // Modal de erro da impressora
  const PrinterErrorModal = () => {
    return (
      <Dialog
        open={printerError.visible}
        onClose={() => setPrinterError({ visible: false, message: '' })}
        title="Falha na Impressão"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
            <Printer className="h-10 w-10 text-error" />
          </div>
          <p className="text-ink-variant font-medium text-sm">{printerError.message}</p>
          {printerError.senhaNumero && (
            <div className="bg-surface-variant/50 rounded-md px-6 py-4 w-full border border-outline-variant/30">
              <p className="text-xs text-ink-variant uppercase tracking-widest mb-1">Sua Senha</p>
              <p className="font-sans text-5xl font-black text-primary tracking-tighter">{printerError.senhaNumero}</p>
              <p className="text-xs text-ink-variant mt-1">Anote o número acima</p>
            </div>
          )}
          <div className="flex flex-col gap-3 w-full mt-2">
            <Button
              onClick={handleReprint}
              className="w-full py-4 font-bold uppercase tracking-widest text-sm"
              icon={<Printer className="h-5 w-5" />}
            >
              Tentar Reimprimir
            </Button>
            <Button
              onClick={() => setPrinterError({ visible: false, message: '' })}
              variant="secondary"
              className="w-full py-4 font-bold uppercase tracking-widest text-sm"
            >
              Visualizar Número na Tela
            </Button>
          </div>
        </div>
      </Dialog>
    );
  };

  // Keyboard layout helper
  const renderTeclado = () => {
    const linhas = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];

    const handleKeyClick = (char: string) => {
      if (clienteNome.length < 25) {
        setClienteNome(prev => prev + char);
      }
    };

    const handleBackspace = () => {
      setClienteNome(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
      setClienteNome('');
    };

    return (
      <div className="w-full max-w-2xl bg-surface-variant/40 p-6 rounded-md flex flex-col gap-3 border border-outline-variant/30 select-none">
        {linhas.map((linha, idx) => (
          <div key={idx} className="flex justify-center gap-2">
            {linha.map(char => (
              <button
                key={char}
                onClick={() => handleKeyClick(char)}
                className="w-12 h-14 bg-surface border border-outline-variant hover:bg-surface-container-low text-ink rounded-lg font-bold text-xl flex items-center justify-center active:scale-95 transition-all outline-none"
              >
                {char}
              </button>
            ))}
          </div>
        ))}
        {/* Ultima linha de controle */}
        <div className="flex justify-center gap-2">
          <Button
            onClick={handleClear}
            variant="danger"
            className="px-6 h-14 font-bold text-sm"
          >
            Limpar
          </Button>
          <Button
            onClick={() => handleKeyClick(' ')}
            variant="secondary"
            className="flex-1 h-14 font-bold text-lg"
          >
            Espaço
          </Button>
          <Button
            onClick={handleBackspace}
            variant="secondary"
            className="px-6 h-14 font-bold text-sm"
            icon={<Delete className="h-4 w-4" />}
          >
            Apagar
          </Button>
        </div>
      </div>
    );
  };

  // Modal para solicitar o nome
  const NomeModal = () => {
    return (
      <Dialog 
        open={showNameModal} 
        onClose={() => setShowNameModal(false)}
        maxWidth="max-w-3xl"
      >
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h3 className="font-sans text-2xl sm:text-3xl font-black text-ink uppercase tracking-wider mb-2">Como podemos chamar você?</h3>
            <p className="text-sm sm:text-base font-sans text-ink-variant font-medium">Informe seu nome (opcional) para exibição e chamada por voz no Telão.</p>
          </div>

          <div className="w-full max-w-xl">
            <Input 
              type="text" 
              label="Seu Nome"
              value={clienteNome}
              readOnly
              placeholder="Digite seu nome no teclado abaixo..."
              className="text-center font-black text-2xl tracking-wide uppercase"
            />
          </div>

          {renderTeclado()}

          <div className="flex gap-4 w-full max-w-2xl mt-4">
            <Button 
              onClick={() => {
                setShowNameModal(false);
                emitirSenhaComNome(preferencialForName, '');
              }}
              variant="secondary"
              className="flex-1 py-4 font-bold uppercase tracking-widest text-sm"
            >
              Pular e Emitir
            </Button>
            <Button 
              onClick={() => {
                setShowNameModal(false);
                emitirSenhaComNome(preferencialForName, clienteNome);
              }}
              className="flex-1 py-4 font-bold uppercase tracking-widest text-sm"
            >
              Confirmar e Emitir
            </Button>
          </div>
        </div>
      </Dialog>
    );
  };

  // Renderização do Screensaver
  if (isIdle) {
    const modoScreensaver = config.totem_screensaver_modo || 'ambos';
    const temMidias = midias.length > 0;
    const midiaAtiva = temMidias ? midias[activeMidiaIdx] : null;

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (date: Date) => {
      const d = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      return d.charAt(0).toUpperCase() + d.slice(1);
    };

    return (
      <div 
        onClick={() => setIsIdle(false)}
        className="h-screen w-screen bg-black flex flex-col items-center justify-center fixed inset-0 z-50 select-none cursor-pointer animate-fade-in"
      >
        {/* Renderização de Mídia (Modo 'midia' ou 'ambos') */}
        {(modoScreensaver === 'midia' || modoScreensaver === 'ambos') && midiaAtiva && (
          <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
            {midiaAtiva.tipo === 'video' ? (
              <video 
                key={midiaAtiva.id}
                src={`${API_URL}${midiaAtiva.caminho}`} 
                className="w-full h-full object-cover animate-fade-in"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
            ) : (
              <img 
                key={midiaAtiva.id}
                src={`${API_URL}${midiaAtiva.caminho}`} 
                alt={midiaAtiva.nome}
                className="w-full h-full object-cover animate-fade-in"
              />
            )}
          </div>
        )}

        {/* Fundo Escuro para Modo Apenas Relógio */}
        {modoScreensaver === 'relogio' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950 z-0"></div>
        )}

        {/* Renderização do Relógio (Modo 'relogio' ou 'ambos') */}
        {(modoScreensaver === 'relogio' || modoScreensaver === 'ambos') && (
          <div className={`z-10 text-center font-sans text-white ${modoScreensaver === 'ambos' ? 'bg-black/60 backdrop-blur-md px-12 py-8 rounded-[2rem] border border-white/10 shadow-2xl mx-6' : ''}`}>
            <h1 className="text-[6rem] sm:text-[8rem] font-black tracking-tighter leading-none mb-4 font-mono select-none drop-shadow-lg">
              {formatTime(screensaverTime)}
            </h1>
            <p className="text-lg sm:text-xl font-bold uppercase tracking-widest text-white/80 select-none drop-shadow-sm">
              {formatDate(screensaverTime)}
            </p>
          </div>
        )}

        {/* Overlay flutuante informativo */}
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-md px-10 py-5 rounded-full border border-white/20 text-white font-sans text-2xl font-bold uppercase tracking-widest flex items-center gap-3 animate-pulse z-10">
          <Pointer className="h-8 w-8 text-white" />
          Toque na tela para iniciar
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8 text-center font-sans">
        <ConfigModal />
        <WifiOff className="h-24 w-24 text-error mb-4" />
        <h2 className="text-4xl font-sans font-bold text-ink uppercase mb-2">Servidor não encontrado</h2>
        <p className="text-xl text-ink-variant mb-8 max-w-md">Não conseguimos conectar ao PC principal ({API_URL}). Verifique se o Telão está aberto e se o IP está correto.</p>
        
        <Button 
          onClick={() => setShowConfigModal(true)}
          className="px-10 py-5 text-lg font-bold uppercase tracking-widest shadow-xl flex items-center gap-3"
          icon={<Network className="h-6 w-6" />}
        >
          Configurar IP do Servidor
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background flex flex-col font-sans select-none overflow-hidden fixed inset-0">
      <PrinterErrorModal />
      <NomeModal />
      
      {/* Header */}
      <header className="bg-primary text-on-primary py-6 shadow-md flex justify-center items-center border-b-[6px] border-primary-hover shrink-0">
        <h1 className="font-sans text-5xl font-bold uppercase tracking-widest flex items-center gap-6">
          {config.logo_cliente ? (
            <img 
              src={`${API_URL}${config.logo_cliente}`} 
              alt="Logo" 
              className="h-20 w-auto object-contain bg-white/10 rounded-2xl p-2"
            />
          ) : (
            <Logo variant="horizontal" darkMode={true} size={54} />
          )}
        </h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start xl:justify-center p-4 md:p-6 gap-6 lg:gap-8 overflow-y-auto scrollbar-hide w-full">
        <div className="text-center shrink-0 flex flex-col items-center mt-4">
          <h2 id="titulo-saudacao" className="font-syne text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-ink mb-2 uppercase tracking-wide">
            {saudacao}
          </h2>
          <p className="font-dmsans text-xl sm:text-2xl md:text-3xl text-ink-variant font-semibold tracking-wide">
            Toque na tela para retirar sua senha
          </p>
          
          <div className="mt-6 md:mt-8 inline-flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20 px-6 py-4 md:px-10 md:py-6 rounded-md shadow-[0_20px_50px_rgba(37,99,235,0.06)] overflow-hidden group gap-4">
            {/* Blinking live indicator */}
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black tracking-widest uppercase">FILA AO VIVO</span>
            </div>
            
            <div className="flex items-center gap-4 md:gap-5">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-md bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <Users className="h-8 w-8 text-on-primary" />
              </div>
              <div className="flex flex-col items-start leading-none gap-1.5 md:gap-2">
                <span className="font-syne text-[10px] md:text-[11px] font-black uppercase tracking-widest text-ink-variant">Pessoas Aguardando</span>
                <span className="font-syne text-5xl md:text-6xl font-black text-primary flex items-baseline gap-1 tracking-tighter">
                  {pessoasAguardando}
                  <span className="text-sm font-bold text-ink-variant/70 font-dmsans tracking-normal lowercase">clientes</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Banners Wrapper */}
        <div className="banners-wrapper px-4 shrink-0 w-full max-w-4xl">
          <div className="info-banner banner-yellow text-sm py-3 px-4">
            📱 <strong>Fila na palma da mão!</strong> Escaneie o QR Code do seu ticket e acompanhe sua posição ao vivo pelo celular.
          </div>
          <div className="info-banner banner-green text-sm py-3 px-4 mt-2">
            📝 <strong>Monte sua lista:</strong> Consulte os preços dos nossos produtos a granel de forma simples e rápida.
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-center gap-6 max-w-6xl w-full px-4 mb-8">
          {config.ocultar_tipo_senha === '1' ? (
            <button 
              onClick={() => handleBotaoEmitir(false)}
              className="w-full bg-surface border-2 border-outline-variant rounded-md py-8 md:py-10 lg:py-12 flex flex-col items-center justify-center gap-6 shadow-[0_20px_40px_rgba(0,0,0,0.05)] hover:border-primary hover:shadow-[0_20px_50px_rgba(37,99,235,0.15)] active:scale-95 transition-all duration-200 outline-none group"
            >
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                <Ticket className="h-20 w-20 text-primary group-hover:text-white transition-colors" />
              </div>
              <div className="text-center">
                <span className="font-syne text-5xl md:text-6xl font-black text-primary block uppercase">Emitir Senha</span>
              </div>
            </button>
          ) : (
            <>
              {/* Card Normal */}
              {config.fila_normal_ativa !== '0' && (
                <button 
                  onClick={() => handleBotaoEmitir(false)}
                  className="w-full bg-surface border-[4px] md:border-[6px] border-primary/40 rounded-md py-6 md:py-8 lg:py-12 flex flex-col items-center justify-center gap-4 hover:border-primary hover:bg-primary/5 active:scale-95 transition-all duration-300 outline-none group" style={{animation: 'totemGlow 1.5s ease-in-out infinite'}}
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-primary/40">
                    <Pointer className="h-12 w-12 text-on-primary" />
                  </div>
                  <div className="text-center">
                    <span className="font-syne text-2xl md:text-3xl font-bold text-ink block uppercase tracking-widest">{config.rotulo_atendimento_geral || 'Atendimento Geral'}</span>
                    <span className="font-syne text-4xl md:text-5xl font-black text-primary block uppercase mt-3 tracking-wide">TOQUE AQUI</span>
                  </div>
                </button>
              )}

              {/* Card Preferencial */}
              {config.fila_preferencial_ativa !== '0' && (
                <button 
                  onClick={() => handleBotaoEmitir(true)}
                  className="w-full bg-surface border-[4px] md:border-[6px] border-warning/40 rounded-md py-6 md:py-8 lg:py-12 flex flex-col items-center justify-center gap-4 hover:border-warning hover:bg-warning/5 active:scale-95 transition-all duration-300 outline-none group" style={{animation: 'totemGlowWarning 1.5s ease-in-out infinite'}}
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-warning flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-warning/40">
                    <Pointer className="h-12 w-12 text-white" />
                  </div>
                  <div className="text-center">
                    <span className="font-syne text-2xl md:text-3xl font-bold text-ink block uppercase tracking-widest">{config.rotulo_atendimento_prioritario || 'Atendimento Prioritário'}</span>
                    <span className="font-syne text-4xl md:text-5xl font-black text-warning block uppercase mt-3 tracking-wide">TOQUE AQUI</span>
                  </div>
                  <div className="font-dmsans text-ink-variant text-sm md:text-base font-medium px-4 md:px-8 mt-2">
                    Pessoas com deficiência, idosos, gestantes e lactantes.
                  </div>
                </button>
              )}
            </>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="py-6 flex items-center justify-center gap-8 shrink-0 border-t border-outline-variant/10 bg-surface/50 relative z-40">
        <ConfigModal />
        <p className="text-ink-variant/40 text-lg font-medium">Chamaaí © {new Date().getFullYear()}</p>
        
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-500/5 text-slate-500/50 hover:text-slate-700 hover:bg-slate-500/10 transition-all text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Menu
        </button>

        <button 
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 text-primary/40 hover:text-primary hover:bg-primary/10 transition-all text-xs font-bold uppercase tracking-widest"
        >
          <Network className="h-4 w-4" />
          {localStorage.getItem('server_ip_override') ? `IP: ${localStorage.getItem('server_ip_override')}` : 'MODO LOCAL'}
        </button>
      </footer>
    </div>
  );
}
