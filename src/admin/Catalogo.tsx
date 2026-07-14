import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  PlusCircle,
  Tag,
  Search,
  Edit,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

interface Categoria {
  id: number;
  nome: string;
  slug: string;
  emoji: string;
  descricao: string;
  ordem: number;
  ativo: number;
  setor?: string;
}

interface Produto {
  id: number;
  plu?: string;
  nome: string;
  slug: string;
  descricao?: string;
  preco: number;
  estoque: number;
  unidade: string;
  categoria_id?: number | null;
  categoria_legada?: string;
  status: number;
  ordem: number;
  tags?: string;
}

export default function Catalogo() {
  const [activeTab, setActiveTab] = useState<'produtos' | 'categorias'>('produtos');
  const API_URL = getApiUrl();

  // State para Produtos
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('');
  const [loadingProds, setLoadingProds] = useState(false);

  // State para Categorias
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);

  // Modals de Produto
  const [showProdModal, setShowProdModal] = useState(false);
  const [editingProd, setEditingProd] = useState<Produto | null>(null);
  const [prodForm, setProdForm] = useState({
    nome: '',
    plu: '',
    preco: '',
    estoque: '0',
    unidade: 'kg',
    categoria_id: '',
    status: true,
    ordem: '0',
    descricao: '',
    tags: ''
  });

  // Modals de Categoria
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [catForm, setCatForm] = useState({
    nome: '',
    emoji: '',
    descricao: '',
    ordem: '0',
    setor: 'Mercearia',
    ativo: true
  });

  // Modal de Exclusão de Categoria com vínculo
  const [showMoverExcluirModal, setShowMoverExcluirModal] = useState(false);
  const [catParaExcluir, setCatParaExcluir] = useState<Categoria | null>(null);
  const [novaCatDestinoId, setNovaCatDestinoId] = useState('');
  const [produtosVinculadosCount, setProdutosVinculadosCount] = useState(0);

  // Fetch das categorias
  const fetchCategorias = async () => {
    setLoadingCats(true);
    try {
      const res = await fetch(`${API_URL}/api/catalogo/categorias`);
      const data = await res.json();
      if (data.success) {
        setCategorias(data.data);
      }
    } catch (err) {
      console.error('Erro ao buscar categorias:', err);
    } finally {
      setLoadingCats(false);
    }
  };

  // Fetch dos produtos
  const fetchProdutos = async () => {
    setLoadingProds(true);
    try {
      let url = `${API_URL}/api/catalogo/produtos?page=${page}&limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filterCat) url += `&categoria_id=${filterCat}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setProdutos(data.data.items);
        setTotalProdutos(data.data.pagination.total);
      }
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
    } finally {
      setLoadingProds(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  useEffect(() => {
    fetchProdutos();
  }, [page, search, filterCat]);

  // Handlers de Produto
  const openAddProd = () => {
    setEditingProd(null);
    setProdForm({
      nome: '',
      plu: '',
      preco: '',
      estoque: '0',
      unidade: 'kg',
      categoria_id: categorias[0]?.id.toString() || '',
      status: true,
      ordem: '0',
      descricao: '',
      tags: ''
    });
    setShowProdModal(true);
  };

  const openEditProd = (prod: Produto) => {
    setEditingProd(prod);
    setProdForm({
      nome: prod.nome,
      plu: prod.plu || '',
      preco: (prod.preco / 100).toFixed(2), // Convert from cents
      estoque: prod.estoque.toString(),
      unidade: prod.unidade || 'kg',
      categoria_id: prod.categoria_id?.toString() || '',
      status: prod.status === 1,
      ordem: prod.ordem.toString(),
      descricao: prod.descricao || '',
      tags: prod.tags || ''
    });
    setShowProdModal(true);
  };

  const handleSaveProd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodForm.nome) return alert('Nome é obrigatório');

    const precoCents = Math.round(parseFloat(prodForm.preco) * 100);
    if (isNaN(precoCents) || precoCents < 0) return alert('Preço inválido');

    const payload = {
      nome: prodForm.nome,
      plu: prodForm.plu || null,
      preco: precoCents,
      estoque: parseFloat(prodForm.estoque) || 0,
      unidade: prodForm.unidade,
      categoria_id: prodForm.categoria_id ? parseInt(prodForm.categoria_id) : null,
      status: prodForm.status ? 1 : 0,
      ordem: parseInt(prodForm.ordem) || 0,
      descricao: prodForm.descricao || null,
      tags: prodForm.tags || null
    };

    try {
      const url = editingProd 
        ? `${API_URL}/api/catalogo/produtos/${editingProd.id}`
        : `${API_URL}/api/catalogo/produtos`;
      
      const res = await fetch(url, {
        method: editingProd ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.success) {
        setShowProdModal(false);
        fetchProdutos();
      } else {
        alert(data.error || 'Erro ao salvar produto');
      }
    } catch (err) {
      alert('Erro de conexão com o servidor.');
    }
  };

  const handleDeleteProd = async (id: number) => {
    if (!confirm('Tem certeza que deseja mover este produto para a lixeira?')) return;
    try {
      const res = await fetch(`${API_URL}/api/catalogo/produtos/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchProdutos();
      } else {
        alert(data.error || 'Erro ao deletar produto');
      }
    } catch (err) {
      alert('Erro de conexão.');
    }
  };

  // Handlers de Categoria
  const openAddCat = () => {
    setEditingCat(null);
    setCatForm({
      nome: '',
      emoji: '',
      descricao: '',
      ordem: '0',
      setor: 'Mercearia',
      ativo: true
    });
    setShowCatModal(true);
  };

  const openEditCat = (cat: Categoria) => {
    setEditingCat(cat);
    setCatForm({
      nome: cat.nome,
      emoji: cat.emoji || '',
      descricao: cat.descricao || '',
      ordem: cat.ordem.toString(),
      setor: cat.setor || 'Mercearia',
      ativo: cat.ativo === 1
    });
    setShowCatModal(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.nome) return alert('Nome é obrigatório');

    const payload = {
      nome: catForm.nome,
      emoji: catForm.emoji,
      descricao: catForm.descricao,
      ordem: parseInt(catForm.ordem) || 0,
      setor: catForm.setor,
      ativo: catForm.ativo ? 1 : 0
    };

    try {
      const url = editingCat
        ? `${API_URL}/api/catalogo/categorias/${editingCat.id}`
        : `${API_URL}/api/catalogo/categorias`;
      
      const res = await fetch(url, {
        method: editingCat ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.success) {
        setShowCatModal(false);
        fetchCategorias();
        fetchProdutos(); // refresh in case names changes
      } else {
        alert(data.error || 'Erro ao salvar categoria');
      }
    } catch (err) {
      alert('Erro de conexão.');
    }
  };

  const handleDeleteCat = async (cat: Categoria) => {
    try {
      const res = await fetch(`${API_URL}/api/catalogo/categorias/${cat.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const data = await res.json();
        // Categoria possui produtos vinculados!
        setCatParaExcluir(cat);
        setProdutosVinculadosCount(data.details?.vinculados || 0);
        // Filtrar categorias destino (todas exceto a que vai ser excluida)
        const destinos = categorias.filter(c => c.id !== cat.id);
        setNovaCatDestinoId(destinos[0]?.id.toString() || '');
        setShowMoverExcluirModal(true);
      } else {
        const data = await res.json();
        if (data.success) {
          fetchCategorias();
        } else {
          alert(data.error || 'Erro ao excluir categoria');
        }
      }
    } catch (err) {
      alert('Erro de conexão.');
    }
  };

  const handleMoverExcluir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catParaExcluir || !novaCatDestinoId) return;

    try {
      // 1. Mover produtos
      const moverRes = await fetch(`${API_URL}/api/catalogo/categorias/${catParaExcluir.id}/mover-produtos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nova_categoria_id: parseInt(novaCatDestinoId) })
      });
      const moverData = await moverRes.json();
      if (!moverData.success) {
        alert('Erro ao mover produtos: ' + moverData.error);
        return;
      }

      // 2. Excluir categoria agora vazia
      const delRes = await fetch(`${API_URL}/api/catalogo/categorias/${catParaExcluir.id}`, { method: 'DELETE' });
      const delData = await delRes.json();
      if (delData.success) {
        setShowMoverExcluirModal(false);
        setCatParaExcluir(null);
        fetchCategorias();
        fetchProdutos();
      } else {
        alert('Erro ao excluir categoria vazia: ' + delData.error);
      }
    } catch (err) {
      alert('Erro ao mover e excluir.');
    }
  };

  const totalPages = Math.ceil(totalProdutos / limit);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">Catálogo</h1>
            <p className="text-ink-variant text-sm mt-1">
              Gestão unificada de produtos a granel e categorias de balança
            </p>
          </div>
          <div>
            {activeTab === 'produtos' ? (
              <Button 
                onClick={openAddProd}
                icon={<PlusCircle className="h-4 w-4" />}
              >
                Novo Produto
              </Button>
            ) : (
              <Button 
                onClick={openAddCat}
                icon={<Tag className="h-4 w-4" />}
              >
                Nova Categoria
              </Button>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-outline-variant">
          <button
            onClick={() => setActiveTab('produtos')}
            className={`px-6 py-3 font-bold border-b-2 transition-all text-sm outline-none ${
              activeTab === 'produtos' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-ink-variant hover:text-ink'
            }`}
          >
            Produtos
          </button>
          <button
            onClick={() => setActiveTab('categorias')}
            className={`px-6 py-3 font-bold border-b-2 transition-all text-sm outline-none ${
              activeTab === 'categorias' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-ink-variant hover:text-ink'
            }`}
          >
            Categorias
          </button>
        </div>

        {/* TAB PRODUTOS */}
        {activeTab === 'produtos' && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-4 bg-surface p-4 rounded-md border border-outline-variant shadow-sm">
              <div className="flex-1 flex items-center bg-surface-container-low rounded-md px-3 py-1.5 border border-outline-variant focus-within:border-primary transition-colors">
                <Search className="h-4 w-4 text-ink-variant mr-2" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar produto por nome ou PLU..." 
                  className="bg-transparent border-none w-full focus:ring-0 text-sm text-ink placeholder-outline outline-none font-medium" 
                  aria-label="Buscar produto por nome ou PLU"
                />
              </div>
              <div className="w-full md:w-64">
                <select
                  value={filterCat}
                  onChange={e => { setFilterCat(e.target.value); setPage(1); }}
                  className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  aria-label="Filtrar por Categoria"
                >
                  <option value="">Todas as Categorias</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Listagem */}
            {loadingProds ? (
              <StatusBadge variant="loading" />
            ) : produtos.length === 0 ? (
              <StatusBadge variant="empty" message="Nenhum produto cadastrado ou encontrado." />
            ) : (
              <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant text-ink-variant text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">PLU</th>
                        <th className="p-4">Nome / Descrição</th>
                        <th className="p-4">Categoria</th>
                        <th className="p-4 text-right">Preço</th>
                        <th className="p-4 text-center">Unidade</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {produtos.map(p => {
                        const catName = categorias.find(c => c.id === p.categoria_id);
                        return (
                          <tr key={p.id} className="hover:bg-surface-container-low transition-colors text-ink font-semibold">
                            <td className="p-4 text-primary font-mono text-sm">{p.plu || '-'}</td>
                            <td className="p-4">
                              <p className="text-ink font-bold text-sm">{p.nome}</p>
                              {p.descricao && <p className="text-xs text-ink-variant font-medium truncate max-w-sm mt-0.5">{p.descricao}</p>}
                            </td>
                            <td className="p-4">
                              {catName ? (
                                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                                  {catName.emoji} {catName.nome}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-surface-container text-ink-variant rounded-full text-xs font-semibold">
                                  📦 {p.categoria_legada || 'Sem categoria'}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right font-mono text-sm text-ink">
                              R$ {(p.preco / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-center lowercase text-xs font-semibold text-ink-variant">{p.unidade || 'kg'}</td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                p.status === 1 ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'
                              }`}>
                                {p.status === 1 ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button 
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => openEditProd(p)}
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4 text-primary" />
                                </Button>
                                <Button 
                                  variant="ghost"
                                  size="sm"
                                  className="px-2"
                                  onClick={() => handleDeleteProd(p.id)}
                                  title="Deletar"
                                >
                                  <Trash2 className="h-4 w-4 text-error" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="p-4 flex items-center justify-between border-t border-outline-variant bg-surface">
                    <span className="text-xs font-bold text-ink-variant uppercase tracking-wider">
                      Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB CATEGORIAS */}
        {activeTab === 'categorias' && (
          <div className="space-y-4">
            {loadingCats ? (
              <StatusBadge variant="loading" />
            ) : categorias.length === 0 ? (
              <StatusBadge variant="empty" message="Nenhuma categoria cadastrada." />
            ) : (
              <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant text-ink-variant text-xs font-bold uppercase tracking-wider">
                        <th className="p-4 text-center w-20">Emoji</th>
                        <th className="p-4">Nome</th>
                        <th className="p-4">Slug</th>
                        <th className="p-4">Setor / Tipo</th>
                        <th className="p-4 text-center w-24">Ordem</th>
                        <th className="p-4 text-center w-32">Status</th>
                        <th className="p-4 text-center w-36">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {categorias.map(c => (
                        <tr key={c.id} className="hover:bg-surface-container-low transition-colors text-ink font-semibold">
                          <td className="p-4 text-center text-xl">{c.emoji || '📦'}</td>
                          <td className="p-4">
                            <p className="text-ink font-bold text-sm">{c.nome}</p>
                            {c.descricao && <p className="text-xs text-ink-variant font-medium truncate max-w-sm mt-0.5">{c.descricao}</p>}
                          </td>
                          <td className="p-4 font-mono text-xs text-ink-variant">{c.slug}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 bg-surface-container text-ink rounded-full text-xs font-semibold uppercase tracking-wider">
                              {c.setor || 'Geral'}
                            </span>
                          </td>
                          <td className="p-4 text-center font-mono text-sm">{c.ordem}</td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              c.ativo === 1 ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'
                            }`}>
                              {c.ativo === 1 ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => openEditCat(c)}
                                title="Editar"
                              >
                                <Edit className="h-4 w-4 text-primary" />
                              </Button>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => handleDeleteCat(c)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4 text-error" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Produto (Criar / Editar) */}
        {showProdModal && (
          <Dialog 
            open={showProdModal} 
            onClose={() => setShowProdModal(false)} 
            title={editingProd ? 'Editar Produto' : 'Novo Produto'}
          >
            <form onSubmit={handleSaveProd} className="space-y-4">
              <Input 
                required 
                label="Nome do Produto *"
                value={prodForm.nome} 
                onChange={e => setProdForm({...prodForm, nome: e.target.value})} 
                placeholder="Ex: Picanha Argentina" 
              />
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Código PLU (Toledo)"
                  value={prodForm.plu} 
                  onChange={e => setProdForm({...prodForm, plu: e.target.value})} 
                  placeholder="Ex: 501" 
                />
                <Input 
                  required 
                  label="Preço (R$) *"
                  type="number" 
                  step="0.01" 
                  value={prodForm.preco} 
                  onChange={e => setProdForm({...prodForm, preco: e.target.value})} 
                  placeholder="0.00" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Estoque inicial"
                  type="number" 
                  step="0.01"
                  value={prodForm.estoque} 
                  onChange={e => setProdForm({...prodForm, estoque: e.target.value})} 
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="prodUnidade" className="text-sm font-medium text-ink">Unidade de Medida</label>
                  <select 
                    id="prodUnidade"
                    value={prodForm.unidade} 
                    onChange={e => setProdForm({...prodForm, unidade: e.target.value})} 
                    className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="kg">Quilo (kg)</option>
                    <option value="un">Unidade (un)</option>
                    <option value="g">Grama (g)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="prodCategoria" className="text-sm font-medium text-ink">Categoria Vinculada</label>
                <select 
                  id="prodCategoria"
                  value={prodForm.categoria_id} 
                  onChange={e => setProdForm({...prodForm, categoria_id: e.target.value})} 
                  className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">Sem Categoria (Geral)</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Ordem de exibição"
                  type="number"
                  value={prodForm.ordem} 
                  onChange={e => setProdForm({...prodForm, ordem: e.target.value})} 
                />
                <Input 
                  label="Tags (separadas por vírgula)"
                  value={prodForm.tags} 
                  onChange={e => setProdForm({...prodForm, tags: e.target.value})} 
                  placeholder="Ex: oferta, premium" 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="prodDescricao" className="text-sm font-medium text-ink">Descrição detalhada</label>
                <textarea 
                  id="prodDescricao"
                  value={prodForm.descricao} 
                  onChange={e => setProdForm({...prodForm, descricao: e.target.value})} 
                  className="w-full bg-surface-container border border-outline-variant/50 rounded-sm px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold h-20 resize-none text-sm" 
                  placeholder="Descrição do produto para o catálogo digital" 
                />
              </div>
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-md cursor-pointer hover:border-primary border border-transparent transition-all">
                <input id="prodStatus" type="checkbox" checked={prodForm.status} onChange={e => setProdForm({...prodForm, status: e.target.checked})} className="w-5 h-5 rounded text-primary focus:ring-primary border-outline-variant/50 cursor-pointer" />
                <span className="text-sm font-bold text-ink cursor-pointer select-none">Produto ativo para exibição</span>
              </label>
              <Button type="submit" className="w-full mt-6">
                {editingProd ? 'Atualizar Produto' : 'Criar Produto'}
              </Button>
            </form>
          </Dialog>
        )}

        {/* Modal Categoria (Criar / Editar) */}
        {showCatModal && (
          <Dialog 
            open={showCatModal} 
            onClose={() => setShowCatModal(false)} 
            title={editingCat ? 'Editar Categoria' : 'Nova Categoria'}
          >
            <form onSubmit={handleSaveCat} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <Input 
                    required 
                    label="Emoji"
                    value={catForm.emoji} 
                    onChange={e => setCatForm({...catForm, emoji: e.target.value})} 
                    placeholder="🧀" 
                    maxLength={4} 
                    className="text-center"
                  />
                </div>
                <div className="col-span-3">
                  <Input 
                    required 
                    label="Nome da Categoria"
                    value={catForm.nome} 
                    onChange={e => setCatForm({...catForm, nome: e.target.value})} 
                    placeholder="Ex: Frios e Queijos" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="catSetor" className="text-sm font-medium text-ink">Setor / Departamento</label>
                  <select 
                    id="catSetor"
                    value={catForm.setor} 
                    onChange={e => setCatForm({...catForm, setor: e.target.value})} 
                    className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="Mercearia">Mercearia</option>
                    <option value="QUEIJOS">Frios / Laticínios</option>
                    <option value="TEMPEROS">Temperos / Especiarias</option>
                    <option value="CASTANHAS">Grãos / Castanhas</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <Input 
                  label="Ordem"
                  type="number"
                  value={catForm.ordem} 
                  onChange={e => setCatForm({...catForm, ordem: e.target.value})} 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="catDescricao" className="text-sm font-medium text-ink">Descrição Curta</label>
                <textarea 
                  id="catDescricao"
                  value={catForm.descricao} 
                  onChange={e => setCatForm({...catForm, descricao: e.target.value})} 
                  className="w-full bg-surface-container border border-outline-variant/50 rounded-sm px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold h-20 resize-none text-sm" 
                  placeholder="Ex: Variedade de embutidos e laticínios" 
                />
              </div>
              <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded-md cursor-pointer hover:border-primary border border-transparent transition-all">
                <input id="catStatus" type="checkbox" checked={catForm.ativo} onChange={e => setCatForm({...catForm, ativo: e.target.checked})} className="w-5 h-5 rounded text-primary focus:ring-primary border-outline-variant/50 cursor-pointer" />
                <span className="text-sm font-bold text-ink cursor-pointer select-none">Categoria ativa</span>
              </label>
              <Button type="submit" className="w-full mt-6">
                {editingCat ? 'Atualizar Categoria' : 'Criar Categoria'}
              </Button>
            </form>
          </Dialog>
        )}

        {/* Modal Mover e Excluir Categoria */}
        {showMoverExcluirModal && (
          <Dialog 
            open={showMoverExcluirModal} 
            onClose={() => setShowMoverExcluirModal(false)} 
            title="Atenção: Ação Necessária"
          >
            <div className="flex items-start gap-3 p-3 bg-error-container text-error-ink rounded-md mb-4 text-xs font-semibold">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>
                A categoria <strong className="text-ink">"{catParaExcluir?.nome}"</strong> possui <strong className="text-primary">{produtosVinculadosCount} produto(s)</strong> vinculados a ela. Para excluí-la de forma segura, você precisa mover esses produtos para outra categoria ativa primeiro.
              </p>
            </div>
            <form onSubmit={handleMoverExcluir} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="catMoverDestino" className="text-sm font-medium text-ink">Mover produtos para:</label>
                <select 
                  id="catMoverDestino"
                  value={novaCatDestinoId} 
                  onChange={e => setNovaCatDestinoId(e.target.value)}
                  className="w-full h-11 rounded-sm border border-outline-variant bg-surface text-ink px-4 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  {categorias.filter(c => c.id !== catParaExcluir?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 mt-6">
                <Button 
                  type="button" 
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setShowMoverExcluirModal(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                >
                  Mover e Excluir
                </Button>
              </div>
            </form>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
}
