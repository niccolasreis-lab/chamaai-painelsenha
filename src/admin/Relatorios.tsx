import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Download, 
  FileText, 
  TrendingUp, 
  Clock, 
  Users,
  Search
} from 'lucide-react';
import { useAPI } from '../shared/apiConfig';
import AdminLayout from './AdminLayout';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { StatusBadge } from '../shared/components/StatusBadge';

interface Stats {
  total: number;
  atendidas: number;
  canceladas: number;
  tempoMedioEspera: number; // em minutos
  tempoMedioAtendimento: number; // em minutos
  porHora?: { hora: string, quantidade: number }[];
  porBalcao?: { nome: string, quantidade: number }[];
}

export default function Relatorios() {
  const { API_URL } = useAPI();
  const [dataInicio, setDataInicio] = useState(new Date().toLocaleDateString('sv-SE'));
  const [dataFim, setDataFim] = useState(new Date().toLocaleDateString('sv-SE'));
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    atendidas: 0,
    canceladas: 0,
    tempoMedioEspera: 0,
    tempoMedioAtendimento: 0
  });

  const fetchRelatorio = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/relatorios?inicio=${dataInicio}&fim=${dataFim}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Erro ao buscar relatórios', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRelatorio();
  }, []);

  const exportarCSV = () => {
    const rows = [
      ["Relatorio de Atendimento", "ChamaAi"],
      ["Periodo", `${dataInicio} ate ${dataFim}`],
      [""],
      ["Metrica", "Valor"],
      ["Total Emitidas", stats.total],
      ["Atendidas", stats.atendidas],
      ["Canceladas/Nao Compareceu", stats.canceladas],
      ["Tempo Medio de Espera (min)", stats.tempoMedioEspera.toFixed(1)],
      ["Tempo Medio de Atendimento (min)", stats.tempoMedioAtendimento.toFixed(1)],
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + rows.map(e => e.join(";")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Relatorio_ChamaAi_${dataInicio}_${dataFim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Relatórios & Histórico</h1>
            <p className="text-primary text-sm font-semibold mt-1">Analise o desempenho por período</p>
          </div>
          
          <Button 
            onClick={exportarCSV}
            icon={<Download className="h-4 w-4" />}
          >
            Exportar Excel (CSV)
          </Button>
        </div>

        {/* Filtros */}
        <div className="bg-surface p-6 rounded-md border border-outline-variant shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input 
              type="date" 
              label="Data início"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              leadingIcon={<Calendar className="h-4 w-4 text-primary" />}
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <Input 
              type="date" 
              label="Data fim"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              leadingIcon={<Calendar className="h-4 w-4 text-primary" />}
            />
          </div>

          <Button 
            onClick={fetchRelatorio}
            loading={loading}
            className="px-8"
            icon={<Search className="h-4 w-4" />}
          >
            Filtrar
          </Button>
        </div>

        {/* Cards de Métricas */}
        {loading ? (
          <StatusBadge variant="loading" />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-md flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider mb-1">Total de senhas</p>
                <h3 className="text-3xl font-bold text-ink font-display">{stats.total}</h3>
              </div>

              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant border-b-4 border-b-success">
                <div className="w-10 h-10 bg-success/10 text-success rounded-md flex items-center justify-center mb-4">
                  <Users className="h-5 w-5" />
                </div>
                <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider mb-1">Atendidas</p>
                <h3 className="text-3xl font-bold text-ink font-display">{stats.atendidas}</h3>
              </div>

              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant border-b-4 border-b-error">
                <div className="w-10 h-10 bg-error/10 text-error rounded-md flex items-center justify-center mb-4">
                  <Users className="h-5 w-5" />
                </div>
                <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider mb-1">Canceladas</p>
                <h3 className="text-3xl font-bold text-ink font-display">{stats.canceladas}</h3>
              </div>

              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant border-b-4 border-b-primary">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-md flex items-center justify-center mb-4">
                  <Clock className="h-5 w-5" />
                </div>
                <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider mb-1">Espera média</p>
                <h3 className="text-3xl font-bold text-ink font-display">{stats.tempoMedioEspera.toFixed(1)} <span className="text-xs text-ink-variant font-sans font-medium">min</span></h3>
              </div>

              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant border-b-4 border-b-primary">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-md flex items-center justify-center mb-4">
                  <Clock className="h-5 w-5" />
                </div>
                <p className="text-ink-variant text-xs font-semibold uppercase tracking-wider mb-1">Atendimento médio</p>
                <h3 className="text-3xl font-bold text-ink font-display">{stats.tempoMedioAtendimento.toFixed(1)} <span className="text-xs text-ink-variant font-sans font-medium">min</span></h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Horários de Pico */}
              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-primary/10 text-primary rounded-sm flex items-center justify-center">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-base font-bold text-ink">Horários de pico</h3>
                </div>
                <div className="h-48 flex items-end justify-between gap-2 mt-4">
                  {(stats.porHora || []).map((item, i) => {
                    const max = Math.max(...(stats.porHora || []).map(x => x.quantidade), 1);
                    const pct = (item.quantidade / max) * 100;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group">
                        <div className="w-full relative flex justify-center h-full items-end">
                          <div 
                            className="w-full bg-primary/20 rounded-t-sm group-hover:bg-primary transition-all duration-300 relative overflow-hidden" 
                            style={{ height: `${pct}%` }}
                          >
                            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-primary/50 to-transparent h-1/2"></div>
                          </div>
                          {/* Tooltip on hover */}
                          <span className="absolute -top-8 bg-ink text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-dropdown">
                            {item.quantidade}
                          </span>
                        </div>
                        <span className="text-ink-variant text-[10px] font-bold mt-2">{item.hora}h</span>
                      </div>
                    );
                  })}
                  {(!stats.porHora || stats.porHora.length === 0) && (
                    <StatusBadge variant="empty" message="Sem dados de pico" className="w-full h-full py-0" />
                  )}
                </div>
              </div>

              {/* Desempenho por Setor */}
              <div className="bg-surface p-6 rounded-md shadow-sm border border-outline-variant">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-success/10 text-success rounded-sm flex items-center justify-center">
                    <Users className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-base font-bold text-ink">Fluxo por setor</h3>
                </div>
                
                <div className="space-y-4">
                  {(stats.porBalcao || []).map((setor, i) => {
                    const total = stats.porBalcao?.reduce((acc, curr) => acc + curr.quantidade, 0) || 1;
                    const pct = ((setor.quantidade / total) * 100).toFixed(1);
                    const colors = ['bg-primary', 'bg-secondary', 'bg-success', 'bg-warning', 'bg-error'];
                    return (
                      <div key={i}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-bold text-ink uppercase tracking-wide">{setor.nome}</span>
                          <span className="text-xs font-semibold text-ink-variant">{pct}% ({setor.quantidade})</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {(!stats.porBalcao || stats.porBalcao.length === 0) && (
                    <StatusBadge variant="empty" message="Sem dados de setor" className="py-2" />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-ink text-white p-8 rounded-md shadow-md relative overflow-hidden group">
              <div className="relative z-10">
                <h2 className="text-xl font-bold font-sans leading-tight max-w-2xl">
                  {stats.atendidas > 0 
                    ? `Sua taxa de eficiência é de ${((stats.atendidas / stats.total) * 100).toFixed(1)}%. Ótimo desempenho!`
                    : 'Analise o fluxo do seu estabelecimento em tempo real.'}
                </h2>
              </div>
              <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 rounded-full opacity-20 blur-3xl group-hover:bg-primary/20 transition-all duration-700"></div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
