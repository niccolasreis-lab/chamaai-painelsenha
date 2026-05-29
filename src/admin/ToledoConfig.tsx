import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { AlertTriangle } from 'lucide-react';

const CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /mussarela|queijo|requeijão|ricota|provolone|brie|coalho|emental|parmesao|parmesão|gorgonzola/i, category: 'Mesa de Frios, Queijos e Antepastos' },
  { pattern: /frios|apresuntado|presunto|mortadela|salame|copa|lombo|peito de peru|alcaparra|azeitona|antepasto|conserva/i, category: 'Mesa de Frios, Queijos e Antepastos' },
  { pattern: /linguiça|linguica|bacon|paio|carne seca|charque|churrasco|panceta|costelinha|carne/i, category: 'Ingredientes para Feijoada e Churrasco' },
  { pattern: /peixe|bacalhau|camarão|camarao|salmão|salmao|pescados|iberico|ibérico|azeite/i, category: 'Pescados e Empório Tradicional Ibérico' },
  { pattern: /lanche|snack|castanha|nozes|amendoim|amêndoa|pistache|biscoito|bolacha|salgadinho/i, category: 'Hora do Lanche e Snacks' },
  { pattern: /sobremesa|doce|bolo|tortinha|confeitaria|chocolate|coco|calda|leite condensado/i, category: 'Confeitaria e Sobremesas' },
  { pattern: /fitness|suplemento|whey|creatina|proteina|proteína|albumina|colageno/i, category: 'Mundo Fitness e Suplementação' },
  { pattern: /natural|graos|grãos|farinha|semente|chia|quinoa|aveia|linhaça/i, category: 'Empório Natural, Grãos e Farinhas Naturais' },
  { pattern: /arabe|árabe|especiarias|ervas|tempero|orégano|pimenta|cominho|curry/i, category: 'Cantinho Árabe, Especiarias e Ervas' },
];

export const SETORES_PADRAO = [
  'AZEITONAS',
  'QUEIJOS',
  'TEMPEROS',
  'CASTANHAS',
  'Outros'
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
  const [novaCategoria, setNovaCategoria] = useState('');
  const API_URL = getApiUrl();
  const [categoriasOrdem, setCategoriasOrdem] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [showMasterLogin, setShowMasterLogin] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [masterLoginError, setMasterLoginError] = useState('');
  const [masterLoginLoading, setMasterLoginLoading] = useState(false);
  const [isMasterRemote, setIsMasterRemote] = useState(false);

  // Dynamic Categories CRUD & Import/Export states
  const [categoriasLista, setCategoriasLista] = useState<any[]>([]);
  const [editingCategoria, setEditingCategoria] = useState<any | null>(null);
  const [catNome, setCatNome] = useState('');
  const [catEmoji, setCatEmoji] = useState('');
  const [catDescricao, setCatDescricao] = useState('');
  const [catOrdem, setCatOrdem] = useState(0);
  const [catAtivo, setCatAtivo] = useState(true);
  const [catSetor, setCatSetor] = useState('Outros');
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [showImportModal, setShowImportModal] = useState(false);

  const handleMasterLogin = async () => {
    setMasterLoginLoading(true);
    setMasterLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/auth-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: masterPassword }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('master_remote_token', data.token);
        window.location.reload();
      } else {
        setMasterLoginError(data.error || 'Erro ao autenticar.');
      }
    } catch (err) {
      setMasterLoginError('Erro de conexão com o servidor.');
    } finally {
      setMasterLoginLoading(false);
    }
  };

  const handleMasterLogout = async () => {
    try {
      const token = localStorage.getItem('master_remote_token');
      if (token) {
        await fetch(`${API_URL}/api/admin/logout-master`, {
          method: 'POST',
          headers: { 'X-Master-Token': token },
        });
      }
    } catch (err) {}
    localStorage.removeItem('master_remote_token');
    window.location.reload();
  };

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

  const fetchCategoriasLista = async () => {
    try {
      const res = await fetch(`${API_URL}/api/categorias`);
      if (res.ok) {
        const data = await res.json();
        setCategoriasLista(data);
        if (data.length > 0 && !novaCategoria) {
          setNovaCategoria(data[0].nome);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar categorias dinâmicas:', err);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [prodData, logData, catData, cfgData, catsData] = await Promise.all([
        safeFetchJson(`${API_URL}/api/toledo/produtos`, []),
        safeFetchJson(`${API_URL}/api/toledo/log`, []),
        safeFetchJson(`${API_URL}/api/toledo/categorias`, {}),
        safeFetchJson(`${API_URL}/api/configuracoes`, {}),
        safeFetchJson(`${API_URL}/api/categorias`, []),
      ]);
      setProdutos(prodData);
      setLogs(logData);
      setCategorias(catData);
      setConfig(cfgData);
      setCategoriasLista(catsData);
      if (catsData.length > 0 && !novaCategoria) {
        setNovaCategoria(catsData[0].nome);
      }
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
        setIsMasterRemote(data.isMasterRemote || false);
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

  const handleSaveCategoria = async () => {
    if (!catNome.trim()) {
      alert('O nome da categoria é obrigatório.');
      return;
    }
    const payload = {
      nome: catNome.trim(),
      emoji: catEmoji.trim(),
      descricao: catDescricao.trim(),
      ordem: Number(catOrdem),
      ativo: catAtivo,
      setor: catSetor
    };

    try {
      let res;
      if (editingCategoria) {
        res = await fetch(`${API_URL}/api/categorias/${editingCategoria.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_URL}/api/categorias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        alert(editingCategoria ? 'Categoria atualizada!' : 'Categoria criada com sucesso!');
        setEditingCategoria(null);
        clearCatForm();
        await fetchCategoriasLista();
        const ordemData = await safeFetchJson(`${API_URL}/api/toledo/categorias-ordem`, []);
        setCategoriasOrdem(ordemData);
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error || 'Falha ao salvar'}`);
      }
    } catch (e: any) {
      alert(`Erro de conexão: ${e.message}`);
    }
  };

  const handleEditCategoria = (cat: any) => {
    setEditingCategoria(cat);
    setCatNome(cat.nome);
    setCatEmoji(cat.emoji);
    setCatDescricao(cat.descricao);
    setCatOrdem(cat.ordem);
    setCatAtivo(cat.ativo);
    setCatSetor(cat.setor || 'Mercearia');
  };

  const handleDeleteCategoria = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta categoria? Isso não removerá os produtos, mas eles perderão este mapeamento.')) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/categorias/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Categoria excluída com sucesso!');
        await fetchCategoriasLista();
        const ordemData = await safeFetchJson(`${API_URL}/api/toledo/categorias-ordem`, []);
        setCategoriasOrdem(ordemData);
      } else {
        alert('Erro ao excluir categoria.');
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const clearCatForm = () => {
    setCatNome('');
    setCatEmoji('');
    setCatDescricao('');
    setCatOrdem(0);
    setCatAtivo(true);
    setCatSetor('Outros');
    setEditingCategoria(null);
  };

  const handleImportCategorias = async () => {
    if (!importText.trim()) {
      alert('Insira o conteúdo para importar.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/categorias/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: importText,
          format: importFormat
        })
      });
      if (res.ok) {
        alert('Importação concluída com sucesso!');
        setShowImportModal(false);
        setImportText('');
        await fetchCategoriasLista();
        const ordemData = await safeFetchJson(`${API_URL}/api/toledo/categorias-ordem`, []);
        setCategoriasOrdem(ordemData);
      } else {
        const err = await res.json();
        alert(`Erro na importação: ${err.error || 'Falha'}`);
      }
    } catch (e: any) {
      alert(`Erro de conexão: ${e.message}`);
    }
  };

  const handleExportCategorias = (format: 'json' | 'csv') => {
    window.open(`${API_URL}/api/categorias/export?format=${format}`, '_blank');
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

  const getGroupedCategorias = () => {
    const groupedMap: Record<string, typeof categoriasLista> = {};
    
    SETORES_PADRAO.forEach(setor => {
      groupedMap[setor] = [];
    });
    
    categoriasLista.forEach(c => {
      const s = c.setor || 'Mercearia';
      if (!groupedMap[s]) {
        groupedMap[s] = [];
      }
      groupedMap[s].push(c);
    });
    
    return Object.entries(groupedMap).filter(([, items]) => items.length > 0);
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
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-bold text-red-800 uppercase tracking-wider">Acesso Restrito: Modo Leitura</h3>
                <div className="mt-1 text-sm text-red-700">
                  <p>Você está acessando a partir de um dispositivo cliente. Alterações administrativas só podem ser realizadas no <b>Servidor Master</b> da loja.</p>
                </div>
                {!showMasterLogin ? (
                  <button
                    onClick={() => setShowMasterLogin(true)}
                    className="mt-3 px-4 py-2 bg-red-100 border border-red-300 rounded-xl text-red-800 font-bold text-xs uppercase tracking-widest hover:bg-red-200 transition-all"
                  >
                    🔓 Desbloquear Acesso Remoto
                  </button>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 max-w-sm">
                    <input
                      type="password"
                      placeholder="Senha Master Remoto"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMasterLogin()}
                      className="w-full bg-white border border-red-300 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 text-ink font-semibold"
                      autoFocus
                    />
                    {masterLoginError && <p className="text-red-600 text-xs font-bold">{masterLoginError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleMasterLogin}
                        disabled={masterLoginLoading || !masterPassword}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {masterLoginLoading ? 'Verificando...' : 'Entrar'}
                      </button>
                      <button
                        onClick={() => { setShowMasterLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
                        className="px-4 py-2 bg-red-100 border border-red-300 rounded-xl text-red-800 font-bold text-xs uppercase tracking-widest hover:bg-red-200 transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Remote Session Active Banner */}
        {isMasterRemote && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-6 rounded-r-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-600">verified_user</span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Sessão Master Remota Ativa</h3>
                  <p className="text-xs text-emerald-600">Você tem permissão de administrador via acesso remoto.</p>
                </div>
              </div>
              <button
                onClick={handleMasterLogout}
                className="px-4 py-2 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 font-bold text-xs uppercase tracking-widest hover:bg-emerald-200 transition-all"
              >
                Encerrar Sessão
              </button>
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
                <option value="auto">Automático (Ajustar ao Texto)</option>
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
                <option value="auto">Automático (Ajustar ao Texto)</option>
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
                                  {getGroupedCategorias().map(([setor, cats]) => (
                                    <optgroup key={setor} label={setor.toUpperCase()}>
                                      {cats.map(c => (
                                        <option key={c.nome} value={c.nome}>
                                          {c.emoji} {c.nome}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                  {!categoriasLista.find(c => c.nome === p.categoria) && <option value={p.categoria}>{p.categoria}</option>}
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
                
                {/* 1. GERENCIAR CATEGORIAS DO BANCO */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Formulário de Adicionar / Editar Categoria */}
                  <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">category</span>
                        {editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}
                      </h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Nome da Categoria</label>
                          <input
                            type="text"
                            value={catNome}
                            onChange={(e) => setCatNome(e.target.value)}
                            placeholder="Ex: Adega e Vinhos"
                            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-variant text-ink font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                        
                        <div>
                          <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Emoji / Ícone</label>
                          <input
                            type="text"
                            value={catEmoji}
                            onChange={(e) => setCatEmoji(e.target.value)}
                            placeholder="Ex: 🍷"
                            maxLength={10}
                            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-variant text-ink font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Descrição Personalizada</label>
                          <textarea
                            value={catDescricao}
                            onChange={(e) => setCatDescricao(e.target.value)}
                            placeholder="Descrição para exibir no portal do cliente (opcional)..."
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-variant text-ink font-medium text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Setor / Departamento</label>
                          <select
                            value={catSetor}
                            onChange={(e) => setCatSetor(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-variant text-ink font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                          >
                            {SETORES_PADRAO.map(setor => (
                              <option key={setor} value={setor}>
                                {setor}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Ordem</label>
                            <input
                              type="number"
                              value={catOrdem}
                              onChange={(e) => setCatOrdem(Number(e.target.value))}
                              min="0"
                              className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-2">Ativo</label>
                            <button
                              type="button"
                              onClick={() => setCatAtivo(!catAtivo)}
                              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${
                                catAtivo 
                                  ? 'bg-success/10 text-success border-success/20 hover:bg-success/20' 
                                  : 'bg-surface-variant text-ink-secondary border border-outline-variant hover:bg-error/5 hover:text-error hover:border-error/20'
                              }`}
                            >
                              {catAtivo ? '✓ Sim' : '✕ Não'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                      <button
                        onClick={handleSaveCategoria}
                        disabled={!isMasterServer}
                        className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary-hover active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">save</span>
                        <span>{editingCategoria ? 'Atualizar' : 'Criar'}</span>
                      </button>
                      
                      {editingCategoria && (
                        <button
                          onClick={clearCatForm}
                          className="px-4 bg-surface-variant border border-outline-variant text-ink rounded-xl font-bold hover:bg-surface-variant/80 active:scale-95 transition-all text-xs uppercase tracking-wider"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lista de Categorias Atuais */}
                  <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden lg:col-span-2 flex flex-col justify-between">
                    <div>
                      <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30 flex justify-between items-center">
                        <h3 className="font-bold text-sm text-ink uppercase tracking-widest">Categorias Cadastradas ({categoriasLista.length})</h3>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExportCategorias('json')}
                            className="bg-surface border border-outline-variant hover:bg-surface-variant text-ink-secondary hover:text-ink px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            <span>JSON</span>
                          </button>
                          <button
                            onClick={() => handleExportCategorias('csv')}
                            className="bg-surface border border-outline-variant hover:bg-surface-variant text-ink-secondary hover:text-ink px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            <span>CSV</span>
                          </button>
                          <button
                            onClick={() => setShowImportModal(true)}
                            disabled={!isMasterServer}
                            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[14px]">upload</span>
                            <span>Importar</span>
                          </button>
                        </div>
                      </div>

                      {categoriasLista.length === 0 ? (
                        <div className="p-8 text-center text-ink-secondary">
                          <p className="font-bold uppercase tracking-widest">Nenhuma categoria no banco</p>
                        </div>
                      ) : (
                        <div className="max-h-[300px] overflow-y-auto divide-y divide-outline-variant/20">
                          {categoriasLista.map((c) => (
                            <div key={c.id} className={`px-6 py-3 flex items-center justify-between hover:bg-surface-variant/20 transition-colors ${!c.ativo ? 'opacity-50 bg-surface-variant/10' : ''}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xl shrink-0 w-8 h-8 rounded-lg bg-surface-variant/65 flex items-center justify-center">{c.emoji || '📦'}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-ink text-sm truncate">{c.nome}</span>
                                    <span className="text-[9px] font-bold text-ink-secondary bg-surface-variant px-1.5 py-0.5 rounded-md">Posição: {c.ordem}</span>
                                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{c.setor || 'Mercearia'}</span>
                                    {!c.ativo && (
                                      <span className="text-[9px] font-bold text-error bg-error/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Inativo</span>
                                    )}
                                  </div>
                                  {c.descricao && (
                                    <p className="text-[11px] text-ink-secondary truncate mt-0.5 max-w-[320px]">{c.descricao}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditCategoria(c)}
                                  disabled={!isMasterServer}
                                  className="text-outline-variant hover:text-primary transition-colors p-2 outline-none disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteCategoria(c.id)}
                                  disabled={!isMasterServer}
                                  className="text-outline-variant hover:text-error transition-colors p-2 outline-none disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. MAPEAMENTOS DE PLU */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Adicionar Mapeamento */}
                  <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4">Adicionar Mapeamento PLU</h3>
                      <div className="space-y-4">
                        <div>
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
                        <div>
                          <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-2">Categoria Visual</label>
                          <select
                            value={novaCategoria}
                            onChange={(e) => setNovaCategoria(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                          >
                            {getGroupedCategorias().map(([setor, cats]) => (
                              <optgroup key={setor} label={setor.toUpperCase()}>
                                {cats.map(cat => (
                                  <option key={cat.nome} value={cat.nome}>
                                    {cat.emoji} {cat.nome}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleAddCategoria}
                      disabled={!isMasterServer}
                      className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:bg-primary-hover transition-all active:scale-95 flex items-center justify-center space-x-2 outline-none uppercase tracking-widest text-xs mt-6 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      <span>Vincular PLU</span>
                    </button>
                    
                    {/* Sugestão baseada no PLU digitado */}
                    {novoPlu && (() => {
                      const prodMatch = produtos.find(p => p.plu === novoPlu);
                      if (prodMatch) {
                        const sugestao = sugerirCategoria(prodMatch.descricao);
                        return (
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col gap-2">
                            <span className="font-bold text-xs text-blue-900 leading-tight">{prodMatch.descricao}</span>
                            {sugestao && (
                              <div className="flex items-center justify-between gap-2 mt-1">
                                <span className="text-[10px] text-blue-700">💡 Sugerido: <b>{sugestao}</b></span>
                                {novaCategoria !== sugestao && isMasterServer && (
                                  <button
                                    onClick={() => setNovaCategoria(sugestao)}
                                    className="text-[9px] font-bold bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors"
                                  >
                                    Aplicar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Mapeamentos Atuais */}
                  <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden lg:col-span-2">
                    <div className="px-6 py-4 bg-surface-variant/30 border-b border-outline-variant/30">
                      <h3 className="font-bold text-sm text-ink uppercase tracking-widest">Mapeamentos Atuais ({Object.keys(categorias).length})</h3>
                    </div>
                    {Object.keys(categorias).length === 0 ? (
                      <div className="p-8 text-center text-ink-secondary">
                        <p className="font-bold uppercase tracking-widest">Nenhum mapeamento cadastrado</p>
                      </div>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto divide-y divide-outline-variant/20">
                        {Object.entries(categorias).sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR')).map(([plu, cat]) => {
                          const catObj = categoriasLista.find(c => c.nome === cat);
                          return (
                            <div key={plu} className="px-6 py-2.5 flex items-center justify-between hover:bg-surface-variant/20 transition-colors">
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg min-w-[60px] text-center">{plu}</span>
                                <span className="text-ink-secondary text-xs">→</span>
                                <span className="font-bold text-ink text-sm flex items-center gap-2">
                                  <span className="text-base">{catObj?.emoji || '📦'}</span>
                                  {cat}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveCategoria(plu)}
                                disabled={!isMasterServer}
                                className="text-outline-variant hover:text-error transition-colors p-2 outline-none disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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

                {/* Modal de Importação de Categorias */}
                {showImportModal && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-outline-variant/65 rounded-3xl p-6 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col justify-between overflow-hidden animate-slide-up">
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-ink uppercase tracking-wider flex items-center gap-2">
                            <span className="material-symbols-outlined">upload</span>
                            <span>Importar Categorias</span>
                          </h3>
                          <button 
                            onClick={() => { setShowImportModal(false); setImportText(''); }}
                            className="text-ink-secondary hover:text-ink font-bold text-xl outline-none"
                          >✕</button>
                        </div>

                        <p className="text-xs text-ink-secondary mb-4 leading-relaxed">
                          Cole seu código JSON (formato array de objetos) ou conteúdo CSV. A importação irá mesclar novos itens com os já existentes baseados no nome da categoria.
                        </p>

                        <div className="flex gap-4 mb-4">
                          <button
                            type="button"
                            onClick={() => setImportFormat('json')}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                              importFormat === 'json'
                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/10'
                                : 'bg-surface-variant text-ink border border-outline-variant'
                            }`}
                          >
                            JSON (Array)
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportFormat('csv')}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                              importFormat === 'csv'
                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/10'
                                : 'bg-surface-variant text-ink border border-outline-variant'
                            }`}
                          >
                            CSV (Colunas)
                          </button>
                        </div>

                        <div className="bg-surface-variant/30 border border-outline-variant/50 p-2.5 rounded-2xl mb-4 text-[10px] font-mono text-ink-secondary leading-relaxed">
                          {importFormat === 'json' ? (
                            <span>Exemplo JSON: <br />{'[{"nome": "Doces", "emoji": "🍰", "descricao": "Sobremesas", "ordem": 5, "ativo": true}]'}</span>
                          ) : (
                            <span>Exemplo CSV (com cabeçalho): <br />{'nome,emoji,descricao,ordem,ativo'}<br />{'Doces,🍰,Sobremesas,5,true'}</span>
                          )}
                        </div>

                        <textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={importFormat === 'json' ? 'Cole o JSON aqui...' : 'Cole o CSV aqui...'}
                          rows={8}
                          className="w-full p-4 rounded-2xl border border-outline-variant bg-surface-variant text-ink font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                        />
                      </div>

                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={handleImportCategorias}
                          disabled={!importText.trim()}
                          className="flex-1 bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          <span>Confirmar Importação</span>
                        </button>
                        <button
                          onClick={() => { setShowImportModal(false); setImportText(''); }}
                          className="px-6 bg-surface-variant border border-outline-variant text-ink font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-surface-variant/80 active:scale-95 transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
                          <span className="font-bold text-ink">{categoriasLista.find(c => c.nome === cat)?.emoji || '📦'} {cat}</span>
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
