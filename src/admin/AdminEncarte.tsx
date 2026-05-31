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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resFiltros, resNomes, resTemas] = await Promise.all([
        fetch(`${API_URL}/api/admin/encarte-filtros`),
        fetch(`${API_URL}/api/admin/encarte-nomes`),
        fetch(`${API_URL}/api/admin/encarte-temas`)
      ]);
      setFiltros(resFiltros.ok ? await resFiltros.json() : []);
      setNomes(resNomes.ok ? await resNomes.json() : []);
      setTemas(resTemas.ok ? await resTemas.json() : []);
    } catch (err) {
      console.error('Erro ao buscar dados do encarte', err);
    } finally {
      setLoading(false);
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
                      <div className="p-4 border-t border-outline-variant/30 flex justify-end">
                        <button onClick={() => deleteTema(t.id)} className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center gap-2 font-bold text-sm uppercase tracking-widest">
                          <span className="material-symbols-outlined">delete</span> Excluir
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
    </AdminLayout>
  );
}
