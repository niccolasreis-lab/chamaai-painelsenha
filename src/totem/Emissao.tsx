import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';

export default function Emissao() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>({});
  const [pessoasAguardando, setPessoasAguardando] = useState(0);
  const API_URL = getApiUrl();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('server_ip_override') || '');
  const [error, setError] = useState(false);

  const fetchConfig = async () => {
    try {
      setError(false);
      const res = await fetch(`${API_URL}/api/configuracoes`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Erro ao carregar configurações', err);
      setError(true);
    }
  };

  const fetchFila = async () => {
    try {
      const res = await fetch(`${API_URL}/api/senhas`);
      const data = await res.json();
      const aguardando = data.filter((s: any) => s.status === 'aguardando').length;
      setPessoasAguardando(aguardando);
    } catch (err) {}
  };

  useEffect(() => {
    fetchConfig();
    fetchFila();
    
    const interval = setInterval(fetchFila, 15000);
    return () => clearInterval(interval);
  }, [API_URL]);

  // Sincronização em tempo real via SSE
  const { data: sseEvent } = useSSE(`${API_URL}/events`);

  useEffect(() => {
    if (!sseEvent) return;

    if (sseEvent.event === 'NOVA_SENHA_EMITIDA' || sseEvent.event === 'NOVA_SENHA_CHAMADA' || sseEvent.event === 'SISTEMA_RESETADO') {
      fetchFila();
    }
  }, [sseEvent]);

  // Função para salvar o IP
  const handleSaveIp = () => {
    if (tempIp.trim() === '') {
      localStorage.removeItem('server_ip_override');
    } else {
      localStorage.setItem('server_ip_override', tempIp.trim());
    }
    window.location.reload();
  };

  // Componente Modal de IP
  const ConfigModal = () => {
    if (!showConfigModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-3xl p-8 max-w-md w-full shadow-2xl border border-outline-variant/30 flex flex-col gap-6">
          <div>
            <h3 className="font-oswald text-2xl font-bold text-ink uppercase mb-2">Configuração de Rede</h3>
            <p className="text-sm font-rajdhani text-ink-secondary font-medium">Digite o IP ou o Nome do computador principal (Telão) para conectar este totem.</p>
          </div>
          <div>
            <label className="block font-bold tracking-widest text-ink-secondary uppercase mb-2 text-xs">ENDEREÇO DO SERVIDOR</label>
            <input 
              type="text" 
              value={tempIp}
              onChange={(e) => setTempIp(e.target.value)}
              placeholder="Ex: 192.168.1.100 ou NOME-DO-PC"
              className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-bold text-lg"
              autoFocus
            />
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowConfigModal(false)}
              className="flex-1 py-4 bg-surface-variant text-ink rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-outline-variant/50 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveIp}
              className="flex-1 py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-primary-hover active:scale-95 transition-all"
            >
              Conectar
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8 text-center font-rajdhani">
        <ConfigModal />
        <span className="material-symbols-outlined text-[6rem] text-error mb-4">wifi_off</span>
        <h2 className="text-4xl font-oswald font-bold text-ink uppercase mb-2">Servidor não encontrado</h2>
        <p className="text-xl text-ink-secondary mb-8 max-w-md">Não conseguimos conectar ao PC principal ({API_URL}). Verifique se o Telão está aberto e se o IP está correto.</p>
        
        <button 
          onClick={() => setShowConfigModal(true)}
          className="px-10 py-5 bg-primary text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl hover:bg-primary-hover active:scale-95 transition-all flex items-center gap-3"
        >
          <span className="material-symbols-outlined">hub</span>
          Configurar IP do Servidor
        </button>
      </div>
    );
  }

  const emitirSenha = async (preferencial: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/senhas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balcao_id: 1, preferencial })
      });
      const data = await res.json();
      
      // Dispara a impressão em background (sem await) para não travar a tela
      if (window.api?.printTicket) {
        window.api.printTicket({
          numero: String(data.numero).padStart(3, '0'),
          balcao: config.nome_estabelecimento || "Balcão Geral",
          data: new Date().toLocaleString('pt-BR'),
          preferencial: data.preferencial,
          logo: config.logo_cliente ? `${API_URL}${config.logo_cliente}` : undefined
        }).catch(err => console.error('Erro na impressão background', err));
      }

      // Redireciona instantaneamente para dar feedback rápido ao usuário
      navigate('/totem/confirmacao', { state: { senha: data } });
    } catch (err) {
      console.error('Erro ao emitir senha', err);
      alert('Erro de conexão ao emitir senha. Tente novamente.');
    }
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col font-rajdhani select-none overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="bg-primary text-on-primary py-10 shadow-md flex justify-center items-center border-b-[6px] border-primary-hover shrink-0">
        <h1 className="font-oswald text-5xl font-bold uppercase tracking-widest flex items-center gap-4">
          <span className="material-symbols-outlined text-[4rem]">storefront</span>
          {config.nome_estabelecimento || 'ChamaAí'}
        </h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-10 overflow-hidden">
        <div className="text-center shrink-0">
          <h2 className="font-oswald text-4xl font-semibold text-ink mb-2 uppercase">
            Bem-vindo(a)
          </h2>
          <p className="text-2xl text-ink-secondary font-medium">
            Toque na tela para retirar sua senha
          </p>
          
          <div className="mt-8 inline-flex items-center gap-4 bg-surface-variant/20 px-8 py-4 rounded-full border border-outline-variant/30">
            <span className="material-symbols-outlined text-primary text-[2.5rem]">group</span>
            <div className="flex flex-col items-start leading-tight">
              <span className="font-rajdhani text-sm font-bold uppercase tracking-widest text-ink-secondary">Pessoas Aguardando</span>
              <span className="font-oswald text-5xl font-black text-primary">{pessoasAguardando}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-6 max-w-2xl w-full px-4 overflow-hidden">
          {config.ocultar_tipo_senha === '1' ? (
            <button 
              onClick={() => emitirSenha(false)}
              className="w-full bg-surface border-2 border-outline-variant rounded-[40px] py-12 flex flex-col items-center justify-center gap-8 shadow-[0_20px_40px_rgba(0,0,0,0.05)] hover:border-primary hover:shadow-[0_20px_50px_rgba(37,99,235,0.15)] active:scale-95 transition-all duration-200 outline-none group"
            >
              <div className="w-40 h-40 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                <span className="material-symbols-outlined text-[8rem] text-primary group-hover:text-white transition-colors">
                  confirmation_number
                </span>
              </div>
              <div className="text-center">
                <span className="font-oswald text-6xl font-black text-primary block uppercase">Emitir Senha</span>
              </div>
            </button>
          ) : (
            <>
              {/* Card Normal */}
              {config.fila_normal_ativa !== '0' && (
                <button 
                  onClick={() => emitirSenha(false)}
                  className="w-full bg-surface border-2 border-outline-variant rounded-[40px] py-10 flex flex-col items-center justify-center gap-4 shadow-[0_20px_40px_rgba(0,0,0,0.05)] hover:border-primary hover:shadow-[0_20px_50px_rgba(37,99,235,0.15)] active:scale-95 transition-all duration-200 outline-none group"
                >
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <span className="material-symbols-outlined text-[5rem] text-primary group-hover:text-white transition-colors">
                      person
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="font-oswald text-3xl font-bold text-ink block uppercase">Atendimento</span>
                    <span className="font-oswald text-5xl font-black text-primary block uppercase">{config.rotulo_atendimento_geral || 'Geral'}</span>
                  </div>
                </button>
              )}

              {/* Card Preferencial */}
              {config.fila_preferencial_ativa !== '0' && (
                <button 
                  onClick={() => emitirSenha(true)}
                  className="w-full bg-surface border-2 border-outline-variant rounded-[40px] py-10 flex flex-col items-center justify-center gap-4 shadow-[0_20px_40px_rgba(0,0,0,0.05)] hover:border-warning hover:shadow-[0_20px_50_rgba(217,119,6,0.15)] active:scale-95 transition-all duration-200 outline-none group"
                >
                  <div className="w-24 h-24 rounded-full bg-warning/10 flex items-center justify-center group-hover:bg-warning transition-colors">
                    <span className="material-symbols-outlined text-[5rem] text-warning group-hover:text-white transition-colors">
                      elderly
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="font-oswald text-3xl font-bold text-ink block uppercase">Atendimento</span>
                    <span className="font-oswald text-5xl font-black text-warning block uppercase">{config.rotulo_atendimento_prioritario || 'Prioritário'}</span>
                  </div>
                  <div className="text-ink-secondary text-base font-medium px-8">
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
        <p className="text-ink-secondary/40 text-lg font-medium">Chamaaí © {new Date().getFullYear()}</p>
        
        <button 
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 text-primary/40 hover:text-primary hover:bg-primary/10 transition-all text-xs font-bold uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-base">hub</span>
          {localStorage.getItem('server_ip_override') ? `IP: ${localStorage.getItem('server_ip_override')}` : 'MODO LOCAL'}
        </button>
      </footer>
    </div>
  );
}
