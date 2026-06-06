import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';

export default function AdminEncarte() {
  const [activeTab, setActiveTab] = useState<'filtros' | 'nomes' | 'temas'>('filtros');
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState<any[]>([]);
  const [nomes, setNomes] = useState<any[]>([]);
  const [temas, setTemas] = useState<any[]>([]);
  const API_URL = getApiUrl();

  // Estados dos formulários
  const [novaPalavra, setNovaPalavra] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoNomeExibicao, setNovoNomeExibicao] = useState('');
  
  // Tema form
  const [temaNome, setTemaNome] = useState('');
  const [temaImagem, setTemaImagem] = useState('');
  const [temaDataInicio, setTemaDataInicio] = useState('');
  const [temaDataFim, setTemaDataFim] = useState('');

  // Simulação de visualização premium de TV
  const [selectedTheme, setSelectedTheme] = useState<any | null>(null);
  const [previewProducts, setPreviewProducts] = useState<any[]>([]);
  const [previewConfig, setPreviewConfig] = useState<any>({});
  const [simulatedStyle, setSimulatedStyle] = useState<'kg' | 'granel'>('kg');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resFiltros, resNomes, resTemas, resConfig] = await Promise.all([
        fetch(`${API_URL}/api/admin/encarte-filtros`),
        fetch(`${API_URL}/api/admin/encarte-nomes`),
        fetch(`${API_URL}/api/admin/encarte-temas`),
        fetch(`${API_URL}/api/configuracoes`)
      ]);
      setFiltros(resFiltros.ok ? await resFiltros.json() : []);
      setNomes(resNomes.ok ? await resNomes.json() : []);
      setTemas(resTemas.ok ? await resTemas.json() : []);
      setPreviewConfig(resConfig.ok ? await resConfig.json() : {});
    } catch (err) {
      console.error('Erro ao buscar dados do encarte', err);
    } finally {
      setLoading(false);
    }
  };

  const openPreview = async (theme: any) => {
    setSelectedTheme(theme);
    setSimulatedStyle((previewConfig.toledo_encarte_estilo as any) || 'kg');
    try {
      const res = await fetch(`${API_URL}/api/toledo/produtos`);
      if (res.ok) {
        const prods = await res.json();
        // Filtrar produtos com preço maior que zero
        const availableProds = prods.filter((p: any) => Number(p.preco || 0) > 0);
        setPreviewProducts(availableProds.slice(0, 6));
      }
    } catch (err) {
      console.error('Erro ao carregar produtos para a simulação:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addFiltro = async () => {
    if (!novaPalavra.trim()) return;
    try {
      await fetch(`${API_URL}/api/admin/encarte-filtros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palavra_chave: novaPalavra.trim() })
      });
      setNovaPalavra('');
      fetchData();
    } catch (err) {}
  };

  const deleteFiltro = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/admin/encarte-filtros/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {}
  };

  const addNome = async () => {
    if (!novoCodigo.trim() || !novoNomeExibicao.trim()) return;
    try {
      await fetch(`${API_URL}/api/admin/encarte-nomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_produto: novoCodigo.trim(), nome_exibicao: novoNomeExibicao.trim() })
      });
      setNovoCodigo('');
      setNovoNomeExibicao('');
      fetchData();
    } catch (err) {}
  };

  const deleteNome = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/admin/encarte-nomes/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {}
  };

  const addTema = async () => {
    if (!temaNome.trim() || !temaImagem.trim()) return;
    try {
      await fetch(`${API_URL}/api/admin/encarte-temas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: temaNome.trim(),
          imagem_fundo: temaImagem.trim(),
          data_inicio: temaDataInicio || null,
          data_fim: temaDataFim || null
        })
      });
      setTemaNome('');
      setTemaImagem('');
      setTemaDataInicio('');
      setTemaDataFim('');
      fetchData();
    } catch (err) {}
  };

  const deleteTema = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/admin/encarte-temas/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {}
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-8 font-sans">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="material-symbols-outlined text-white text-2xl">style</span>
          </div>
          <h1 className="font-sans text-[40px] font-bold text-ink leading-tight uppercase tracking-widest">
            Encarte
          </h1>
        </div>
        <p className="text-ink-secondary mt-1 text-lg font-semibold">
          Gerencie filtros, nomes customizados e temas para o encarte do Telão.
        </p>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-outline-variant/30">
          <button
            onClick={() => setActiveTab('filtros')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
              activeTab === 'filtros'
                ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
            }`}
          >
            Filtros
          </button>
          <button
            onClick={() => setActiveTab('nomes')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
              activeTab === 'nomes'
                ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
            }`}
          >
            Nomes Customizados
          </button>
          <button
            onClick={() => setActiveTab('temas')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-widest rounded-t-xl transition-all ${
              activeTab === 'temas'
                ? 'bg-surface text-primary border border-outline-variant/50 border-b-transparent -mb-[1px]'
                : 'text-ink-secondary hover:text-ink hover:bg-surface-variant/50'
            }`}
          >
            Temas (Backgrounds)
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-outline-variant animate-spin">sync</span>
            <p className="text-ink-secondary mt-4 font-bold uppercase tracking-widest">Carregando...</p>
          </div>
        ) : (
          <>
            {activeTab === 'filtros' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
                  <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4">Novo Filtro (Palavra Bloqueada)</h3>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      placeholder="Ex: CERVEJA"
                      value={novaPalavra}
                      onChange={(e) => setNovaPalavra(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold uppercase"
                    />
                    <button
                      onClick={addFiltro}
                      className="px-6 py-3 bg-primary text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-primary-hover active:scale-95 transition-all"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtros.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-surface rounded-2xl p-4 border border-outline-variant/50 shadow-sm">
                      <span className="font-bold text-ink uppercase tracking-wider">{f.palavra_chave}</span>
                      <button onClick={() => deleteFiltro(f.id)} className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors">
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'nomes' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm">
                  <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4">Adicionar Nome Customizado</h3>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      placeholder="Código PLU"
                      value={novoCodigo}
                      onChange={(e) => setNovoCodigo(e.target.value)}
                      className="w-1/3 px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                    />
                    <input
                      type="text"
                      placeholder="Novo Nome de Exibição"
                      value={novoNomeExibicao}
                      onChange={(e) => setNovoNomeExibicao(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                    />
                    <button
                      onClick={addNome}
                      className="px-6 py-3 bg-primary text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-primary-hover active:scale-95 transition-all"
                    >
                      Salvar
                    </button>
                  </div>
                </div>

                <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-surface-variant/30 text-ink-secondary text-xs font-bold uppercase tracking-widest border-b border-outline-variant/30">
                      <tr>
                        <th className="px-6 py-4">PLU</th>
                        <th className="px-6 py-4">Nome Exibição</th>
                        <th className="px-6 py-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {nomes.map(n => (
                        <tr key={n.codigo_produto} className="hover:bg-surface-variant/10">
                          <td className="px-6 py-4 font-mono font-bold text-ink-secondary">{n.codigo_produto}</td>
                          <td className="px-6 py-4 font-bold text-ink">{n.nome_exibicao}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => deleteNome(n.codigo_produto)} className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors">
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'temas' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface rounded-2xl p-6 border border-outline-variant/50 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full">
                    <h3 className="font-bold text-sm text-ink uppercase tracking-widest mb-4">Adicionar Tema Temático</h3>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Nome do Tema</label>
                    <input
                      type="text"
                      value={temaNome}
                      onChange={(e) => setTemaNome(e.target.value)}
                      placeholder="Ex: Natal"
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Caminho/URL da Imagem</label>
                    <input
                      type="text"
                      value={temaImagem}
                      onChange={(e) => setTemaImagem(e.target.value)}
                      placeholder="/uploads/natal.jpg"
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Data de Início</label>
                    <input
                      type="date"
                      value={temaDataInicio}
                      onChange={(e) => setTemaDataInicio(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant font-bold text-ink-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest block mb-1">Data de Fim</label>
                    <input
                      type="date"
                      value={temaDataFim}
                      onChange={(e) => setTemaDataFim(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant font-bold text-ink-secondary"
                    />
                  </div>
                  <div className="col-span-full flex justify-end mt-2">
                    <button
                      onClick={addTema}
                      className="px-6 py-3 bg-primary text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-primary-hover active:scale-95 transition-all"
                    >
                      Salvar Tema
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {temas.map(t => (
                    <div key={t.id} className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden flex flex-col">
                      <div className="h-32 bg-surface-variant overflow-hidden relative">
                        {t.imagem_fundo ? (
                          <img src={`${API_URL}${t.imagem_fundo}`} className="w-full h-full object-cover" alt="Tema" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl text-ink-secondary opacity-30">image</span>
                          </div>
                        )}
                        {!t.ativo && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white font-bold tracking-widest uppercase bg-error px-3 py-1 rounded-full text-xs">Inativo</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex-1">
                        <h4 className="font-bold text-ink text-lg uppercase tracking-wider">{t.nome}</h4>
                        <p className="text-xs font-semibold text-ink-secondary mt-1">
                          Início: {t.data_inicio || 'Sem limite'}
                        </p>
                        <p className="text-xs font-semibold text-ink-secondary mt-1">
                          Fim: {t.data_fim || 'Sem limite'}
                        </p>
                      </div>
                      <div className="p-4 border-t border-outline-variant/30 flex justify-between items-center">
                        <button 
                          onClick={() => openPreview(t)}
                          className="text-primary hover:bg-primary/5 px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider outline-none"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                          <span>Visualizar</span>
                        </button>
                        <button onClick={() => deleteTema(t.id)} className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs uppercase tracking-wider">
                          <span className="material-symbols-outlined text-[16px]">delete</span> Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedTheme && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-md">
          {/* Top Control Bar */}
          <div className="w-full max-w-5xl mb-4 flex justify-between items-center bg-surface border border-outline-variant p-4 rounded-2xl shadow-lg">
            <div className="flex items-center gap-4">
              <span className="font-bold text-ink text-sm uppercase tracking-wider">Simulador de TV ({selectedTheme.nome})</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSimulatedStyle('kg')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                    simulatedStyle === 'kg'
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                      : 'bg-surface-variant border-outline-variant/65 text-ink hover:bg-surface-variant'
                  }`}
                >
                  🌙 Preço por KG (Escuro)
                </button>
                <button
                  onClick={() => setSimulatedStyle('granel')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                    simulatedStyle === 'granel'
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                      : 'bg-surface-variant border-outline-variant/65 text-ink hover:bg-surface-variant'
                  }`}
                >
                  🌿 Granel Premium (Claro)
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => setSelectedTheme(null)}
              className="px-4 py-2 bg-error text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-error-dark active:scale-95 transition-all shadow-md flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">close</span> Fechar
            </button>
          </div>

          {/* 16:9 TV Container */}
          <div className="w-full max-w-5xl aspect-video bg-black relative rounded-3xl overflow-hidden shadow-2xl border-[6px] border-zinc-800 flex flex-col justify-between p-8 text-white select-none">
            
            {/* Background Theme Image */}
            {selectedTheme.imagem_fundo && (
              <div 
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{ backgroundImage: `url(${API_URL}${selectedTheme.imagem_fundo})` }}
              />
            )}
            
            {/* Custom Overlay (Style Specific) */}
            <div className={`absolute inset-0 pointer-events-none transition-all duration-300 ${
              simulatedStyle === 'kg'
                ? 'bg-black/75 backdrop-blur-[2px]'
                : 'bg-gradient-to-br from-white/92 via-white/88 to-white/94 backdrop-blur-[1px]'
            }`} />

            {/* Simulated Content Area (Above Background/Overlay) */}
            <div className="relative z-10 w-full h-full flex flex-col justify-between">
              
              {/* Simulator Header */}
              <div className="flex justify-between items-center border-b pb-4 mb-4" style={{ borderColor: simulatedStyle === 'kg' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                <div className="flex items-center gap-3">
                  {previewConfig.logo_cliente ? (
                    <img 
                      src={`${API_URL}${previewConfig.logo_cliente}`} 
                      alt="Logo" 
                      className="h-12 w-auto object-contain bg-white/20 backdrop-blur-sm p-1 rounded" 
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded flex items-center justify-center ${simulatedStyle === 'kg' ? 'bg-primary/20 text-primary' : 'bg-primary text-white'}`}>
                      <span className="material-symbols-outlined font-bold text-xl">storefront</span>
                    </div>
                  )}
                  <div>
                    <h2 className={`font-black text-xl uppercase tracking-widest ${simulatedStyle === 'kg' ? 'text-white' : 'text-zinc-900'}`}>
                      {previewConfig.nome_estabelecimento || 'ChamaAí'}
                    </h2>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${simulatedStyle === 'kg' ? 'text-white/60' : 'text-zinc-500'}`}>
                      Ofertas e Destaques do Dia
                    </p>
                  </div>
                </div>

                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                  simulatedStyle === 'kg' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-500 text-white shadow-lg'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                  AO VIVO NO PAINEL
                </div>
              </div>

              {/* Product Grid Area */}
              <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden items-center pb-4">
                {previewProducts.length === 0 ? (
                  <div className="col-span-full text-center py-10">
                    <p className={`font-bold text-lg ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-400'}`}>
                      Nenhum produto cadastrado para simular. Adicione itens na aba Toledo primeiro.
                    </p>
                  </div>
                ) : (
                  previewProducts.map((p) => {
                    const isOferta = p.descricao.includes('* OFERTA *') || p.descricao.includes('OFERTA') || p.descricao.includes('*');
                    const descClean = p.descricao.replace(/\* OFERTA \*/g, '').replace(/OFERTA/g, '').replace(/\*/g, '').trim();
                    const formattedPreco = `R$ ${Math.floor(p.preco / 100)},${String(p.preco % 100).padStart(2, '0')}`;

                    return (
                      <div 
                        key={p.plu}
                        className={`p-4 rounded-2xl flex flex-col justify-between border-2 transition-all shadow-md relative overflow-hidden h-[120px] ${
                          simulatedStyle === 'kg'
                            ? isOferta
                              ? 'bg-red-950/40 border-red-500/80 shadow-lg shadow-red-500/5'
                              : 'bg-zinc-900/60 border-zinc-800'
                            : isOferta
                              ? 'bg-red-50/90 border-red-500/80 shadow-lg'
                              : 'bg-white/80 backdrop-blur-sm border-zinc-200'
                        }`}
                      >
                        {isOferta && (
                          <div className="absolute top-0 right-0 bg-red-600 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-bl-lg shadow">
                            OFERTA
                          </div>
                        )}
                        <div>
                          <span className={`text-[9px] font-mono font-bold block mb-1 ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-400'}`}>
                            PLU {p.plu}
                          </span>
                          <h4 className={`font-bold leading-snug line-clamp-2 text-sm uppercase tracking-wide ${
                            simulatedStyle === 'kg'
                              ? isOferta ? 'text-red-200' : 'text-white'
                              : isOferta ? 'text-red-900' : 'text-zinc-900'
                          }`}>
                            {descClean}
                          </h4>
                        </div>
                        <div className="flex justify-between items-baseline mt-2">
                          <span className={`font-black text-xl ${
                            simulatedStyle === 'kg'
                              ? isOferta ? 'text-red-400' : 'text-emerald-400'
                              : isOferta ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {formattedPreco}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}`}>
                            / kg
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Simulator Footer */}
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider pt-2 border-t border-dashed" style={{ borderColor: simulatedStyle === 'kg' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                <span className={simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}>
                  Toledo MGV Integrador Oficial
                </span>
                <span className={simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}>
                  Senha Atual Telão: <span className="bg-primary/20 text-primary px-2 py-0.5 rounded font-mono text-xs">M042</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
