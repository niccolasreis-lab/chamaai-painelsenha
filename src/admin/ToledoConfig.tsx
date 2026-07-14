import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import { 
  AlertTriangle,
  Scale,
  CheckCircle2,
  XCircle,
  Package,
  RefreshCw,
  ShieldCheck,
  Search,
  Edit,
  Trash2,
  Star,
  Flame,
  Folder,
  Save,
  Download,
  Upload,
  Info,
  GripVertical,
  AlertCircle,
  Plus
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

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
  unidade?: string;
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
  const [editingPlu, setEditingPlu] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState<string>('');

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
  };

  const handleInlineEditSave = async (plu: string) => {
    if (!editDesc.trim()) {
      alert('A descrição do produto não pode ser vazia.');
      return;
    }
    
    const originalProd = produtos.find(p => p.plu === plu);
    if (!originalProd) return;
    
    if (originalProd.descricao === editDesc.trim()) {
      setEditingPlu(null);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/toledo/produtos/${plu}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: editDesc.trim() })
      });
      if (res.ok) {
        setProdutos(produtos.map(p => p.plu === plu ? { ...p, descricao: editDesc.trim() } : p));
      } else {
        const data = await res.json();
        alert(`Erro ao salvar descrição: ${data.error || 'Falha ao salvar'}`);
      }
    } catch (err: any) {
      alert(`Erro de rede ao salvar descrição: ${err.message}`);
    } finally {
      setEditingPlu(null);
    }
  };

  const handleUnidadeChange = async (plu: string, novaUnidade: string) => {
    try {
      const res = await fetch(`${API_URL}/api/toledo/produtos/${plu}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidade: novaUnidade })
      });
      if (res.ok) {
        setProdutos(produtos.map(p => p.plu === plu ? { ...p, unidade: novaUnidade } : p));
      } else {
        const data = await res.json();
        alert(`Erro ao salvar unidade: ${data.error || 'Falha ao salvar'}`);
      }
    } catch (err: any) {
      alert(`Erro de rede ao salvar unidade: ${err.message}`);
    }
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
      <div className="max-w-7xl mx-auto space-y-6 font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center text-primary">
                <Scale className="h-5 w-5" />
              </div>
              <h1 className="font-display text-2xl font-bold text-ink">
                Toledo — Encarte
              </h1>
            </div>
            <p className="text-ink-variant text-sm mt-0.5">
              Monitoramento automático de preços da balança Toledo para exibição no Telão.
            </p>
            <div className="flex space-x-2 mt-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider flex items-center gap-1 border uppercase ${
                encarteAtivo 
                  ? 'bg-success/10 text-success border-success/20' 
                  : 'bg-error/10 text-error border-error/20'
              }`}>
                {encarteAtivo ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                <span>{encarteAtivo ? 'ENCARTE ATIVO' : 'ENCARTE DESATIVADO'}</span>
              </span>
              <span className="bg-primary/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider text-primary flex items-center gap-1 border border-primary/20 uppercase">
                <Package className="h-3 w-3" />
                <span>{produtos.length} PRODUTOS</span>
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleForceRefresh}
              disabled={refreshing || !isMasterServer}
              variant="secondary"
              icon={<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />}
            >
              {refreshing ? 'Lendo...' : 'Forçar Leitura'}
            </Button>
            <Button
              onClick={handleSaveAllConfigs}
              disabled={!isMasterServer}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>

        {/* Master Server Banner */}
        {!isMasterServer && (
          <div className="bg-error-container text-error-ink p-4 rounded-md border border-error/20 shadow-sm">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-error" />
              <div className="flex-1">
                <h3 className="text-sm font-bold tracking-wide">Acesso restrito: modo leitura</h3>
                <p className="text-xs mt-1">Você está acessando a partir de um dispositivo cliente. Alterações administrativas só podem ser realizadas no <b>Servidor Master</b> da loja.</p>
                {!showMasterLogin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMasterLogin(true)}
                    className="mt-3 text-error hover:bg-error-container-high"
                  >
                    🔓 Desbloquear Acesso Remoto
                  </Button>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 max-w-sm">
                    <Input
                      type="password"
                      label="Senha Master Remoto"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMasterLogin()}
                      autoFocus
                    />
                    {masterLoginError && <p className="text-error font-bold text-xs">{masterLoginError}</p>}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleMasterLogin}
                        disabled={masterLoginLoading || !masterPassword}
                      >
                        {masterLoginLoading ? 'Verificando...' : 'Entrar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowMasterLogin(false); setMasterLoginError(''); setMasterPassword(''); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Remote Session Active Banner */}
        {isMasterRemote && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 dark:bg-emerald-950/20 dark:border-emerald-700 p-4 rounded-r-md shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Sessão master remota ativa</h3>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Você tem permissão de administrador via acesso remoto.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMasterLogout}
                className="text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
              >
                Encerrar Sessão
              </Button>
            </div>
          </div>
        )}

        <fieldset disabled={!isMasterServer} className="contents">

        {/* Settings Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Encarte Ativo Toggle */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm flex flex-col justify-between">
            <label className="text-xs font-bold text-ink-variant tracking-wider block mb-2">Encarte no telão</label>
            <Button
              variant={encarteAtivo ? 'primary' : 'secondary'}
              onClick={() => handleSaveConfig('toledo_encarte_ativo', encarteAtivo ? '0' : '1')}
              className="w-full"
            >
              {encarteAtivo ? '✓ Ativado' : '✕ Desativado'}
            </Button>
          </div>

          {/* Ocultar em Falta Toggle */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm flex flex-col justify-between">
            <label className="text-xs font-bold text-ink-variant tracking-wider block mb-2">Produtos em falta</label>
            <Button
              variant={config.toledo_ocultar_em_falta === '1' ? 'secondary' : 'primary'}
              onClick={() => handleSaveConfig('toledo_ocultar_em_falta', config.toledo_ocultar_em_falta === '1' ? '0' : '1')}
              className="w-full"
            >
              {config.toledo_ocultar_em_falta === '1' ? '✕ Ocultar' : '✓ Mostrar'}
            </Button>
          </div>

          {/* Duração */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <Input
              type="number"
              min="5"
              max="60"
              label="Duração (seg)"
              value={config.toledo_encarte_duracao || '15'}
              onChange={(e) => handleSaveConfig('toledo_encarte_duracao', e.target.value)}
              className="text-center font-bold"
            />
          </div>

          {/* Posição na rotação */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <Input
              type="number"
              min="0"
              label="Posição rotação"
              value={config.toledo_encarte_posicao || '0'}
              onChange={(e) => handleSaveConfig('toledo_encarte_posicao', e.target.value)}
              className="text-center font-bold"
              helper="Aparece após qual mídia"
            />
          </div>

          {/* Itens por slide */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <Input
              type="number"
              min="4"
              max="96"
              label="Itens por slide"
              value={config.toledo_itens_por_slide || '12'}
              onChange={(e) => handleSaveConfig('toledo_itens_por_slide', e.target.value)}
              className="text-center font-bold"
              helper="Produtos na tela"
            />
          </div>
          
          {/* Caminho da Pasta Toledo */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm md:col-span-2 lg:col-span-3">
            <Input
              type="text"
              label="Caminho da pasta toledo (rede/local)"
              placeholder="Ex: \\\\serverad\\Santa Paula\\TOLEDO"
              value={config.toledo_caminho_rede || ''}
              onChange={(e) => setConfig({ ...config, toledo_caminho_rede: e.target.value })}
              onBlur={(e) => handleSaveConfig('toledo_caminho_rede', e.target.value)}
              className="font-mono"
              helper="Pasta de exportação dos arquivos da balança"
            />
          </div>

          {/* Formato do Arquivo */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm md:col-span-2 lg:col-span-2">
            <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-1">Formato de integração</label>
            <select
              value={config.toledo_formato_arquivo || 'toledo_mgv6'}
              onChange={(e) => {
                setConfig({ ...config, toledo_formato_arquivo: e.target.value });
                handleSaveConfig('toledo_formato_arquivo', e.target.value);
              }}
              className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer font-semibold"
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
          </div>

          {/* Qtd Colunas */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-1">Qtd. colunas</label>
            <select
              value={config.toledo_encarte_colunas || '3'}
              onChange={(e) => handleSaveConfig('toledo_encarte_colunas', e.target.value)}
              className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer text-center font-bold"
            >
              <option value="1">1 Coluna</option>
              <option value="2">2 Colunas</option>
              <option value="3">3 Colunas</option>
              <option value="4">4 Colunas</option>
            </select>
          </div>

          {/* Tamanho da Fonte — Descrição */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-1">Fonte descrição</label>
            <select
              value={config.toledo_fonte_descricao || '1.25rem'}
              onChange={(e) => handleSaveConfig('toledo_fonte_descricao', e.target.value)}
              className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer font-bold"
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
          </div>

          {/* Tamanho da Fonte — Preço */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
            <label className="block text-xs font-bold text-ink-variant tracking-wider uppercase mb-1">Fonte preço</label>
            <select
              value={config.toledo_fonte_preco || '1.75rem'}
              onChange={(e) => handleSaveConfig('toledo_fonte_preco', e.target.value)}
              className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer font-bold"
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
          </div>

          {/* Ocultar Guichê no Telão */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm flex flex-col justify-between">
            <label className="text-xs font-bold text-ink-variant tracking-wider block mb-2">Guichê no telão</label>
            <Button
              variant={config.telao_ocultar_guiche === '1' ? 'secondary' : 'primary'}
              onClick={() => handleSaveConfig('telao_ocultar_guiche', config.telao_ocultar_guiche === '1' ? '0' : '1')}
              className="w-full"
            >
              {config.telao_ocultar_guiche === '1' ? '✕ Oculto' : '✓ Visível'}
            </Button>
          </div>

          {/* Estilo do Encarte */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm md:col-span-2 lg:col-span-5">
            <label className="text-xs font-bold text-ink-variant tracking-wider block mb-3">Estilo do encarte</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'kg', label: '🌙 Preços por KG (Escuro)', desc: 'Layout dark com colunas, ideal para carnes e frios' },
                { id: 'granel', label: '🌿 Granel Premium (Claro)', desc: 'Layout premium com cards e animações, ideal para produtos a granel' },
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSaveConfig('toledo_encarte_estilo', s.id)}
                  className={`flex flex-col items-start p-4 rounded-md border-2 transition-all outline-none text-left ${
                    (config.toledo_encarte_estilo || 'kg') === s.id
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/5'
                      : 'border-outline-variant bg-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="font-bold text-sm text-ink">{s.label}</span>
                  <span className="text-[10px] text-ink-variant mt-1">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tema Visual */}
          <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm md:col-span-2 lg:col-span-5">
            <label className="text-xs font-bold text-ink-variant tracking-wider block mb-3">Tema visual do encarte</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: 'padrao', label: 'Verde (Padrão)', color: 'bg-emerald-500' },
                { id: 'acougue', label: 'Açougue (Vermelho)', color: 'bg-red-500' },
                { id: 'hortifruti', label: 'Hortifruti (Lima)', color: 'bg-lime-500' },
                { id: 'padaria', label: 'Padaria (Ouro)', color: 'bg-amber-500' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSaveConfig('toledo_encarte_tema', t.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-md border-2 transition-all outline-none ${
                    (config.toledo_encarte_tema || 'padrao') === t.id
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/5'
                      : 'border-outline-variant bg-surface hover:bg-surface-container'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full ${t.color} shadow-sm`}></div>
                  <span className="font-bold text-sm text-ink">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant overflow-x-auto">
          {(['produtos', 'categorias', 'ordenar', 'logs'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-bold text-sm border-b-2 transition-all outline-none whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-ink-variant hover:text-ink hover:bg-surface-container-low'
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
          <StatusBadge variant="loading" />
        ) : (
          <>
            {/* Products Tab */}
            {activeTab === 'produtos' && (
              <div className="space-y-4">
                
                {/* Barra de Busca */}
                <div className="flex items-center bg-surface rounded-md px-3.5 py-1.5 border border-outline-variant focus-within:border-primary transition-all">
                  <Search className="h-5 w-5 text-ink-variant mr-3 shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Buscar por código ou descrição do produto..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none text-sm text-ink placeholder-outline outline-none font-medium h-11"
                  />
                </div>

                {filteredProdutos.length === 0 ? (
                  <StatusBadge variant="empty" message="Nenhum produto toledo encontrado correspondente à pesquisa." />
                ) : (
                  Object.entries(grouped).sort(([a], [b]) => {
                    if (a === 'Outros') return 1;
                    if (b === 'Outros') return -1;
                    return a.localeCompare(b, 'pt-BR');
                  }).map(([categoria, items]) => (
                    <div key={categoria} className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
                        <h3 className="font-bold text-sm text-ink uppercase tracking-wide">{categoria}</h3>
                        <span className="text-[10px] font-bold text-ink-variant uppercase tracking-wider">
                          {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                      <div className="divide-y divide-outline-variant/20">
                        {items.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map(p => {
                          const isOferta = p.descricao.includes('* OFERTA *') || p.descricao.includes('OFERTA') || p.descricao.includes('*');
                          return (
                            <div key={p.plu} className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low transition-colors ${isOferta ? 'bg-error/5 border-l-4 border-error' : ''}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0 group">
                                <span className="text-[10px] font-mono font-bold text-ink-variant bg-surface-container px-2 py-0.5 rounded-sm shrink-0">{p.plu}</span>
                                {editingPlu === p.plu ? (
                                  <input
                                    type="text"
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    onBlur={() => handleInlineEditSave(p.plu)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleInlineEditSave(p.plu);
                                      if (e.key === 'Escape') setEditingPlu(null);
                                    }}
                                    className="px-3 py-1.5 rounded-sm border border-primary bg-surface text-ink font-semibold outline-none focus:ring-2 focus:ring-primary/20 text-sm flex-1 min-w-[200px]"
                                    autoFocus
                                  />
                                ) : (
                                  <div 
                                    className="flex items-center gap-2 cursor-pointer min-w-0"
                                    onDoubleClick={() => {
                                      if (isMasterServer) {
                                        setEditingPlu(p.plu);
                                        setEditDesc(p.descricao);
                                      }
                                    }}
                                  >
                                    <span 
                                      className={`text-sm font-semibold truncate ${isOferta ? 'text-error font-bold' : 'text-ink'}`} 
                                      title="Dê um duplo clique para editar"
                                    >
                                      {p.descricao}
                                    </span>
                                    {isMasterServer && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPlu(p.plu);
                                          setEditDesc(p.descricao);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-variant hover:text-primary rounded-sm"
                                        title="Editar descrição"
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                                <select 
                                  value={p.categoria}
                                  onChange={(e) => handleChangeCategoria(p, e.target.value)}
                                  disabled={!isMasterServer}
                                  className="text-xs font-bold bg-surface border border-outline-variant rounded-sm px-2 py-1 outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 cursor-pointer text-ink font-semibold ml-2"
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
                                        type="button"
                                        onClick={() => handleChangeCategoria(p, sugestao)}
                                        disabled={!isMasterServer}
                                        title="Atribuir Categoria Sugerida"
                                        className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-sm hover:bg-amber-200 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap dark:bg-amber-900/30 dark:text-amber-300"
                                      >
                                        💡 Sugestão: {sugestao}
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                                <div className="text-right flex flex-col items-end gap-0.5">
                                  {p.preco === 0 ? (
                                    <span className="font-bold text-xs text-error block">
                                      PRODUTO EM FALTA 🥲
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="font-bold text-sm text-emerald-600">
                                        {formatPreco(p.preco)}
                                      </span>
                                      <span className="text-ink-variant text-xs font-medium">/</span>
                                      <select
                                        value={p.unidade || 'kg'}
                                        onChange={(e) => handleUnidadeChange(p.plu, e.target.value)}
                                        disabled={!isMasterServer}
                                        className="text-[10px] font-bold bg-surface border border-outline-variant rounded-sm px-1 py-0.5 outline-none focus:border-primary disabled:opacity-50 cursor-pointer text-ink font-semibold"
                                      >
                                        <option value="kg">kg</option>
                                        <option value="UN">UN</option>
                                        <option value="PT">PT</option>
                                        <option value="CX">CX</option>
                                        <option value="PC">PC</option>
                                        <option value="FD">FD</option>
                                        <option value="LT">LT</option>
                                        <option value="GF">GF</option>
                                      </select>
                                    </div>
                                  )}
                                  <span className="text-[9px] text-ink-variant/50 font-bold block">{formatDate(p.atualizado_em)}</span>
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => toggleOferta(p)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    isOferta 
                                      ? 'bg-error text-white shadow hover:bg-error-dark' 
                                      : 'bg-surface border border-outline-variant text-ink-variant hover:bg-error/10 hover:text-error hover:border-error/20'
                                  }`}
                                >
                                  {isOferta ? <Flame className="h-3 w-3" /> : <Star className="h-3 w-3" />}
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
                  <div className="bg-surface rounded-md p-5 border border-outline-variant shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="font-bold text-sm text-ink uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/30 pb-2">
                        <Folder className="h-4 w-4 text-primary" />
                        {editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}
                      </h3>
                      
                      <Input
                        label="Nome da categoria *"
                        value={catNome}
                        onChange={(e) => setCatNome(e.target.value)}
                        placeholder="Ex: Adega e Vinhos"
                      />
                      
                      <Input
                        label="Emoji / ícone"
                        value={catEmoji}
                        onChange={(e) => setCatEmoji(e.target.value)}
                        placeholder="Ex: 🍷"
                        maxLength={10}
                      />

                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-ink">Descrição personalizada</label>
                        <textarea
                          value={catDescricao}
                          onChange={(e) => setCatDescricao(e.target.value)}
                          placeholder="Exibida no portal do cliente (opcional)..."
                          rows={3}
                          className="w-full bg-surface-container border border-outline-variant/50 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-ink font-medium text-sm resize-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-ink">Setor / departamento</label>
                        <select
                          value={catSetor}
                          onChange={(e) => setCatSetor(e.target.value)}
                          className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer font-semibold"
                        >
                          {SETORES_PADRAO.map(setor => (
                            <option key={setor} value={setor}>
                              {setor}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          type="number"
                          label="Ordem"
                          value={catOrdem}
                          onChange={(e) => setCatOrdem(Number(e.target.value))}
                          min="0"
                          className="font-bold"
                        />
                        <div className="flex flex-col justify-between">
                          <label className="text-xs font-bold text-ink-variant tracking-wider block">Ativo</label>
                          <Button
                            type="button"
                            variant={catAtivo ? 'primary' : 'secondary'}
                            onClick={() => setCatAtivo(!catAtivo)}
                            className="w-full"
                          >
                            {catAtivo ? '✓ Sim' : '✕ Não'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-6 pt-4 border-t border-outline-variant/30">
                      <Button
                        onClick={handleSaveCategoria}
                        disabled={!isMasterServer}
                        icon={<Save className="h-4 w-4" />}
                        className="flex-1 text-xs"
                      >
                        {editingCategoria ? 'Atualizar' : 'Criar'}
                      </Button>
                      
                      {editingCategoria && (
                        <Button
                          variant="ghost"
                          onClick={clearCatForm}
                          className="text-xs"
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lista de Categorias Atuais */}
                  <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden lg:col-span-2 flex flex-col justify-between">
                    <div>
                      <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant flex flex-col sm:flex-row gap-2 justify-between sm:items-center">
                        <h3 className="font-bold text-xs text-ink uppercase tracking-wider">Categorias Cadastradas ({categoriasLista.length})</h3>
                        
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportCategorias('json')}
                            icon={<Download className="h-3.5 w-3.5" />}
                            className="text-[10px]"
                          >
                            JSON
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportCategorias('csv')}
                            icon={<Download className="h-3.5 w-3.5" />}
                            className="text-[10px]"
                          >
                            CSV
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!isMasterServer}
                            onClick={() => setShowImportModal(true)}
                            icon={<Upload className="h-3.5 w-3.5" />}
                            className="text-[10px]"
                          >
                            Importar
                          </Button>
                        </div>
                      </div>

                      {categoriasLista.length === 0 ? (
                        <div className="p-8 text-center text-ink-variant">
                          <p className="font-semibold text-sm">Nenhuma categoria no banco</p>
                        </div>
                      ) : (
                        <div className="max-h-[350px] overflow-y-auto divide-y divide-outline-variant/20">
                          {categoriasLista.map((c) => (
                            <div key={c.id} className={`px-4 py-2.5 flex items-center justify-between hover:bg-surface-container-low transition-colors ${!c.ativo ? 'opacity-50 bg-surface-container' : ''}`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-lg shrink-0 w-8 h-8 rounded-sm bg-surface-container flex items-center justify-center border border-outline-variant/30">{c.emoji || '📦'}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-ink text-sm truncate">{c.nome}</span>
                                    <span className="text-[9px] font-bold text-ink-variant bg-surface-container px-1.5 py-0.5 rounded-sm">Ordem: {c.ordem}</span>
                                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">{c.setor || 'Mercearia'}</span>
                                    {!c.ativo && (
                                      <span className="text-[9px] font-bold text-error bg-error/10 px-1.5 py-0.5 rounded-sm tracking-wider">Inativo</span>
                                    )}
                                  </div>
                                  {c.descricao && (
                                    <p className="text-xs text-ink-variant truncate mt-0.5 max-w-[320px]">{c.descricao}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => handleEditCategoria(c)}
                                  disabled={!isMasterServer}
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => handleDeleteCategoria(c.id)}
                                  disabled={!isMasterServer}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4 text-error" />
                                </Button>
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
                  <div className="bg-surface rounded-md p-5 border border-outline-variant shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="font-bold text-sm text-ink tracking-wider border-b border-outline-variant/30 pb-2">Mapear PLU a Categoria</h3>
                      
                      <Input
                        label="Código PLU"
                        value={novoPlu}
                        onChange={(e) => setNovoPlu(e.target.value)}
                        placeholder="Ex: 1441"
                        maxLength={4}
                        className="font-bold"
                      />

                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-ink">Categoria visual</label>
                        <select
                          value={novaCategoria}
                          onChange={(e) => setNovaCategoria(e.target.value)}
                          className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer font-bold"
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
                    
                    <Button
                      onClick={handleAddCategoria}
                      disabled={!isMasterServer}
                      icon={<Plus className="h-4 w-4" />}
                      className="w-full mt-6"
                    >
                      Vincular PLU
                    </Button>
                    
                    {/* Sugestão baseada no PLU digitado */}
                    {novoPlu && (() => {
                      const prodMatch = produtos.find(p => p.plu === novoPlu);
                      if (prodMatch) {
                        const sugestao = sugerirCategoria(prodMatch.descricao);
                        return (
                          <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-md flex flex-col gap-1.5">
                            <span className="font-bold text-xs text-ink truncate block">{prodMatch.descricao}</span>
                            {sugestao && (
                              <div className="flex items-center justify-between gap-2 mt-1">
                                <span className="text-[10px] text-primary">💡 Sugerido: <b>{sugestao}</b></span>
                                {novaCategoria !== sugestao && isMasterServer && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-[9px] px-2 py-0"
                                    onClick={() => setNovaCategoria(sugestao)}
                                  >
                                    Aplicar
                                  </Button>
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
                  <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden lg:col-span-2">
                    <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                      <h3 className="font-bold text-xs text-ink uppercase tracking-wider">Mapeamentos Atuais ({Object.keys(categorias).length})</h3>
                    </div>
                    {Object.keys(categorias).length === 0 ? (
                      <div className="p-8 text-center text-ink-variant">
                        <p className="font-semibold text-sm">Nenhum mapeamento cadastrado</p>
                      </div>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto divide-y divide-outline-variant/20">
                        {Object.entries(categorias).sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR')).map(([plu, cat]) => {
                          const catObj = categoriasLista.find(c => c.nome === cat);
                          return (
                            <div key={plu} className="px-4 py-2 flex items-center justify-between hover:bg-surface-container-low transition-colors">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-sm min-w-[50px] text-center">{plu}</span>
                                <span className="text-ink-variant text-xs">→</span>
                                <span className="font-bold text-ink text-sm flex items-center gap-2">
                                  <span className="text-base">{catObj?.emoji || '📦'}</span>
                                  {cat}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => handleRemoveCategoria(plu)}
                                disabled={!isMasterServer}
                                title="Excluir Mapeamento"
                              >
                                <Trash2 className="h-4 w-4 text-error" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-surface-container-low border border-outline-variant rounded-md p-4 flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-ink text-sm">Sobre os mapeamentos de categorias</p>
                    <p className="text-ink-variant text-xs mt-1">
                      O código PLU identifica cada produto na balança Toledo. Associe-o a uma categoria para
                      agrupar os itens no encarte do Telão. Produtos sem mapeamento aparecerão em "Outros".
                    </p>
                  </div>
                </div>

                {/* Modal de Importação de Categorias */}
                {showImportModal && (
                  <Dialog 
                    open={showImportModal} 
                    onClose={() => { setShowImportModal(false); setImportText(''); }} 
                    title="Importar Categorias"
                  >
                    <div className="space-y-4">
                      <p className="text-xs text-ink-variant leading-relaxed">
                        Cole seu código JSON (formato array de objetos) ou conteúdo CSV. A importação irá mesclar novos itens com os já existentes baseados no nome da categoria.
                      </p>

                      <div className="flex gap-2">
                        <Button
                          variant={importFormat === 'json' ? 'primary' : 'secondary'}
                          onClick={() => setImportFormat('json')}
                          className="flex-1"
                        >
                          JSON (Array)
                        </Button>
                        <Button
                          variant={importFormat === 'csv' ? 'primary' : 'secondary'}
                          onClick={() => setImportFormat('csv')}
                          className="flex-1"
                        >
                          CSV (Colunas)
                        </Button>
                      </div>

                      <div className="bg-surface-container-high border border-outline-variant p-3 rounded-md text-[10px] font-mono text-ink-variant leading-normal">
                        {importFormat === 'json' ? (
                          <span>Exemplo JSON: <br />{'[{"nome": "Doces", "emoji": "🍰", "descricao": "Sobremesas", "ordem": 5, "ativo": true}]'}</span>
                        ) : (
                          <span>Exemplo CSV (com cabeçalho): <br />{'nome,emoji,descricao,ordem,ativo'}<br />{'Doces,🍰,Sobremesas,5,true'}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-ink-variant uppercase tracking-wider">Dados para Importação</label>
                        <textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={importFormat === 'json' ? 'Cole o JSON aqui...' : 'Cole o CSV aqui...'}
                          rows={6}
                          className="w-full p-4 rounded-sm border border-outline-variant bg-surface-container text-ink font-mono text-xs outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button
                        onClick={handleImportCategorias}
                        disabled={!importText.trim()}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        className="flex-1"
                      >
                        Confirmar Importação
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setShowImportModal(false); setImportText(''); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </Dialog>
                )}
              </div>
            )}

            {/* Ordenar Categorias Tab */}
            {activeTab === 'ordenar' && (
              <div className="space-y-4">
                <div className="bg-surface-container-low border border-outline-variant rounded-md p-4">
                  <p className="font-bold text-ink text-sm">Ordem de exibição no Portal do Cliente</p>
                  <p className="text-xs text-ink-variant mt-1">Defina a ordem em que as categorias aparecem no celular do cliente. Clique e **arraste as categorias para cima ou para baixo** para reordenar de forma simples e rápida!</p>
                </div>

                <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant flex justify-between items-center">
                    <h3 className="font-bold text-xs text-ink uppercase tracking-wider">Categorias ({categoriasOrdem.length})</h3>
                    <Button
                      size="sm"
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
                    >
                      Salvar Ordem
                    </Button>
                  </div>
                  <div className="divide-y divide-outline-variant/20">
                    {categoriasOrdem.map((cat, i) => (
                      <div 
                        key={cat} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                        className={`px-4 py-3 flex items-center justify-between hover:bg-surface-container transition-all cursor-grab active:cursor-grabbing border-b border-outline-variant/10 select-none ${
                          draggedIndex === i ? 'bg-primary/5 border-2 border-dashed border-primary/30 rounded-md opacity-50 scale-[0.98]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <GripVertical className="h-4 w-4 text-ink-variant/40" />
                          <span className="bg-primary/10 text-primary font-bold text-xs w-6 h-6 flex items-center justify-center rounded-sm">{i + 1}</span>
                          <span className="font-bold text-ink text-sm">{categoriasLista.find(c => c.nome === cat)?.emoji || '📦'} {cat}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            disabled={i === 0}
                            size="sm"
                            variant="ghost"
                            className="px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              const arr = [...categoriasOrdem];
                              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                              setCategoriasOrdem(arr);
                            }}
                          >
                            ▲
                          </Button>
                          <Button
                            disabled={i === categoriasOrdem.length - 1}
                            size="sm"
                            variant="ghost"
                            className="px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              const arr = [...categoriasOrdem];
                              [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                              setCategoriasOrdem(arr);
                            }}
                          >
                            ▼
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                  <h3 className="font-bold text-xs text-ink tracking-wider uppercase">Histórico de processamento</h3>
                </div>
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-ink-variant">
                    <p className="font-semibold text-sm">Nenhum log registrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/20">
                    {logs.map(log => (
                      <div key={log.id} className="px-4 py-3 flex items-center gap-4 hover:bg-surface-container transition-colors">
                        {log.mensagem?.startsWith('ERRO') ? (
                          <AlertCircle className="h-5 w-5 text-error shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-ink font-semibold text-sm truncate">{log.mensagem}</p>
                          <p className="text-[10px] text-ink-variant font-bold uppercase tracking-wider mt-0.5">
                            {log.itens_processados} itens • {log.precos_atualizados} atualizados
                          </p>
                        </div>
                        <span className="text-xs text-ink-variant font-mono shrink-0">
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
