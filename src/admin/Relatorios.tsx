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
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
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
    // Gerar um CSV simples com os dados atuais
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
      + rows.map(e => e.join(";")).join("\n"); // Usando ; para compatibilidade com Excel em PT-BR

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
      <div className="max-w-6xl mx-auto space-y-8 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div>
            <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">Relatórios & Histórico</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold text-primary tracking-widest">Analise o desempenho por período</p>
          </div>
          
          <button 
            onClick={exportarCSV}
            className="bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95 flex items-center gap-2 outline-none uppercase tracking-widest text-xs"
          >
            <Download size={18} />
            Exportar Excel (CSV)
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-surface p-8 rounded-[32px] shadow-sm border border-outline-variant/50 flex flex-wrap gap-6 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-3 ml-1">Data início</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={18} />
              <input 
                type="date" 
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-background border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-bold text-ink" 
              />
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-3 ml-1">Data fim</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={18} />
              <input 
                type="date" 
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-background border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-bold text-ink" 
              />
            </div>
          </div>

          <button 
            onClick={fetchRelatorio}
            disabled={loading}
            className="bg-ink text-white px-10 py-3 rounded-xl font-bold hover:bg-black transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 uppercase tracking-widest text-xs"
          >
            <Search size={18} />
            {loading ? 'Buscando...' : 'Filtrar'}
          </button>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-surface p-8 rounded-[24px] shadow-sm border border-outline-variant/50">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
              <FileText size={24} />
            </div>
            <p className="text-ink-secondary text-xs font-bold tracking-widest mb-2">Total de senhas</p>
            <h3 className="text-4xl font-black text-ink font-sans">{stats.total}</h3>
          </div>

          <div className="bg-surface p-8 rounded-[24px] shadow-sm border border-success/20 border-b-8 border-b-success">
            <div className="w-12 h-12 bg-success/10 text-success rounded-2xl flex items-center justify-center mb-6">
              <Users size={24} />
            </div>
            <p className="text-ink-secondary text-xs font-bold tracking-widest mb-2">Atendidas</p>
            <h3 className="text-4xl font-black text-ink font-sans">{stats.atendidas}</h3>
          </div>

          <div className="bg-surface p-8 rounded-[24px] shadow-sm border border-error/20 border-b-8 border-b-error">
            <div className="w-12 h-12 bg-error/10 text-error rounded-2xl flex items-center justify-center mb-6">
              <Users size={24} />
            </div>
            <p className="text-ink-secondary text-xs font-bold tracking-widest mb-2">Canceladas</p>
            <h3 className="text-4xl font-black text-ink font-sans">{stats.canceladas}</h3>
          </div>

          <div className="bg-surface p-8 rounded-[24px] shadow-sm border border-primary/20 border-b-8 border-b-primary">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
              <Clock size={24} />
            </div>
            <p className="text-ink-secondary text-xs font-bold tracking-widest mb-2">Espera média</p>
            <h3 className="text-4xl font-black text-ink font-sans">{stats.tempoMedioEspera.toFixed(1)} <span className="text-sm">min</span></h3>
          </div>

          <div className="bg-surface p-8 rounded-[24px] shadow-sm border border-primary/20 border-b-8 border-b-primary">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
              <Clock size={24} />
            </div>
            <p className="text-ink-secondary text-xs font-bold tracking-widest mb-2">Atendimento médio</p>
            <h3 className="text-4xl font-black text-ink font-sans">{stats.tempoMedioAtendimento.toFixed(1)} <span className="text-sm">min</span></h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Horários de Pico */}
          <div className="bg-surface p-8 rounded-[32px] shadow-sm border border-outline-variant/50">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <h3 className="font-sans text-xl font-bold text-ink tracking-widest">Horários de pico</h3>
            </div>
            <div className="h-48 flex items-end justify-between gap-2 mt-4">
              {(stats.porHora || []).map((item, i) => {
                // max logic for percentage
                const max = Math.max(...(stats.porHora || []).map(x => x.quantidade), 1);
                const pct = (item.quantidade / max) * 100;
                return (
                <div key={i} className="flex flex-col items-center flex-1 group">
                  <div className="w-full relative flex justify-center h-full items-end">
                    <div 
                      className="w-full bg-primary/20 rounded-t-lg group-hover:bg-primary transition-all duration-300 relative overflow-hidden" 
                      style={{ height: `${pct}%` }}
                    >
                      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-primary/50 to-transparent h-1/2"></div>
                    </div>
                    {/* Tooltip on hover */}
                    <span className="absolute -top-8 bg-ink text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.quantidade}
                    </span>
                  </div>
                  <span className="text-ink-secondary text-xs font-bold mt-3 uppercase">{item.hora}h</span>
                </div>
              )})}
            </div>
          </div>

          {/* Desempenho por Setor */}
          <div className="bg-surface p-8 rounded-[32px] shadow-sm border border-outline-variant/50">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-success/10 text-success rounded-xl flex items-center justify-center">
                <Users size={20} />
              </div>
              <h3 className="font-sans text-xl font-bold text-ink tracking-widest">Fluxo por setor</h3>
            </div>
            
            <div className="space-y-6">
              {(stats.porBalcao || []).map((setor, i) => {
                const total = stats.porBalcao?.reduce((acc, curr) => acc + curr.quantidade, 0) || 1;
                const pct = ((setor.quantidade / total) * 100).toFixed(1);
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-red-500', 'bg-yellow-500', 'bg-purple-500'];
                return (
                <div key={i}>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-ink uppercase tracking-wider">{setor.nome}</span>
                    <span className="text-sm font-bold text-ink-secondary">{pct}% ({setor.quantidade})</span>
                  </div>
                  <div className="w-full h-3 bg-surface-variant rounded-full overflow-hidden">
                    <div className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>

        <div className="bg-ink text-white p-10 rounded-[40px] shadow-2xl relative overflow-hidden group">
          <div className="relative z-10">
            <h2 className="text-3xl font-bold font-sans leading-tight max-w-2xl uppercase tracking-wider">
              {stats.atendidas > 0 
                ? `Sua taxa de eficiência é de ${((stats.atendidas / stats.total) * 100).toFixed(1)}%. Ótimo desempenho!`
                : 'Analise o fluxo do seu supermercado em tempo real.'}
            </h2>
          </div>
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 rounded-full opacity-20 blur-3xl group-hover:bg-primary/20 transition-all duration-700"></div>
        </div>
      </div>
    </AdminLayout>
  );
}
