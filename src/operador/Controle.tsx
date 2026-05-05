import { useState, useEffect } from 'react';
import { getApiUrl, setServerIp } from '../shared/apiConfig';
import { useSSE } from '../shared/useSSE';



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

  const normalCount = fila.filter(s => s.preferencial === 0).length;
  const priorityCount = fila.filter(s => s.preferencial === 1).length;

  return (
    <div className={`min-h-screen w-full font-sans flex justify-center transition-colors duration-300
      ${theme === 'dark' ? 'bg-[#020617] text-white' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      <div className="w-full max-w-[500px] h-screen flex flex-col p-4 gap-4 overflow-hidden">
        
        {/* Header Superior */}
        <div className={`flex items-center justify-between p-4 rounded-3xl border shadow-sm transition-all
          ${theme === 'dark' ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <span className={`material-symbols-outlined text-xl ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>storefront</span>
            <span className="font-sans text-lg font-bold uppercase tracking-wide">{guiche}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => {
              setTempIp(API_URL.replace('http://', '').replace(':3000', ''));
              setShowIpConfig(true);
            }} className="p-2 rounded-full bg-slate-500/10 text-slate-500">
              <span className="material-symbols-outlined">settings_ethernet</span>
            </button>
            <button onClick={toggleTheme} className="p-2 rounded-full bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
            </button>
          </div>
        </div>

        {/* Modal de Configuração de IP */}
        {showIpConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className={`w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-scale-in ${theme === 'dark' ? 'bg-slate-900 border border-white/10' : 'bg-white'}`}>
              <h3 className="font-sans text-2xl font-bold uppercase mb-2">Conectar ao Servidor</h3>
              <p className="text-sm text-slate-500 font-semibold mb-6 uppercase tracking-wider">Digite o IP do computador principal</p>
              
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-blue-500/50">dns</span>
                  <input 
                    type="text" 
                    value={tempIp}
                    onChange={(e) => setTempIp(e.target.value)}
                    placeholder="Ex: 192.168.3.89"
                    className={`w-full py-4 pl-12 pr-4 rounded-2xl font-bold border outline-none transition-all ${theme === 'dark' ? 'bg-slate-800 border-white/10 text-white focus:border-blue-500' : 'bg-slate-100 border-slate-200 focus:border-blue-500'}`}
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowIpConfig(false)} className="flex-1 py-3 font-bold uppercase tracking-widest text-sm opacity-50">Cancelar</button>
                  <button onClick={() => setServerIp(tempIp)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-blue-500/20">Salvar</button>
                </div>
                
                <button 
                  onClick={() => setServerIp('')} 
                  className="w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4"
                >
                  Resetar para automático
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Visor Principal */}
        <div className={`flex-1 flex flex-col items-center justify-center rounded-[40px] border relative overflow-hidden transition-all
          ${theme === 'dark' ? 'bg-slate-800/30 border-white/5' : 'bg-white border-slate-200 shadow-xl shadow-blue-500/5'}`}>
          
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/20"></div>
          <span className="text-[11px] font-bold tracking-[5px] uppercase opacity-40 mb-2">Senha em Atendimento</span>
          
          <div className={`font-sans text-[120px] font-bold leading-none tracking-tighter drop-shadow-2xl transition-all
            ${senhaAtual ? 'text-blue-500 scale-110' : 'opacity-10'}`}>
            {senhaAtual ? String(senhaAtual.numero).padStart(3, '0') : '---'}
          </div>
          
          <div className="mt-4 px-6 py-2 rounded-full bg-blue-500/5 text-blue-500 font-bold text-xs uppercase tracking-widest border border-blue-500/10">
            {senhaAtual ? (senhaAtual.preferencial ? 'Prioritário' : 'Normal') : 'Aguardando'}
          </div>
        </div>

        {/* Status da Fila */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`p-4 rounded-3xl border text-center transition-all ${theme === 'dark' ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'}`}>
            <div className="text-2xl font-sans font-bold text-blue-500">{normalCount}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Geral</div>
          </div>
          <div className={`p-4 rounded-3xl border text-center border-t-4 border-t-amber-500 transition-all ${theme === 'dark' ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'}`}>
            <div className="text-2xl font-sans font-bold text-amber-500">{priorityCount}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Prioritário</div>
          </div>
          <div className={`p-4 rounded-3xl border text-center transition-all ${theme === 'dark' ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'}`}>
            <div className="text-2xl font-sans font-bold">{fila.length}</div>
            <div className="text-[10px] font-bold uppercase opacity-50">Total</div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col gap-3 pb-4">
          <button 
            onClick={repetirChamada}
            className="py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl font-bold text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3">
            <span className="material-symbols-outlined">refresh</span> REPETIR
          </button>
          
          <button 
            onClick={chamarProxima}
            className="py-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[32px] font-black text-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4">
            <span className="material-symbols-outlined text-4xl">campaign</span> PRÓXIMO
          </button>

          <button 
            onClick={estornar}
            className={`w-full py-4 rounded-3xl font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.95] border-2
              ${theme === 'dark' ? 'bg-amber-600/20 border-amber-500/50 text-amber-500' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
            <span className="material-symbols-outlined">undo</span> DEVOLVER À FILA
          </button>
        </div>

      </div>
    </div>
  );
}
