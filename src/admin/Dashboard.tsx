import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    aguardando: 0,
    atendidos: 0,
    cancelados: 0
  });
  const [appVersion, setAppVersion] = useState('...');

  const API_URL = getApiUrl();

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/senhas`);
      const data = await res.json();
      const total = data.length;
      const aguardando = data.filter((s: any) => s.status === 'aguardando').length;
      const atendidos = data.filter((s: any) => s.status === 'atendida').length;
      const cancelados = data.filter((s: any) => s.status === 'cancelada').length;
      setStats({ total, aguardando, atendidos, cancelados });
    } catch (err) {
      console.error('Erro ao buscar estatísticas', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    
    // Fetch app version
    if ((window as any).api?.getAppVersion) {
      (window as any).api.getAppVersion().then((ver: string) => {
        setAppVersion(ver);
      }).catch(console.error);
    }
    
    return () => clearInterval(interval);
  }, []);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 font-rajdhani">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
          <div>
            <h1 className="font-oswald text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Dashboard</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold text-primary uppercase tracking-widest">Métricas em tempo real da fila</p>
          </div>
          <button 
            onClick={fetchStats} 
            className="bg-surface-variant text-ink px-6 py-3 rounded-xl font-bold border border-outline-variant hover:bg-outline-variant transition-all active:scale-95 flex items-center gap-2 outline-none uppercase tracking-widest text-xs"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Atualizar
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Metric 1: Total */}
          <div className="bg-surface rounded-[24px] p-8 shadow-sm border border-outline-variant/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[64px] -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors"></div>
            <p className="font-bold text-xs text-ink-secondary uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">confirmation_number</span>
              Total Emitidas
            </p>
            <span className="font-oswald text-[56px] font-black text-ink leading-none">{stats.total}</span>
            <div className="mt-4 flex items-center text-success font-bold text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm mr-1">trending_up</span>
              Fluxo Normal
            </div>
          </div>

          {/* Metric 2: Aguardando */}
          <div className="bg-surface rounded-[24px] p-8 shadow-sm border border-primary/20 relative overflow-hidden group border-b-8 border-b-primary">
            <p className="font-bold text-xs text-primary uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">hourglass_empty</span>
              Em Espera
            </p>
            <span className="font-oswald text-[56px] font-black text-primary leading-none">{stats.aguardando}</span>
            <div className="mt-4 flex items-center text-primary font-bold text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm mr-1">group</span>
              Pessoas na fila
            </div>
          </div>

          {/* Metric 3: Atendidas */}
          <div className="bg-surface rounded-[24px] p-8 shadow-sm border border-success/20 relative overflow-hidden group border-b-8 border-b-success">
            <p className="font-bold text-xs text-success uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Atendidas
            </p>
            <span className="font-oswald text-[56px] font-black text-ink leading-none">{stats.atendidos}</span>
            <div className="mt-4 flex items-center text-success font-bold text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm mr-1">speed</span>
              Alta Eficiência
            </div>
          </div>

          {/* Metric 4: Canceladas */}
          <div className="bg-surface rounded-[24px] p-8 shadow-sm border border-error/20 relative overflow-hidden group border-b-8 border-b-error">
            <p className="font-bold text-xs text-error uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">cancel</span>
              Canceladas
            </p>
            <span className="font-oswald text-[56px] font-black text-ink leading-none">{stats.cancelados}</span>
            <div className="mt-4 flex items-center text-error font-bold text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm mr-1">block</span>
              No-shows
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-surface rounded-[32px] p-10 border border-outline-variant/50 shadow-sm h-80 flex flex-col items-center justify-center gap-4 group">
            <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center text-outline-variant group-hover:scale-110 group-hover:bg-primary/5 group-hover:text-primary transition-all duration-500">
              <span className="material-symbols-outlined text-4xl">insights</span>
            </div>
            <div className="text-center">
              <h3 className="font-oswald text-xl font-bold text-ink uppercase tracking-widest">Análise de Desempenho</h3>
              <p className="text-ink-secondary text-sm font-bold uppercase tracking-[0.2em] mt-1">Os gráficos serão gerados após o primeiro dia de operação.</p>
            </div>
          </div>
          
          {/* Version Card */}
          <div className="bg-surface rounded-[32px] p-8 border border-outline-variant/50 shadow-sm flex flex-col items-center justify-center text-center group">
            <span className="material-symbols-outlined text-5xl text-primary mb-4">new_releases</span>
            <h3 className="font-oswald text-2xl font-bold text-ink uppercase tracking-widest mb-2">Versão do Sistema</h3>
            <div className="bg-primary/10 text-primary px-6 py-2 rounded-full font-black text-xl tracking-[0.3em] border border-primary/20 mb-6">
              v{appVersion}
            </div>
            
            <button 
              onClick={async () => {
                const api = (window as any).api;
                if (api?.checkForUpdates) {
                  try {
                    const btn = document.getElementById('btn-update');
                    if(btn) { btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Verificando...'; btn.setAttribute('disabled', 'true'); }
                    const res = await api.checkForUpdates();
                    alert(res.message);
                    if(btn) { btn.innerHTML = '<span class="material-symbols-outlined text-sm">download</span> Atualizar Agora'; btn.removeAttribute('disabled'); }
                  } catch (err) {
                    alert('Erro ao buscar atualização.');
                  }
                } else {
                  alert('O sistema de atualização só funciona no aplicativo final (.exe)');
                }
              }}
              id="btn-update"
              className="w-full bg-primary text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 mb-3"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Atualizar Agora
            </button>

            <button 
              onClick={async () => {
                if(window.confirm('⚠️ ATENÇÃO: Deseja realmente ZERAR todas as senhas?\n\nIsso voltará o contador para 001 e limpará a fila de espera atual.')) {
                  try {
                    const res = await fetch(`${getApiUrl()}/api/reset-senhas`, { method: 'POST' });
                    if(res.ok) {
                      alert('Senhas resetadas com sucesso!');
                      window.location.reload();
                    }
                  } catch (err) {
                    alert('Erro ao resetar senhas.');
                  }
                }
              }}
              className="w-full py-3 bg-error/10 text-error rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-error/20 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              Zerar Senhas
            </button>
            <p className="text-ink-secondary text-[10px] font-bold uppercase tracking-widest mt-4">Atualizações automáticas ativas</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
