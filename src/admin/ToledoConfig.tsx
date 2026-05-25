import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { AlertTriangle } from 'lucide-react';

const CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /mussarela|queijo|requeijão|ricota|provolone/i, category: 'Queijos e Laticínios' },
  { pattern: /linguiça|salame|presunto|apresuntado|mortadela|bacon|salsicha|carne/i, category: 'Embutidos, Frios e Carnes' },
  { pattern: /peixe|bacalhau|camarão|salmão|merluza|atum/i, category: 'Peixes e Frutos do Mar' },
  { pattern: /castanha|nozes|amendoim|amêndoa|pistache|avelã/i, category: 'Oleaginosas e Castanhas' },
  { pattern: /uva passa|ameixa|tâmara|damasco|fruta seca|cranberry/i, category: 'Frutas Secas e Desidratadas' },
  { pattern: /farinha|polvilho|amido|tapioca|fubá/i, category: 'Farinhas, Amidos e Polvilhos' },
  { pattern: /feijão|arroz|grão de bico|lentilha|soja|aveia|quinoa/i, category: 'Grãos, Cereais e Sementes' },
  { pattern: /tempero|orégano|pimenta|azeitona|alcaparra|conserva|alho/i, category: 'Temperos, Especiarias e Conservas' },
  { pattern: /chá|suplemento|whey|creatina|ômega|vitamina/i, category: 'Suplementos, Chás e Produtos Naturais' },
];

export function sugerirCategoria(descricao: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(descricao)) {
      return rule.category;
    }
  }
  return null;
}

interface ToledoProduto {
  plu: string;
  descricao: string;
  preco: number;
  categoria: string;
  atualizado_em: string;
}

interface ToledoLog {
  id: number;
  itens_processados: number;
  precos_atualizados: number;
  mensagem: string;
  criado_em: string;
}

export default function ToledoConfig() {
  const [produtos, setProdutos] = useState<ToledoProduto[]>([]);
  const [logs, setLogs] = useState<ToledoLog[]>([]);
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isMasterServer, setIsMasterServer] = useState(true);
  const [activeTab, setActiveTab] = useState<'produtos' | 'categorias' | 'logs' | 'ordenar'>('produtos');
  const [searchQuery, setSearchQuery] = useState('');
  const [novoPlu, setNovoPlu] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('Queijos e Laticínios');
  const API_URL = getApiUrl();
  const [categoriasOrdem, setCategoriasOrdem] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const arr = [...categoriasOrdem];
    const draggedItem = arr[draggedIndex];
    arr.splice(draggedIndex, 1);
    arr.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setCategoriasOrdem(arr);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const CATEGORIAS_PADRAO = [
    { id: 'Queijos e Laticínios', icon: '🧀' },
    { id: 'Embutidos, Frios e Carnes', icon: '🥩' },
    { id: 'Peixes e Frutos do Mar', icon: '🐟' },
    { id: 'Oleaginosas e Castanhas', icon: '🥜' },
    { id: 'Frutas Secas e Desidratadas', icon: '🍇' },
    { id: 'Farinhas, Amidos e Polvilhos', icon: '🌾' },
    { id: 'Grãos, Cereais e Sementes', icon: '🌱' },
    { id: 'Temperos, Especiarias e Conservas', icon: '🌿' },
    { id: 'Suplementos, Chás e Produtos Naturais', icon: '🍵' },
    { id: 'Outros e Utilidades', icon: '📦' },
  ];

  const safeFetchJson = async (url: string, fallback: any = []) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return fallback;
      const text = await res.text();
      return text ? JSON.parse(text) : fallback;
    } catch {
      return fallback;
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [prodData, logData, catData, cfgData] = await Promise.all([
        safeFetchJson(`${API_URL}/api/toledo/produtos`, []),
        safeFetchJson(`${API_URL}/api/toledo/log`, []),
        safeFetchJson(`${API_URL}/api/toledo/categorias`, {}),
        safeFetchJson(`${API_URL}/api/configuracoes`, {}),
      ]);
      setProdutos(prodData);
      setLogs(logData);
      setCategorias(catData);
      setConfig(cfgData);
      // Carrega ordem das categorias
      const ordemData = await safeFetchJson(`${API_URL}/api/toledo/categorias-ordem`, []);
      if (Array.isArray(ordemData) && ordemData.length > 0) {
        setCategoriasOrdem(ordemData);
      } else {
        // Gera ordem padrão a partir das categorias únicas existentes
        const cats = [...new Set(prodData.map((p: any) => p.categoria || 'Outros'))];
        setCategoriasOrdem(cats as string[]);
      }
    } catch (err) {
      console.error('Erro ao buscar dados Toledo:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/status`);
      if (res.ok) {
        const data = await res.json();
        setIsMasterServer(data.isMaster);
      }
    } catch (err) {
      console.error('Erro ao verificar status de admin:', err);
    }
  };

  useEffect(() => {
    fetchAdminStatus();
    fetchAll();
  }, []);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/toledo/refresh`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Processamento concluído');
      await fetchAll();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveAllConfigs = async () => {
    try {
      await fetch(`${API_URL}/api/configuracoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  const toggleOferta = async (produto: ToledoProduto) => {
    const isOferta = produto.descricao.includes('* OFERTA *') || produto.descricao.includes('OFERTA') || produto.descricao.includes('*');
    let newDescricao = produto.descricao;
    
    if (isOferta) {
      newDescricao = newDescricao.replace(/\* OFERTA \*/g, '').replace(/OFERTA/g, '').replace(/\*/g, '').trim();
    } else {
      newDescricao = `* OFERTA * ${newDescricao}`;
    }

    try {
      await fetch(`${API_URL}/api/toledo/produtos/${produto.plu}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: newDescricao })
      });
      setProdutos(produtos.map(p => p.plu === produto.plu ? { ...p, descricao: newDescricao } : p));
    } catch (err: any) {
      alert(`Erro ao atualizar oferta: ${err.message}`);
    }
  };

  const handleAddCategoria = () => {
    if (!novoPlu.trim() || !novaCategoria.trim()) {
      alert('Preencha o código PLU e o nome da categoria.');
      return;
    }
    const updated = { ...categorias, [novoPlu.trim()]: novaCategoria.trim() };
    saveCategorias(updated);
    setNovoPlu('');
    setNovaCategoria('');
  };

  const handleRemoveCategoria = (plu: string) => {
    const updated = { ...categorias };
    delete updated[plu];
    saveCategorias(updated);
  };

  const handleChangeCategoria = async (produto: ToledoProduto, novaCat: string) => {
    const updated = { ...categorias, [produto.plu]: novaCat };
    setProdutos(produtos.map(p => p.plu === produto.plu ? { ...p, categoria: novaCat } : p));
    await saveCategorias(updated);
  };

  const saveCategorias = async (data: Record<string, string>) => {
    try {
      await fetch(`${API_URL}/api/toledo/categorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setCategorias(data);
    } catch (err: any) {
      alert(`Erro ao salvar categorias: ${err.message}`);
    }
  };

  const formatPreco = (preco: number) => {
    const reais = Math.floor(preco / 100);
    const centavos = preco % 100;
    return `R$ ${reais},${String(centavos).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  // Group products by category for the products tab
  const filteredProdutos = produtos.filter(p => 
    p.descricao.toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(p.plu).includes(searchQuery)
  );

  const grouped = filteredProdutos.reduce((acc, p) => {
    if (!acc[p.categoria]) acc[p.categoria] = [];
    acc[p.categoria].push(p);
    return acc;
  }, {} as Record<string, ToledoProduto[]>);

  const encarteAtivo = config.toledo_encarte_ativo === '1';

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <span className="material-symbols-outlined text-white text-2xl">scale</span>
              </div>
              <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">
                Toledo — Encarte
              </h1>
            </div>
            <p className="text-ink-secondary mt-1 text-lg font-semibold">
              Monitoramento automático de preços da balança Toledo para exibição no Telão.
            </p>
            <div className="flex space-x-3 mt-4">
              <span className={`px-4 py-1 rounded-full text-xs font-bold tracking-widest flex items-center space-x-2 border uppercase ${
                encarteAtivo 
                  ? 'bg-success/10 text-success border-success/20' 
                  : 'bg-error/10 text-error border-error/20'
              }`}>
                <span className="material-symbols-outlined text-sm">
                  {encarteAtivo ? 'check_circle' : 'cancel'}
                </span>
                <span>{encarteAtivo ? 'ENCARTE ATIVO' : 'ENCARTE DESATIVADO'}</span>
              </span>
              <span className="bg-primary/10 px-4 py-1 rounded-full text-xs font-bold tracking-widest text-primary flex items-center space-x-2 border border-primary/20 uppercase">
                <span className="material-symbols-outlined text-sm">inventory_2</span>
                <span>{produtos.length} PRODUTOS</span>
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleForceRefresh}
              disabled={refreshing || !isMasterServer}
              className={`px-6 py-4 bg-ink text-white rounded-xl font-bold shadow-xl transition-all outline-none uppercase tracking-widest text-sm flex items-center gap-2 ${refreshing || !isMasterServer ? 'opacity-50 cursor-not-allowed' : 'hover:bg-ink-light active:scale-95'}`}
            >
              <span className={`material-symbols-outlined ${refreshing ? 'animate-spin' : ''}`}>sync</span>
              {refreshing ? 'Lendo...' : 'Forçar Leitura'}
            </button>
            <button
              onClick={handleSaveAllConfigs}
              disabled={!isMasterServer}
              className={`px-8 py-4 bg-primary text-white rounded-xl font-bold shadow-xl transition-all outline-none uppercase tracking-widest text-sm ${!isMasterServer ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-hover active:scale-95'}`}
            >
              Salvar Alterações
            </button>
          </div>
        </div>

        {/* Master Server Banner */}
        {!isMasterServer && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-bold text-red-800 uppercase tracking-wider">Acesso Restrito: Modo Leitura</h3>
                <div className="mt-1 text-sm text-red-700">
                  <p>Você está acessando as configurações do Toledo a partir de um dispositivo cliente. Alterações administrativas (como mudar layouts, atualizar mapeamento ou forçar leitura) só podem ser realizadas no <b>Servidor Master</b> da loja.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <fieldset disabled={!isMasterServer} className="contents">

        {/* Settings Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Encarte Ativo Toggle */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Encarte no Telão
            </label>
            <button
              onClick={() => handleSaveConfig('toledo_encarte_ativo', encarteAtivo ? '0' : '1')}
              className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${
                encarteAtivo 
                  ? 'bg-success/10 text-success border border-success/20 hover:bg-success/20' 
                  : 'bg-surface-variant text-ink-secondary border border-outline-variant hover:bg-error/10 hover:text-error hover:border-error/20'
              }`}
            >
              {encarteAtivo ? '✓ Ativado' : '✕ Desativado'}
            </button>
          </div>

          {/* Ocultar em Falta Toggle */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Produtos em Falta
            </label>
            <button
              onClick={() => handleSaveConfig('toledo_ocultar_em_falta', config.toledo_ocultar_em_falta === '1' ? '0' : '1')}
              className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${
                config.toledo_ocultar_em_falta === '1'
                  ? 'bg-error/10 text-error border border-error/20 hover:bg-error/20'
                  : 'bg-success/10 text-success border border-success/20 hover:bg-success/20'
              }`}
            >
              {config.toledo_ocultar_em_falta === '1' ? '✕ Ocultar' : '✓ Mostrar'}
            </button>
          </div>

          {/* Duração */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Duração por Slide (seg)
            </label>
            <input
              type="number"
              min="5"
              max="60"
              value={config.toledo_encarte_duracao || '15'}
              onChange={(e) => handleSaveConfig('toledo_encarte_duracao', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Posição na rotação */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Posição na Rotação
            </label>
            <input
              type="number"
              min="0"
              value={config.toledo_encarte_posicao || '0'}
              onChange={(e) => handleSaveConfig('toledo_encarte_posicao', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Após qual mídia o encarte aparece</p>
          </div>

          {/* Itens por slide */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Itens por Slide
            </label>
            <input
              type="number"
              min="4"
              max="96"
              value={config.toledo_itens_por_slide || '12'}
              onChange={(e) => handleSaveConfig('toledo_itens_por_slide', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Quantos produtos cabem na tela</p>
          </div>
          
          {/* Caminho da Pasta Toledo */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm md:col-span-2 lg:col-span-3">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Caminho da Pasta Toledo (Rede/Local)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={"Ex: \\\\serverad\\Santa Paula\\08 - LOJA\\TOLEDO"}
                value={config.toledo_caminho_rede || ''}
                onChange={(e) => setConfig({ ...config, toledo_caminho_rede: e.target.value })}
                onBlur={(e) => handleSaveConfig('toledo_caminho_rede', e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <p className="text-[11px] text-ink-secondary mt-2">
              Pasta onde o arquivo é exportado pelo sistema.
            </p>
          </div>

          {/* Formato do Arquivo */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm md:col-span-2 lg:col-span-2">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Formato de Integração
            </label>
            <select
              value={config.toledo_formato_arquivo || 'toledo_mgv6'}
              onChange={(e) => {
                setConfig({ ...config, toledo_formato_arquivo: e.target.value });
                handleSaveConfig('toledo_formato_arquivo', e.target.value);
              }}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <optgroup label="Balanças & Buscapreço">
                <option value="toledo_mgv5">Toledo MGV5 (TXITENS.TXT)</option>
                <option value="toledo_mgv6">Toledo MGV6 (ITENSMGV.TXT)</option>
                <option value="filizola">Filizola (CADTXT.TXT)</option>
                <option value="gertec">Consulta Preço GERTEC (PRICETAB.TXT)</option>
              </optgroup>
              <optgroup label="Sistemas ERP (CSV/TXT)">
                <option value="hiper_csv">ERP Hiper (LISTAGEMDEPRODUTO.CSV)</option>
                <option value="bedgarline_csv">ERP BeD Garline (RELATORIOPADRAORETRATO.CSV)</option>
                <option value="isolidus_csv">ERP Isolidus (LISTA DE PRODUTOS.CSV)</option>
                <option value="isolidus_txt">ERP Isolidus (IMP.ESTOQUE.TXT)</option>
                <option value="cads_txt">CADS (SYSPPRO.TXT)</option>
                <option value="box_csv">ERP Box (TABELADEPRECOSEMPORIO.CSV)</option>
                <option value="etiqueta_eletronica">Etiqueta Eletrônica (DATA.I1)</option>
              </optgroup>
              <optgroup label="Planilhas (XLSX)">
                <option value="datacaixa_xlsx">Datacaixa (PRODUTOS.XLSX)</option>
                <option value="avanco_xlsx">ERP Avanço (PRODUTOS.XLSX)</option>
              </optgroup>
            </select>
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Selecione a origem dos dados</p>
          </div>

          {/* Colunas */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Qtd. Colunas
            </label>
            <select
              value={config.toledo_encarte_colunas || '3'}
              onChange={(e) => handleSaveConfig('toledo_encarte_colunas', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none text-center"
            >
              <option value="1">1 Coluna</option>
              <option value="2">2 Colunas</option>
              <option value="3">3 Colunas</option>
              <option value="4">4 Colunas</option>
            </select>
          </div>

          {/* Tamanho da Fonte — Descrição */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Fonte Descrição
            </label>
            <select
              value={config.toledo_fonte_descricao || '1.25rem'}
              onChange={(e) => handleSaveConfig('toledo_fonte_descricao', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            >
              <optgroup label="Tamanhos Padrão (rem)">
                <option value="0.9rem">0.9rem (Muito Pequeno)</option>
                <option value="1rem">1.0rem (Pequeno)</option>
                <option value="1.15rem">1.15rem (Médio)</option>
                <option value="1.3rem">1.3rem (Padrão)</option>
                <option value="1.5rem">1.5rem (Médio-Grande)</option>
                <option value="1.8rem">1.8rem (Grande)</option>
                <option value="2.2rem">2.2rem (Muito Grande)</option>
                <option value="2.6rem">2.6rem (Gigante)</option>
                <option value="3rem">3.0rem (Super Gigante)</option>
                <option value="3.5rem">3.5rem (Telão TV)</option>
                <option value="4rem">4.0rem (Telão TV Extra)</option>
                <option value="4.5rem">4.5rem (Telão TV Gigante)</option>
                <option value="5rem">5.0rem (Telão TV Super)</option>
                <option value="6rem">6.0rem (Telão TV Hiper)</option>
                <option value="7rem">7.0rem (Telão TV Mega)</option>
                <option value="8rem">8.0rem (Telão TV Max)</option>
              </optgroup>
              <optgroup label="Auto-Escalonável (Tela Inteira / vw)">
                <option value="1.5vw">1.5vw (Escalonável Pequeno)</option>
                <option value="2vw">2.0vw (Escalonável Médio)</option>
                <option value="2.5vw">2.5vw (Escalonável Grande)</option>
                <option value="3vw">3.0vw (Escalonável Gigante)</option>
                <option value="3.5vw">3.5vw (Escalonável Super)</option>
                <option value="4vw">4.0vw (Escalonável Hiper)</option>
                <option value="5vw">5.0vw (Escalonável Máximo)</option>
              </optgroup>
            </select>
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Tamanho do texto do produto</p>
          </div>

          {/* Tamanho da Fonte — Preço */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Fonte Preço
            </label>
            <select
              value={config.toledo_fonte_preco || '1.75rem'}
              onChange={(e) => handleSaveConfig('toledo_fonte_preco', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-center text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
            >
              <optgroup label="Tamanhos Padrão (rem)">
                <option value="1.25rem">1.25rem (Pequeno)</option>
                <option value="1.5rem">1.5rem (Médio)</option>
                <option value="1.75rem">1.75rem (Padrão)</option>
                <option value="2rem">2.0rem (Grande)</option>
                <option value="2.5rem">2.5rem (Muito Grande)</option>
                <option value="3rem">3.0rem (Extra Grande)</option>
                <option value="3.5rem">3.5rem (Gigante)</option>
                <option value="4rem">4.0rem (Super Gigante)</option>
                <option value="4.5rem">4.5rem (Telão TV)</option>
                <option value="5rem">5.0rem (Telão TV Grande)</option>
                <option value="6rem">6.0rem (Telão TV Imponente)</option>
                <option value="7rem">7.0rem (Telão TV Máximo)</option>
                <option value="8rem">8.0rem (Telão TV Absoluto)</option>
                <option value="9rem">9.0rem (Telão TV Colossal)</option>
                <option value="10rem">10.0rem (Telão TV Titan)</option>
                <option value="12rem">12.0rem (Telão TV Monstruoso)</option>
                <option value="14rem">14.0rem (Telão TV Extremo)</option>
                <option value="16rem">16.0rem (Telão TV Lendário)</option>
                <option value="18rem">18.0rem (Telão TV Supremo)</option>
                <option value="20rem">20.0rem (Telão TV Infinito)</option>
              </optgroup>
              <optgroup label="Auto-Escalonável (Tela Inteira / vw)">
                <option value="3vw">3.0vw (Escalonável Pequeno)</option>
                <option value="4vw">4.0vw (Escalonável Médio)</option>
                <option value="5vw">5.0vw (Escalonável Padrão)</option>
                <option value="6vw">6.0vw (Escalonável Grande)</option>
                <option value="8vw">8.0vw (Escalonável Gigante)</option>
                <option value="10vw">10.0vw (Escalonável Super)</option>
                <option value="12vw">12.0vw (Escalonável Hiper)</option>
                <option value="14vw">14.0vw (Escalonável Máximo)</option>
                <option value="16vw">16.0vw (Escalonável Extremo)</option>
                <option value="18vw">18.0vw (Escalonável Lendário)</option>
                <option value="20vw">20.0vw (Escalonável Supremo)</option>
              </optgroup>
            </select>
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Tamanho do preço no encarte</p>
          </div>

          {/* Ocultar Guichê no Telão */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Guichê no Telão
            </label>
            <button
              onClick={() => handleSaveConfig('telao_ocultar_guiche', config.telao_ocultar_guiche === '1' ? '0' : '1')}
              className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all ${
                config.telao_ocultar_guiche === '1'
                  ? 'bg-error/10 text-error border border-error/20 hover:bg-error/20'
                  : 'bg-success/10 text-success border border-success/20 hover:bg-success/20'
              }`}
            >
              {config.telao_ocultar_guiche === '1' ? '✕ Oculto' : '✓ Visível'}
            </button>
            <p className="text-[10px] text-ink-secondary mt-2 text-center">Exibir guichê na chamada</p>
          </div>

          {/* Estilo do Encarte */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm md:col-span-2 lg:col-span-5">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Estilo do Encarte
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'kg', label: '🌙 Preços por KG (Escuro)', desc: 'Layout dark com colunas, ideal para carnes e frios' },
                { id: 'granel', label: '🌿 Granel Premium (Claro)', desc: 'Layout premium com cards e animações, ideal para produtos a granel' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSaveConfig('toledo_encarte_estilo', s.id)}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all outline-none text-left ${
                    (config.toledo_encarte_estilo || 'kg') === s.id
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                      : 'border-outline-variant/50 bg-surface hover:bg-surface-variant/50'
                  }`}
                >
                  <span className="font-bold text-sm text-ink">{s.label}</span>
                  <span className="text-[10px] text-ink-secondary mt-1">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tema Visual */}
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/50 shadow-sm md:col-span-2 lg:col-span-5">
            <label className="text-xs font-bold text-ink-secondary uppercase tracking-widest block mb-3">
              Tema Visual do Encarte
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: 'padrao', label: 'Verde (Padrão)', color: 'bg-emerald-500' },
                { id: 'acougue', label: 'Açougue (Vermelho)', color: 'bg-red-500' },
                { id: 'hortifruti', label: 'Hortifruti (Lima)', color: 'bg-lime-500' },
                { id: 'padaria', label: 'Padaria (Ouro)', color: 'bg-amber-500' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSaveConfig('toledo_encarte_tema', t.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all outline-none ${
                    (config.toledo_encarte_tema || 'padrao') === t.id
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                      : 'border-outline-variant/50 bg-surface hover:bg-surface-variant/50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full ${t.color} shadow-sm`}></div>
                  <span className="font-bold text-sm text-ink">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-outline-variant/30">
          {(['produtos', 'categorias', 'ordenar', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
                activeTab === tab
                  ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
              }`}
            >
              {tab === 'produtos' && '📦 Produtos'}
              {tab === 'categorias' && '🏷️ Categorias'}
              {tab === 'ordenar' && '🔀 Ordem Portal'}
              {tab === 'logs' && '📋 Logs'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-outline-variant animate-spin">sync</span>
            <p className="text-ink-secondary mt-4 font-bold uppercase tracking-widest">Carregando...</p>
          </div>
        ) : (
          <>
            {/* Products Tab */}
            {activeTab === 'produtos' && (
              <div className="space-y-6">
                
                {/* Barra de Busca */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-ink-secondary">search</span>
                  <input 
                    type="text" 
                    placeholder="Buscar por código ou descrição do produto..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                {filteredProdutos.length === 0 ? (
                  <div className="text-center py-20 bg-surface rounded-3xl border border-dashed border-outline-variant">
                    <span className="material-symbols-outlined text-6xl text-outline-variant mb-4">scale</span>
                    <p className="text-xl font-bold text-ink-secondary uppercase tracking-widest">Nenhum produto Toledo encontrado</p>
                    <p className="text-ink-secondary/60 mt-2">Nenhum produto corresponde à sua pesquisa ou a balança ainda não enviou arquivos.</p>
                  </div>
                ) : (
                  Object.entries(grouped).sort(([a], [b]) => {
                    if (a === 'Outros') return 1;
                    if (b === 'Outros') return -1;
                    return a.localeCompare(b, 'pt-BR');
                  }).map(([categoria, items]) => (
                    <div key={categoria} className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30 flex items-center justify-between">
                        <h3 className="font-bold text-lg text-ink uppercase tracking-wider">{categoria}</h3>
                        <span className="text-xs font-bold text-ink-secondary tracking-widest uppercase">
                          {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                      <div className="divide-y divide-outline-variant/20">
                        {items.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map(p => {
                          const isOferta = p.descricao.includes('* OFERTA *') || p.descricao.includes('OFERTA') || p.descricao.includes('*');
                          return (
                            <div key={p.plu} className={`px-6 py-3 flex items-center justify-between hover:bg-surface-variant/20 transition-colors ${isOferta ? 'bg-error/5 border-l-4 border-error' : ''}`}>
                              <div className="flex items-center gap-4 flex-1 mr-4 overflow-hidden">
                                <span className="text-xs font-mono text-ink-secondary bg-surface-variant px-2 py-1 rounded-lg shrink-0">{p.plu}</span>
                                <span className={`font-semibold truncate shrink-0 ${isOferta ? 'text-error' : 'text-ink'}`} style={{ maxWidth: '300px' }}>{p.descricao}</span>
                                <select 
                                  value={p.categoria}
                                  onChange={(e) => handleChangeCategoria(p, e.target.value)}
                                  disabled={!isMasterServer}
                                  className="text-xs font-bold bg-surface border border-outline-variant rounded-lg px-2 py-1.5 outline-none focus:border-primary disabled:opacity-50"
                                >
                                  {CATEGORIAS_PADRAO.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                                  {!CATEGORIAS_PADRAO.find(c => c.id === p.categoria) && <option value={p.categoria}>{p.categoria}</option>}
                                </select>
                                {(() => {
                                  const sugestao = sugerirCategoria(p.descricao);
                                  if (sugestao && sugestao !== p.categoria) {
                                    return (
                                      <button
                                        onClick={() => handleChangeCategoria(p, sugestao)}
                                        disabled={!isMasterServer}
                                        title="Atribuir Categoria Sugerida"
                                        className="ml-2 px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md hover:bg-amber-200 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                      >
                                        💡 Sugestão: {sugestao}
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <span className={`font-black text-lg block ${p.preco === 0 ? 'text-error' : 'text-emerald-600'}`}>
                                    {p.preco === 0 ? 'PRODUTO EM FALTA 🥲' : `${formatPreco(p.preco)}/kg`}
                                  </span>
                                  <span className="text-[10px] text-ink-secondary/50 font-bold block">{formatDate(p.atualizado_em)}</span>
                                </div>
                                <button 
                                  onClick={() => toggleOferta(p)}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                    isOferta 
                                      ? 'bg-error text-white shadow-lg hover:bg-error-dark' 
                                      : 'bg-surface-variant text-ink-secondary border border-outline-variant hover:bg-error/10 hover:text-error hover:border-error/30'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">{isOferta ? 'local_fire_department' : 'star'}</span>
                                  <span>{isOferta ? 'Remover Oferta' : 'Destacar'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Categories Tab */}
            {activeTab === 'categorias' && (
              <div className="space-y-6">
                {/* Add new category mapping */}
                <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
                  <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4">Adicionar Mapeamento</h3>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-2">Código PLU</label>
                      <input
                        type="text"
                        value={novoPlu}
                        onChange={(e) => setNovoPlu(e.target.value)}
                        placeholder="Ex: 1441"
                        maxLength={4}
                        className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-2">Categoria Visual</label>
                      <select
                        value={novaCategoria}
                        onChange={(e) => setNovaCategoria(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                      >
                        {CATEGORIAS_PADRAO.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAddCategoria}
                      disabled={!isMasterServer}
                      className="bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-hover transition-all active:scale-95 flex items-center space-x-2 outline-none uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      <span>Adicionar</span>
                    </button>
                  </div>
                  {/* Sugestão baseada no PLU digitado */}
                  {novoPlu && (() => {
                    const prodMatch = produtos.find(p => p.plu === novoPlu);
                    if (prodMatch) {
                      const sugestao = sugerirCategoria(prodMatch.descricao);
                      return (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="text-sm flex flex-col">
                            <span className="font-bold text-blue-900">{prodMatch.descricao}</span>
                            {sugestao && <span className="text-blue-700 mt-1">💡 Categoria Sugerida: <b>{sugestao}</b></span>}
                          </div>
                          {sugestao && novaCategoria !== sugestao && isMasterServer && (
                            <button
                              onClick={() => setNovaCategoria(sugestao)}
                              className="text-xs font-bold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                            >
                              Aplicar Sugestão
                            </button>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Existing mappings */}
                <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30">
                    <h3 className="font-bold text-sm text-ink uppercase tracking-widest">Mapeamentos Atuais ({Object.keys(categorias).length})</h3>
                  </div>
                  {Object.keys(categorias).length === 0 ? (
                    <div className="p-8 text-center text-ink-secondary">
                      <p className="font-bold uppercase tracking-widest">Nenhum mapeamento cadastrado</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-outline-variant/20">
                      {Object.entries(categorias).sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR')).map(([plu, cat]) => (
                        <div key={plu} className="px-6 py-3 flex items-center justify-between hover:bg-surface-variant/20 transition-colors">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg min-w-[60px] text-center">{plu}</span>
                            <span className="text-ink-secondary">→</span>
                            <span className="font-bold text-ink flex items-center gap-2">
                              <span>{CATEGORIAS_PADRAO.find(c => c.id === cat)?.icon || '📦'}</span>
                              {cat}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveCategoria(plu)}
                            className="text-outline-variant hover:text-error transition-colors p-2 outline-none"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
                  <span className="material-symbols-outlined text-amber-600 text-2xl mt-0.5">info</span>
                  <div>
                    <p className="font-bold text-amber-800 text-sm">Sobre os mapeamentos de categorias</p>
                    <p className="text-amber-700 text-sm mt-1">
                      O código PLU identifica cada produto na balança Toledo. Associe-o a uma categoria para
                      agrupar os itens no encarte do Telão. Produtos sem mapeamento aparecerão em "Outros".
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Ordenar Categorias Tab */}
            {activeTab === 'ordenar' && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="font-bold text-amber-800 text-sm">Ordem de exibição no Portal do Cliente</p>
                  <p className="text-xs text-amber-700 mt-1">Defina a ordem em que as categorias aparecem no celular do cliente. Clique e **arraste as categorias para cima ou para baixo** para reordenar de forma simples e rápida!</p>
                </div>

                <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-ink uppercase tracking-widest">Categorias ({categoriasOrdem.length})</h3>
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`${API_URL}/api/toledo/categorias-ordem`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(categoriasOrdem)
                          });
                          alert('Ordem salva com sucesso!');
                        } catch {
                          alert('Erro ao salvar.');
                        }
                      }}
                      className="bg-primary text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
                    >
                      Salvar Ordem
                    </button>
                  </div>
                  <div className="divide-y divide-outline-variant/20">
                    {categoriasOrdem.map((cat, i) => (
                      <div 
                        key={cat} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                        className={`px-6 py-4 flex items-center justify-between hover:bg-surface-variant/20 transition-all duration-150 cursor-grab active:cursor-grabbing border-b border-outline-variant/10 select-none ${
                          draggedIndex === i ? 'bg-primary/10 border-2 border-dashed border-primary/40 rounded-xl opacity-50 scale-[0.98]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-ink-secondary/40">drag_indicator</span>
                          <span className="bg-primary/10 text-primary font-black text-xs w-7 h-7 flex items-center justify-center rounded-lg">{i + 1}</span>
                          <span className="font-bold text-ink">{CATEGORIAS_PADRAO.find(c => c.id === cat)?.icon || '📦'} {cat}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            disabled={i === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              const arr = [...categoriasOrdem];
                              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                              setCategoriasOrdem(arr);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-variant text-ink-secondary hover:text-primary disabled:opacity-20 transition-colors"
                          >▲</button>
                          <button
                            disabled={i === categoriasOrdem.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              const arr = [...categoriasOrdem];
                              [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                              setCategoriasOrdem(arr);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-variant text-ink-secondary hover:text-primary disabled:opacity-20 transition-colors"
                          >▼</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30">
                  <h3 className="font-bold text-sm text-ink uppercase tracking-widest">Histórico de Processamento</h3>
                </div>
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-ink-secondary">
                    <p className="font-bold uppercase tracking-widest">Nenhum log registrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/20">
                    {logs.map(log => (
                      <div key={log.id} className="px-6 py-3 flex items-center gap-6 hover:bg-surface-variant/20 transition-colors">
                        <span className={`material-symbols-outlined text-lg ${
                          log.mensagem?.startsWith('ERRO') ? 'text-error' : 'text-success'
                        }`}>
                          {log.mensagem?.startsWith('ERRO') ? 'error' : 'check_circle'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-ink font-semibold text-sm truncate">{log.mensagem}</p>
                          <p className="text-[10px] text-ink-secondary font-bold uppercase tracking-widest mt-0.5">
                            {log.itens_processados} itens • {log.precos_atualizados} atualizados
                          </p>
                        </div>
                        <span className="text-xs text-ink-secondary font-mono shrink-0">
                          {formatDate(log.criado_em)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </fieldset>
      </div>
    </AdminLayout>
  );
}
