import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

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
      <div className="max-w-6xl mx-auto space-y-8 font-sans">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-[48px] font-bold text-ink leading-tight uppercase tracking-widest">Catálogo</h1>
            <p className="text-ink-secondary mt-2 text-lg font-semibold tracking-wider">
              Gestão unificada de produtos a granel e categorias de balança
            </p>
          </div>
          <div>
            {activeTab === 'produtos' ? (
              <button 
                onClick={openAddProd}
                className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:bg-primary-hover transition-all flex items-center gap-2 uppercase tracking-widest text-sm"
              >
                <span className="material-symbols-outlined">add_circle</span>
                Novo Produto
              </button>
            ) : (
              <button 
                onClick={openAddCat}
                className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:bg-primary-hover transition-all flex items-center gap-2 uppercase tracking-widest text-sm"
              >
                <span className="material-symbols-outlined">category</span>
                Nova Categoria
              </button>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-outline-variant/30">
          <button
            onClick={() => setActiveTab('produtos')}
            className={`px-8 py-4 font-bold uppercase tracking-widest border-b-4 transition-all text-sm ${
              activeTab === 'produtos' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            Produtos
          </button>
          <button
            onClick={() => setActiveTab('categorias')}
            className={`px-8 py-4 font-bold uppercase tracking-widest border-b-4 transition-all text-sm ${
              activeTab === 'categorias' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            Categorias
          </button>
        </div>

        {/* TAB PRODUTOS */}
        {activeTab === 'produtos' && (
          <div className="space-y-6">
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-4 bg-surface p-6 rounded-3xl border border-outline-variant/50 shadow-sm">
              <div className="flex-1 flex items-center bg-surface-variant rounded-xl px-4 py-2 border border-outline-variant/50 focus-within:border-primary/50 transition-colors">
                <span className="material-symbols-outlined text-ink-secondary mr-2">search</span>
                <input 
                  type="text" 
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar produto por nome ou PLU..." 
                  className="bg-transparent border-none w-full focus:ring-0 text-sm text-ink placeholder-text-secondary outline-none font-semibold" 
                />
              </div>
              <div className="w-full md:w-64">
                <select
                  value={filterCat}
                  onChange={e => { setFilterCat(e.target.value); setPage(1); }}
                  className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
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
              <div className="py-20 text-center text-xl font-bold text-ink-secondary animate-pulse uppercase tracking-widest">Carregando produtos...</div>
            ) : produtos.length === 0 ? (
              <div className="bg-surface rounded-3xl p-12 border border-outline-variant/50 shadow-sm text-center">
                <span className="material-symbols-outlined text-5xl text-outline mb-2">inventory</span>
                <p className="text-xl font-bold text-ink-secondary">Nenhum produto cadastrado ou encontrado.</p>
              </div>
            ) : (
              <div className="bg-surface rounded-3xl border border-outline-variant/50 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-variant/50 border-b border-outline-variant/30 text-ink-secondary text-xs font-bold uppercase tracking-widest">
                      <th className="p-6">PLU</th>
                      <th className="p-6">Nome / Descrição</th>
                      <th className="p-6">Categoria</th>
                      <th className="p-6 text-right">Preço</th>
                      <th className="p-6 text-center">Unidade</th>
                      <th className="p-6 text-center">Status</th>
                      <th className="p-6 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {produtos.map(p => {
                      const catName = categorias.find(c => c.id === p.categoria_id);
                      return (
                        <tr key={p.id} className="hover:bg-surface-variant/20 transition-colors text-ink font-semibold">
                          <td className="p-6 text-primary font-mono">{p.plu || '-'}</td>
                          <td className="p-6">
                            <p className="text-ink font-bold text-base">{p.nome}</p>
                            {p.descricao && <p className="text-xs text-ink-secondary font-medium truncate max-w-sm mt-0.5">{p.descricao}</p>}
                          </td>
                          <td className="p-6">
                            {catName ? (
                              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">
                                {catName.emoji} {catName.nome}
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-surface-variant text-ink-secondary rounded-full text-xs font-bold">
                                📦 {p.categoria_legada || 'Sem categoria'}
                              </span>
                            )}
                          </td>
                          <td className="p-6 text-right font-mono text-ink">
                            R$ {(p.preco / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-6 text-center lowercase text-sm font-bold text-ink-secondary">{p.unidade || 'kg'}</td>
                          <td className="p-6 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                              p.status === 1 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                            }`}>
                              {p.status === 1 ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="p-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => openEditProd(p)}
                                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors outline-none"
                                title="Editar"
                              >
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </button>
                              <button 
                                onClick={() => handleDeleteProd(p.id)}
                                className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors outline-none"
                                title="Deletar"
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="p-6 flex items-center justify-between border-t border-outline-variant/30 bg-surface">
                    <span className="text-sm font-semibold text-ink-secondary uppercase tracking-wider">
                      Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        className="px-4 py-2 border border-outline-variant/50 rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 hover:bg-surface-variant/30 transition-colors"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={page === totalPages}
                        onClick={() => setPage(page + 1)}
                        className="px-4 py-2 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-xs disabled:opacity-50 hover:bg-primary-hover transition-colors shadow-sm"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB CATEGORIAS */}
        {activeTab === 'categorias' && (
          <div className="space-y-6">
            {loadingCats ? (
              <div className="py-20 text-center text-xl font-bold text-ink-secondary animate-pulse uppercase tracking-widest">Carregando categorias...</div>
            ) : categorias.length === 0 ? (
              <div className="bg-surface rounded-3xl p-12 border border-outline-variant/50 shadow-sm text-center">
                <span className="material-symbols-outlined text-5xl text-outline mb-2">category</span>
                <p className="text-xl font-bold text-ink-secondary">Nenhuma categoria cadastrada.</p>
              </div>
            ) : (
              <div className="bg-surface rounded-3xl border border-outline-variant/50 shadow-sm overflow-hidden animate-fade-in">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-variant/50 border-b border-outline-variant/30 text-ink-secondary text-xs font-bold uppercase tracking-widest">
                      <th className="p-6 text-center w-20">Emoji</th>
                      <th className="p-6">Nome</th>
                      <th className="p-6">Slug</th>
                      <th className="p-6">Setor / Tipo</th>
                      <th className="p-6 text-center w-24">Ordem</th>
                      <th className="p-6 text-center w-32">Status</th>
                      <th className="p-6 text-center w-36">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {categorias.map(c => (
                      <tr key={c.id} className="hover:bg-surface-variant/20 transition-colors text-ink font-semibold">
                        <td className="p-6 text-center text-2xl">{c.emoji || '📦'}</td>
                        <td className="p-6">
                          <p className="text-ink font-bold text-base">{c.nome}</p>
                          {c.descricao && <p className="text-xs text-ink-secondary font-medium truncate max-w-sm mt-0.5">{c.descricao}</p>}
                        </td>
                        <td className="p-6 font-mono text-xs text-ink-secondary">{c.slug}</td>
                        <td className="p-6">
                          <span className="px-3 py-1 bg-surface-variant text-ink rounded-full text-xs font-bold uppercase tracking-wider">
                            {c.setor || 'Geral'}
                          </span>
                        </td>
                        <td className="p-6 text-center font-mono">{c.ordem}</td>
                        <td className="p-6 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            c.ativo === 1 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                          }`}>
                            {c.ativo === 1 ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td className="p-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => openEditCat(c)}
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors outline-none"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteCat(c)}
                              className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors outline-none"
                              title="Excluir"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal Produto (Criar / Editar) */}
        {showProdModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-lg rounded-[32px] p-8 shadow-2xl border border-outline-variant/50 animate-scale-up max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-sans text-2xl font-bold text-ink tracking-wider">
                  {editingProd ? 'Editar Produto' : 'Novo Produto'}
                </h2>
                <button onClick={() => setShowProdModal(false)} className="text-ink-secondary hover:text-ink outline-none">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleSaveProd} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Nome do Produto *</label>
                  <input required value={prodForm.nome} onChange={e => setProdForm({...prodForm, nome: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" placeholder="Ex: Picanha Argentina" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Código PLU (Toledo)</label>
                    <input value={prodForm.plu} onChange={e => setProdForm({...prodForm, plu: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" placeholder="Ex: 501" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Preço (R$) *</label>
                    <input required value={prodForm.preco} onChange={e => setProdForm({...prodForm, preco: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="number" step="0.01" placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Estoque inicial</label>
                    <input value={prodForm.estoque} onChange={e => setProdForm({...prodForm, estoque: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="number" step="0.01" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Unidade de Medida</label>
                    <select value={prodForm.unidade} onChange={e => setProdForm({...prodForm, unidade: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold">
                      <option value="kg">Quilo (kg)</option>
                      <option value="un">Unidade (un)</option>
                      <option value="g">Grama (g)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Categoria Vinculada</label>
                  <select value={prodForm.categoria_id} onChange={e => setProdForm({...prodForm, categoria_id: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold">
                    <option value="">Sem Categoria (Geral)</option>
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Ordem de exibição</label>
                    <input value={prodForm.ordem} onChange={e => setProdForm({...prodForm, ordem: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="number" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Tags (separadas por vírgula)</label>
                    <input value={prodForm.tags} onChange={e => setProdForm({...prodForm, tags: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" placeholder="Ex: oferta, premium" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Descrição detalhada</label>
                  <textarea value={prodForm.descricao} onChange={e => setProdForm({...prodForm, descricao: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold h-20 resize-none" placeholder="Descrição do produto para o catálogo digital" />
                </div>
                <div className="flex items-center space-x-3 bg-surface-variant/30 p-3 rounded-xl border border-outline-variant/30">
                  <input id="prodStatus" type="checkbox" checked={prodForm.status} onChange={e => setProdForm({...prodForm, status: e.target.checked})} className="w-5 h-5 rounded text-primary focus:ring-primary border-outline-variant/50 cursor-pointer" />
                  <label htmlFor="prodStatus" className="text-sm font-bold text-ink cursor-pointer select-none">Produto ativo para exibição</label>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold mt-6 hover:bg-primary-hover shadow-lg transition-all uppercase tracking-widest">
                  {editingProd ? 'Atualizar Produto' : 'Criar Produto'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal Categoria (Criar / Editar) */}
        {showCatModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-outline-variant/50 animate-scale-up">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-sans text-2xl font-bold text-ink tracking-wider font-bold">
                  {editingCat ? 'Editar Categoria' : 'Nova Categoria'}
                </h2>
                <button onClick={() => setShowCatModal(false)} className="text-ink-secondary hover:text-ink outline-none">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleSaveCat} className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase text-center">Emoji</label>
                    <input required value={catForm.emoji} onChange={e => setCatForm({...catForm, emoji: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl py-3 focus:outline-none focus:border-primary text-2xl text-center font-bold" type="text" placeholder="Ex: 🧀" maxLength={4} />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Nome da Categoria *</label>
                    <input required value={catForm.nome} onChange={e => setCatForm({...catForm, nome: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="text" placeholder="Ex: Frios e Queijos" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Setor / Departamento</label>
                    <select value={catForm.setor} onChange={e => setCatForm({...catForm, setor: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold">
                      <option value="Mercearia">Mercearia</option>
                      <option value="QUEIJOS">Frios / Laticínios</option>
                      <option value="TEMPEROS">Temperos / Especiarias</option>
                      <option value="CASTANHAS">Grãos / Castanhas</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Ordem</label>
                    <input value={catForm.ordem} onChange={e => setCatForm({...catForm, ordem: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold" type="number" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Descrição Curta</label>
                  <textarea value={catForm.descricao} onChange={e => setCatForm({...catForm, descricao: e.target.value})} className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold h-20 resize-none" placeholder="Ex: Variedade de embutidos e laticínios" />
                </div>
                <div className="flex items-center space-x-3 bg-surface-variant/30 p-3 rounded-xl border border-outline-variant/30">
                  <input id="catStatus" type="checkbox" checked={catForm.ativo} onChange={e => setCatForm({...catForm, ativo: e.target.checked})} className="w-5 h-5 rounded text-primary focus:ring-primary border-outline-variant/50 cursor-pointer" />
                  <label htmlFor="catStatus" className="text-sm font-bold text-ink cursor-pointer select-none">Categoria ativa</label>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold mt-6 hover:bg-primary-hover shadow-lg transition-all uppercase tracking-widest">
                  {editingCat ? 'Atualizar Categoria' : 'Criar Categoria'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal Mover e Excluir Categoria */}
        {showMoverExcluirModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-outline-variant/50 animate-scale-up">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-sans text-xl font-bold text-error tracking-wider flex items-center gap-2">
                  <span className="material-symbols-outlined">warning</span>
                  Atenção: Ação Necessária
                </h2>
                <button onClick={() => setShowMoverExcluirModal(false)} className="text-ink-secondary hover:text-ink outline-none">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <p className="text-sm font-semibold text-ink-secondary mb-4 leading-relaxed">
                A categoria <strong className="text-ink">"{catParaExcluir?.nome}"</strong> possui <strong className="text-primary">{produtosVinculadosCount} produto(s)</strong> vinculados a ela. Para excluí-la de forma segura, você precisa mover esses produtos para outra categoria ativa primeiro.
              </p>
              <form onSubmit={handleMoverExcluir} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary tracking-widest mb-1 uppercase">Mover produtos para:</label>
                  <select 
                    value={novaCatDestinoId} 
                    onChange={e => setNovaCatDestinoId(e.target.value)}
                    className="w-full bg-surface-variant border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-ink font-semibold"
                    required
                  >
                    {categorias.filter(c => c.id !== catParaExcluir?.id).map(c => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setShowMoverExcluirModal(false)}
                    className="flex-1 py-3 border border-outline-variant/50 rounded-xl font-bold text-ink-secondary uppercase tracking-widest text-xs hover:bg-surface-variant/30"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-3 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-primary-hover shadow-md"
                  >
                    Mover e Excluir
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
