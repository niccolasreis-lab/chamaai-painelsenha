import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Store, 
  Settings2, 
  Moon, 
  Sun, 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Undo2, 
  Megaphone 
} from 'lucide-react';
import { getApiUrl, setServerIp } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';

export default function Controle() {
  const [fila, setFila] = useState<any[]>([]);
  const [senhaAtual, setSenhaAtual] = useState<any>(null);
  const [theme, setTheme] = useState('light');
  const [guiche, setGuiche] = useState('Guichê 1');
  const [_config, setConfig] = useState<any>({});
  const [_balcoes, setBalcoes] = useState<any[]>([]);
  
  const [showIpConfig, setShowIpConfig] = useState(false);
  const [tempIp, setTempIp] = useState('');
  
  const API_URL = getApiUrl();

  // Função de carregamento robusta
  const refreshData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fila`);
      if (res.ok) {
        const data = await res.json();
        setFila(Array.isArray(data) ? data : []);
      }
      
      const resConfig = await fetch(`${API_URL}/api/configuracoes`);
      if (resConfig.ok) {
        const dataConfig = await resConfig.json();
        setConfig(dataConfig);
      }

      const resBalcoes = await fetch(`${API_URL}/api/balcoes`);
      if (resBalcoes.ok) {
        const dataBalcoes = await resBalcoes.json();
        setBalcoes(dataBalcoes);
      }
    } catch (err) {
      console.warn('Servidor offline ou inacessível');
      // Se falhar no carregamento inicial e não for localhost, sugere configurar IP
      if (window.location.hostname !== 'localhost') {
        setShowIpConfig(true);
      }
    }
  };

  useEffect(() => {
    const hoje = new Date().toDateString();
    const ultimaData = localStorage.getItem('chamaaai_ultima_data');

    if (ultimaData && ultimaData !== hoje) {
      localStorage.removeItem('chamaaai_ultima_data');
      setSenhaAtual(null);
      setFila([]);
    }
    localStorage.setItem('chamaaai_ultima_data', hoje);

    // Inicialização segura
    try {
      const savedTheme = localStorage.getItem('balcao-theme') || 'light';
      const savedGuiche = localStorage.getItem('myStationName') || 'Guichê 1';
      setTheme(savedTheme);
      setGuiche(savedGuiche);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (e) {}

    refreshData();
    
    // Polling de segurança (caso o SSE falhe)
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sincronização em tempo real via SSE
  const { data: sseEvent } = useSSE(`${API_URL}/events`);

  useEffect(() => {
    if (!sseEvent) return;

    if (sseEvent.event === 'NOVA_SENHA_EMITIDA' || sseEvent.event === 'NOVA_SENHA_CHAMADA') {
      refreshData();
    } else if (sseEvent.event === 'SISTEMA_RESETADO') {
      setSenhaAtual(null);
      setFila([]);
      refreshData();
    } else if (sseEvent.event === 'DIA_RESETADO') {
      setSenhaAtual(null);
      setFila([]);
      refreshData();
      console.log('[ChamaAí] Dia resetado — estado recarregado');
    }
  }, [sseEvent]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('balcao-theme', newTheme); } catch (e) {}
  };

  const chamarProxima = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chamar-proxima`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operador_id: 1, 
          guiche: guiche
        })
      });
      if (res.ok) {
        const result = await res.json();
        setSenhaAtual(result.data);
        refreshData();
      } else if (res.status === 404) {
        alert('Nenhuma senha aguardando na fila.');
      }
    } catch (err) {
      alert('Erro ao chamar senha');
    }
  };

  const repetirChamada = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/chamadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senha_id: senhaAtual.id,
          operador_id: 1,
          guiche: guiche
        })
      });
    } catch (err) {}
  };

  const estornar = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/senhas/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id })
      });
      setSenhaAtual(null);
      refreshData();
    } catch (err) {}
  };

  const concluirAtendimento = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/senhas/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche })
      });
      setSenhaAtual(null);
      refreshData();
    } catch (err) {}
  };

  const naoCompareceu = async () => {
    if (!senhaAtual) return;
    try {
      await fetch(`${API_URL}/api/senhas/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_id: senhaAtual.id, guiche })
      });
      setSenhaAtual(null);
      refreshData();
    } catch (err) {}
  };

  const normalCount = fila.filter(s => s.preferencial === 0).length;
  const priorityCount = fila.filter(s => s.preferencial === 1).length;

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen w-full font-sans flex justify-center transition-colors duration-normal
      ${isDark ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-background text-ink'}`}>
      
      <div className="w-full max-w-[500px] h-screen flex flex-col p-4 gap-4 overflow-y-auto overflow-x-hidden">
        
        {/* Header Superior */}
        <div className={`flex items-center justify-between p-4 rounded-sm border shadow-sm transition-all
          ${isDark ? 'bg-surface/5 border-outline-variant/30' : 'bg-surface border-outline-variant'}`}>
          <div className="flex items-center gap-3">
            <Link 
              to="/" 
              onClick={() => localStorage.removeItem('app_mode')} 
              className={`p-2 rounded-sm transition-colors flex items-center justify-center outline-none ${isDark ? 'hover:bg-white/10 text-inverse-on-surface/60' : 'hover:bg-surface-container-low text-ink-variant'}`}
              title="Voltar ao Menu Principal"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Store className={`h-5 w-5 ${isDark ? 'text-inverse-primary' : 'text-primary'}`} />
            <span className="font-sans text-sm font-bold uppercase tracking-wider">{guiche}</span>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="px-2"
              onClick={() => {
                setTempIp(API_URL.replace('http://', '').split(':')[0]);
                setShowIpConfig(true);
              }}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="px-2"
              onClick={toggleTheme}
            >
              {isDark ? <Sun className="h-4 w-4 text-warning" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Modal de Configuração de IP */}
        {showIpConfig && (
          <Dialog
            open={showIpConfig}
            onClose={() => setShowIpConfig(false)}
            title="Conectar ao Servidor"
            maxWidth="max-w-sm"
          >
            <div className="space-y-4">
              <p className="text-xs text-ink-variant font-medium uppercase tracking-wider">Digite o IP do computador principal</p>
              
              <Input 
                label="Endereço de IP"
                value={tempIp}
                onChange={e => setTempIp(e.target.value)}
                placeholder="Ex: 192.168.3.89"
                leadingIcon={<Database className="h-4 w-4 text-outline" />}
              />

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowIpConfig(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    setServerIp(tempIp);
                    setShowIpConfig(false);
                  }}
                  className="flex-1"
                >
                  Salvar
                </Button>
              </div>
              
              <button 
                type="button"
                onClick={() => {
                  setServerIp('');
                  setShowIpConfig(false);
                }} 
                className="w-full text-[10px] font-bold text-outline uppercase tracking-widest mt-2 text-center"
              >
                Resetar para automático
              </button>
            </div>
          </Dialog>
        )}

        {/* Visor Principal */}
        <div className={`flex-1 flex flex-col items-center justify-center rounded-lg border relative overflow-hidden transition-all p-6
          ${isDark ? 'bg-surface/5 border-outline-variant/30' : 'bg-surface border-outline-variant shadow-sm'}`}>
          
          <div className="absolute top-0 left-0 w-full h-1 bg-primary/20"></div>
          <span className="text-[10px] font-bold tracking-[4px] uppercase opacity-50 mb-2">Senha em Atendimento</span>
          
          <div className={`font-display text-[96px] font-bold leading-none tracking-tighter drop-shadow-md transition-all
            ${senhaAtual ? 'text-primary scale-105' : 'opacity-15'}`}>
            {senhaAtual ? String(senhaAtual.numero).padStart(3, '0') : '---'}
          </div>
          
          <div className={`mt-6 px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-wider border ${
            senhaAtual 
              ? senhaAtual.preferencial 
                ? 'bg-warning-container text-warning-ink border-warning/20' 
                : 'bg-primary/5 text-primary border-primary/20' 
              : 'bg-outline-variant/20 text-outline border-transparent'
          }`}>
            {senhaAtual ? (senhaAtual.preferencial ? 'Prioritário' : 'Normal') : 'Aguardando'}
          </div>
        </div>

        {/* Status da Fila */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`p-4 rounded-sm border text-center transition-all ${isDark ? 'bg-surface/5 border-outline-variant/30' : 'bg-surface border-outline-variant shadow-sm'}`}>
            <div className="text-2xl font-bold text-primary font-mono">{normalCount}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Geral</div>
          </div>
          <div className={`p-4 rounded-sm border text-center border-t-4 border-t-warning transition-all ${isDark ? 'bg-surface/5 border-outline-variant/30' : 'bg-surface border-outline-variant shadow-sm'}`}>
            <div className="text-2xl font-bold text-warning font-mono">{priorityCount}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Prioritário</div>
          </div>
          <div className={`p-4 rounded-sm border text-center transition-all ${isDark ? 'bg-surface/5 border-outline-variant/30' : 'bg-surface border-outline-variant shadow-sm'}`}>
            <div className="text-2xl font-bold font-mono">{fila.length}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Total</div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col gap-3 pb-4">
          {senhaAtual && (_config.painel_habilitar_concluir !== '0' || _config.painel_habilitar_nao_compareceu !== '0') && (
            <div className={`grid ${_config.painel_habilitar_concluir !== '0' && _config.painel_habilitar_nao_compareceu !== '0' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {_config.painel_habilitar_concluir !== '0' && (
                <Button 
                  onClick={concluirAtendimento}
                  variant="primary"
                  className="bg-success text-white py-6"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Concluir
                </Button>
              )}
              {_config.painel_habilitar_nao_compareceu !== '0' && (
                <Button 
                  onClick={naoCompareceu}
                  variant="danger"
                  className="py-6"
                  icon={<XCircle className="h-4 w-4" />}
                >
                  Não Compareceu
                </Button>
              )}
            </div>
          )}

          {senhaAtual && (_config.painel_habilitar_repetir !== '0' || _config.painel_habilitar_devolver !== '0') && (
            <div className={`grid ${_config.painel_habilitar_repetir !== '0' && _config.painel_habilitar_devolver !== '0' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {_config.painel_habilitar_repetir !== '0' && (
                <Button 
                  onClick={repetirChamada}
                  variant="primary"
                  className="py-5"
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  Repetir
                </Button>
              )}
              {_config.painel_habilitar_devolver !== '0' && (
                <Button 
                  onClick={estornar}
                  variant="secondary"
                  className={`py-5 ${isDark ? 'border-warning/50 text-warning hover:bg-warning/10' : 'border-warning-ink text-warning-ink hover:bg-warning-container'}`}
                  icon={<Undo2 className="h-4 w-4" />}
                >
                  Devolver
                </Button>
              )}
            </div>
          )}
          
          <Button 
            onClick={chamarProxima}
            variant="primary"
            className="py-8 text-xl font-bold bg-success hover:brightness-95 active:brightness-90 text-white rounded-md uppercase tracking-wider"
            icon={<Megaphone className="h-6 w-6" />}
          >
            Próximo
          </Button>
        </div>

      </div>
    </div>
  );
}
