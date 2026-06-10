import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import OnboardingWizard from './OnboardingWizard';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    aguardando: 0,
    atendidos: 0,
    cancelados: 0
  });
  const [appVersion, setAppVersion] = useState('...');
  const [isNewInstall, setIsNewInstall] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  
  const [chartDataHora, setChartDataHora] = useState<any[]>([]);
  const [chartDataBalcao, setChartDataBalcao] = useState<any[]>([]);
  const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#db2777'];

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

      const resMetricas = await fetch(`${API_URL}/api/dashboard/metricas`);
      if (resMetricas.ok) {
        const metricas = await resMetricas.json();
        setChartDataHora(metricas.porHora.map((i: any) => ({ hora: i.hora + 'h', quantidade: i.quantidade })));
        setChartDataBalcao(metricas.porBalcao.map((i: any) => ({ name: i.nome, value: i.quantidade })));
      }
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

    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/status`);
        if (res.ok) {
          const data = await res.json();
          setIsNewInstall(data.isNewInstall || false);
        }
      } catch (err) {
        console.error('Falha ao verificar status de admin no dashboard:', err);
      }
    };
    checkStatus();
    
    if (!localStorage.getItem('onboarding_completed')) {
      setShowWizard(true);
    }
    
    return () => clearInterval(interval);
  }, []);

  return (
    <AdminLayout>
      {showWizard && (
        <OnboardingWizard onComplete={() => setShowWizard(false)} />
      )}
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
          <div>
            <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Dashboard</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold text-primary tracking-widest">Métricas em tempo real da fila</p>
          </div>
          <button 
            onClick={fetchStats} 
            className="bg-surface-variant text-ink px-6 py-3 rounded-xl font-bold border border-outline-variant hover:bg-outline-variant transition-all active:scale-95 flex items-center gap-2 outline-none uppercase tracking-widest text-xs"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Atualizar
          </button>
        </div>

        {isNewInstall && (
          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-6 rounded-r-2xl shadow-sm flex items-start gap-4 animate-pulse">
            <span className="material-symbols-outlined text-amber-500 text-3xl shrink-0 mt-1">warning</span>
            <div className="flex-1">
              <h3 className="text-base font-bold text-amber-800 tracking-widest leading-none">⚠️ aviso: altere suas credenciais padrão</h3>
              <p className="text-xs text-amber-700 font-semibold mt-2 leading-relaxed">
                Este sistema está rodando com as credenciais administrativas originais de fábrica (<b>admin</b> / <b>admin</b>). Para garantir a integridade absoluta dos seus relatórios, preços e acessos remotos, por favor, <Link to="/admin/operators" className="underline font-bold text-amber-900 hover:text-black">CLIQUE AQUI</Link> ou vá em <b>Operadores</b> para atualizar a senha do administrador agora mesmo!
              </p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Metric 1: Total */}
          <div className="bg-surface rounded-[24px] p-8 shadow-sm border border-outline-variant/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[64px] -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors"></div>
            <p className="font-bold text-xs text-ink-secondary uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">confirmation_number</span>
              Total Emitidas
            </p>
            <span className="font-sans text-[56px] font-black text-ink leading-none">{stats.total}</span>
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
            <span className="font-sans text-[56px] font-black text-primary leading-none">{stats.aguardando}</span>
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
            <span className="font-sans text-[56px] font-black text-ink leading-none">{stats.atendidos}</span>
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
            <span className="font-sans text-[56px] font-black text-ink leading-none">{stats.cancelados}</span>
            <div className="mt-4 flex items-center text-error font-bold text-[10px] uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm mr-1">block</span>
              No-shows
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-surface rounded-[32px] p-8 border border-outline-variant/50 shadow-sm flex flex-col gap-6">
            <h3 className="font-sans text-xl font-bold text-ink tracking-widest">Atendimentos por hora</h3>
            <div className="flex-1 min-h-[250px] w-full">
              {chartDataHora.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDataHora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorQuant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="hora" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
                    />
                    <Area type="monotone" dataKey="quantidade" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorQuant)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-ink-secondary text-sm font-bold uppercase tracking-widest">
                  Sem dados suficientes
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-[32px] p-8 border border-outline-variant/50 shadow-sm flex flex-col gap-6">
            <h3 className="font-sans text-xl font-bold text-ink tracking-widest">Por balcão</h3>
            <div className="flex-1 min-h-[250px] w-full relative">
              {chartDataBalcao.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartDataBalcao}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartDataBalcao.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 'bold' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-ink-secondary text-sm font-bold uppercase tracking-widest">
                  Sem dados
                </div>
              )}
            </div>
          </div>
          
          {/* Version Card */}
          <div className="bg-surface rounded-[32px] p-8 border border-outline-variant/50 shadow-sm flex flex-col items-center justify-center text-center group">
            <span className="material-symbols-outlined text-5xl text-primary mb-4">new_releases</span>
            <h3 className="font-sans text-2xl font-bold text-ink tracking-widest mb-2">Versão do sistema</h3>
            <div className="bg-primary/10 text-primary px-6 py-2 rounded-full font-black text-xl tracking-[0.3em] border border-primary/20 mb-6">
              v{appVersion}
            </div>
            
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
