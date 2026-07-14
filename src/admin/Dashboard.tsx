import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import OnboardingWizard from './OnboardingWizard';
import {
  RefreshCw,
  AlertTriangle,
  Ticket,
  TrendingUp,
  Hourglass,
  Users,
  CheckCircle2,
  Zap,
  XCircle,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { StatusBadge } from '../shared/components/StatusBadge';

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
  const COLORS = ['#3525CD', '#059669', '#dc2626', '#d97706', '#00687A', '#7e3000'];

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
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Dashboard</h1>
            <p className="text-primary text-sm font-semibold mt-1">Métricas em tempo real da fila</p>
          </div>
          <Button 
            variant="secondary"
            size="sm"
            onClick={fetchStats} 
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Atualizar
          </Button>
        </div>

        {isNewInstall && (
          <div className="bg-error-container border-l-4 border-error p-5 rounded-r-md shadow-sm flex items-start gap-4 animate-pulse">
            <AlertTriangle className="text-error h-6 w-6 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-error-ink">Aviso: altere suas credenciais padrão</h3>
              <p className="text-xs text-ink-variant mt-1.5 leading-relaxed">
                Este sistema está rodando com as credenciais administrativas originais de fábrica (<b>admin</b> / <b>admin</b>). Para garantir a integridade absoluta dos seus relatórios, preços e acessos remotos, por favor, <Link to="/admin/operators" className="underline font-bold text-error-ink hover:text-ink">CLIQUE AQUI</Link> ou vá em <b>Operadores</b> para atualizar a senha do administrador agora mesmo!
              </p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Metric 1: Total */}
          <div className="bg-surface rounded-md p-6 shadow-sm border border-outline-variant relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full -mr-4 -mt-4 group-hover:bg-primary/10 transition-colors"></div>
            <p className="font-semibold text-xs text-ink-variant uppercase tracking-wider mb-4 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Total Emitidas
            </p>
            <span className="font-display text-4xl font-bold text-ink leading-none">{stats.total}</span>
            <div className="mt-4 flex items-center text-success font-semibold text-xs">
              <TrendingUp className="h-4 w-4 mr-1 text-success" />
              Fluxo Normal
            </div>
          </div>

          {/* Metric 2: Aguardando */}
          <div className="bg-surface rounded-md p-6 shadow-sm border border-primary relative overflow-hidden group border-b-4">
            <p className="font-semibold text-xs text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-primary animate-pulse" />
              Em Espera
            </p>
            <span className="font-display text-4xl font-bold text-primary leading-none">{stats.aguardando}</span>
            <div className="mt-4 flex items-center text-primary font-semibold text-xs">
              <Users className="h-4 w-4 mr-1 text-primary" />
              Pessoas na fila
            </div>
          </div>

          {/* Metric 3: Atendidas */}
          <div className="bg-surface rounded-md p-6 shadow-sm border border-success relative overflow-hidden group border-b-4">
            <p className="font-semibold text-xs text-success uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Atendidas
            </p>
            <span className="font-display text-4xl font-bold text-ink leading-none">{stats.atendidos}</span>
            <div className="mt-4 flex items-center text-success font-semibold text-xs">
              <Zap className="h-4 w-4 mr-1 text-success" />
              Alta Eficiência
            </div>
          </div>

          {/* Metric 4: Canceladas */}
          <div className="bg-surface rounded-md p-6 shadow-sm border border-error relative overflow-hidden group border-b-4">
            <p className="font-semibold text-xs text-error uppercase tracking-wider mb-4 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-error" />
              Canceladas
            </p>
            <span className="font-display text-4xl font-bold text-ink leading-none">{stats.cancelados}</span>
            <div className="mt-4 flex items-center text-error font-semibold text-xs">
              <XCircle className="h-4 w-4 mr-1 text-error" />
              No-shows
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-surface rounded-md p-6 border border-outline-variant shadow-sm flex flex-col gap-4">
            <h3 className="font-display text-lg font-bold text-ink">Atendimentos por hora</h3>
            <div className="flex-1 min-h-[250px] w-full">
              {chartDataHora.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDataHora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorQuant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3525CD" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3525CD" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c7c4d8" />
                    <XAxis dataKey="hora" tick={{fontSize: 12, fill: '#464555'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#464555'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '6px', border: '1px solid #c7c4d8', boxShadow: 'var(--shadow-md)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#1B1B24' }}
                    />
                    <Area type="monotone" dataKey="quantidade" stroke="#3525CD" strokeWidth={3} fillOpacity={1} fill="url(#colorQuant)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <StatusBadge variant="empty" message="Sem dados suficientes de atendimentos por hora" className="h-full py-6" />
              )}
            </div>
          </div>

          <div className="bg-surface rounded-md p-6 border border-outline-variant shadow-sm flex flex-col gap-4">
            <h3 className="font-display text-lg font-bold text-ink">Por balcão</h3>
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
                      contentStyle={{ borderRadius: '6px', border: '1px solid #c7c4d8', boxShadow: 'var(--shadow-md)' }}
                      itemStyle={{ fontWeight: 'bold' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <StatusBadge variant="empty" message="Sem dados por balcão" className="h-full py-6" />
              )}
            </div>
          </div>
          
          {/* Version Card */}
          <div className="bg-surface rounded-md p-6 border border-outline-variant shadow-sm flex flex-col items-center justify-center text-center group col-span-1 md:col-span-3 lg:col-span-1">
            <Sparkles className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-display text-lg font-bold text-ink mb-1">Versão do sistema</h3>
            <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full font-bold text-lg border border-primary/20 mb-4">
              v{appVersion}
            </div>
            
            <Button 
              variant="danger"
              size="sm"
              className="w-full"
              icon={<RotateCcw className="h-4 w-4" />}
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
            >
              Zerar Senhas
            </Button>
            <p className="text-ink-variant text-[10px] font-bold uppercase tracking-wider mt-3">Atualizações automáticas ativas</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
