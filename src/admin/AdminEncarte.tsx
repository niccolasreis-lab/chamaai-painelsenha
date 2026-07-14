import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { getApiUrl } from '../shared/apiConfig';
import {
  Layers,
  Trash2,
  Image as ImageIcon,
  Eye,
  Store
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { Dialog } from '../shared/components/Dialog';
import { StatusBadge } from '../shared/components/StatusBadge';

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
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Encarte
          </h1>
        </div>
        <p className="text-ink-variant text-sm mt-0.5">
          Gerencie filtros, nomes customizados e temas para o encarte do Telão.
        </p>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant overflow-x-auto">
          {(['filtros', 'nomes', 'temas'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 font-bold text-sm border-b-2 transition-all outline-none whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-ink-variant hover:text-ink hover:bg-surface-container-low'
              }`}
            >
              {tab === 'filtros' && 'Filtros'}
              {tab === 'nomes' && 'Nomes Customizados'}
              {tab === 'temas' && 'Temas (Backgrounds)'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <StatusBadge variant="loading" />
        ) : (
          <>
            {activeTab === 'filtros' && (
              <div className="space-y-4 animate-fade-in">
                <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
                  <h3 className="font-bold text-sm text-ink mb-3">Novo filtro (palavra bloqueada)</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      type="text"
                      label="Palavra-chave a filtrar"
                      placeholder="Ex: CERVEJA"
                      value={novaPalavra}
                      onChange={(e) => setNovaPalavra(e.target.value)}
                      className="flex-grow font-bold uppercase"
                    />
                    <div className="flex items-end">
                      <Button
                        onClick={addFiltro}
                        className="w-full sm:w-auto h-11"
                      >
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtros.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-surface rounded-md p-3 border border-outline-variant shadow-sm">
                      <span className="font-bold text-sm text-ink uppercase tracking-wider">{f.palavra_chave}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="px-2"
                        onClick={() => deleteFiltro(f.id)}
                      >
                        <Trash2 className="h-4 w-4 text-error" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'nomes' && (
              <div className="space-y-4 animate-fade-in">
                <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm">
                  <h3 className="font-bold text-sm text-ink mb-3">Adicionar nome customizado</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      type="text"
                      label="Código PLU"
                      placeholder="PLU"
                      value={novoCodigo}
                      onChange={(e) => setNovoCodigo(e.target.value)}
                      className="w-full sm:w-1/3 font-bold"
                    />
                    <Input
                      type="text"
                      label="Novo Nome de Exibição"
                      placeholder="Novo Nome de Exibição"
                      value={novoNomeExibicao}
                      onChange={(e) => setNovoNomeExibicao(e.target.value)}
                      className="flex-grow font-bold"
                    />
                    <div className="flex items-end">
                      <Button
                        onClick={addNome}
                        className="w-full sm:w-auto h-11"
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-surface-container-low text-ink-variant text-xs font-bold uppercase tracking-wider border-b border-outline-variant">
                        <tr>
                          <th className="p-4">PLU</th>
                          <th className="p-4">Nome Exibição</th>
                          <th className="p-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {nomes.map(n => (
                          <tr key={n.codigo_produto} className="hover:bg-surface-container-low transition-colors">
                            <td className="p-4 font-mono font-bold text-sm text-ink-variant">{n.codigo_produto}</td>
                            <td className="p-4 font-bold text-sm text-ink">{n.nome_exibicao}</td>
                            <td className="p-4 text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="px-2"
                                onClick={() => deleteNome(n.codigo_produto)}
                              >
                                <Trash2 className="h-4 w-4 text-error" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'temas' && (
              <div className="space-y-4 animate-fade-in">
                <div className="bg-surface rounded-md p-4 border border-outline-variant shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-full">
                    <h3 className="font-bold text-sm text-ink mb-1">Adicionar tema temático</h3>
                  </div>
                  <Input
                    type="text"
                    label="Nome do tema *"
                    value={temaNome}
                    onChange={(e) => setTemaNome(e.target.value)}
                    placeholder="Ex: Natal"
                  />
                  <Input
                    type="text"
                    label="Caminho/url da imagem *"
                    value={temaImagem}
                    onChange={(e) => setTemaImagem(e.target.value)}
                    placeholder="/uploads/natal.jpg"
                  />
                  <Input
                    type="date"
                    label="Data de início"
                    value={temaDataInicio}
                    onChange={(e) => setTemaDataInicio(e.target.value)}
                    className="text-ink-variant"
                  />
                  <Input
                    type="date"
                    label="Data de fim"
                    value={temaDataFim}
                    onChange={(e) => setTemaDataFim(e.target.value)}
                    className="text-ink-variant"
                  />
                  <div className="col-span-full flex justify-end mt-2">
                    <Button onClick={addTema}>
                      Salvar Tema
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {temas.map(t => (
                    <div key={t.id} className="bg-surface rounded-md border border-outline-variant shadow-sm overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="h-28 bg-surface-container overflow-hidden relative">
                          {t.imagem_fundo ? (
                            <img src={`${API_URL}${t.imagem_fundo}`} className="w-full h-full object-cover" alt="Tema" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-outline" />
                            </div>
                          )}
                          {!t.ativo && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white font-bold tracking-wider bg-error px-2.5 py-0.5 rounded-sm text-[10px] uppercase">Inativo</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h4 className="font-bold text-ink text-sm uppercase tracking-wide">{t.nome}</h4>
                          <p className="text-[10px] font-semibold text-ink-variant mt-1">
                            Início: {t.data_inicio || 'Sem limite'}
                          </p>
                          <p className="text-[10px] font-semibold text-ink-variant mt-0.5">
                            Fim: {t.data_fim || 'Sem limite'}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 border-t border-outline-variant/30 flex justify-between items-center bg-surface-container-low">
                        <Button 
                          variant="ghost"
                          size="sm"
                          onClick={() => openPreview(t)}
                          icon={<Eye className="h-3.5 w-3.5" />}
                          className="text-xs text-primary"
                        >
                          Visualizar
                        </Button>
                        <Button 
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTema(t.id)}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          className="text-xs text-error"
                        >
                          Excluir
                        </Button>
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
        <Dialog
          open={Boolean(selectedTheme)}
          onClose={() => setSelectedTheme(null)}
          title={`Simulador de TV — ${selectedTheme.nome}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4">
            {/* Simulator Control Bar */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-surface-container-low p-3 rounded-md border border-outline-variant">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink uppercase tracking-wider">Estilo de Layout:</span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={simulatedStyle === 'kg' ? 'primary' : 'secondary'}
                    onClick={() => setSimulatedStyle('kg')}
                    className="text-[10px] h-8"
                  >
                    🌙 KG (Escuro)
                  </Button>
                  <Button
                    size="sm"
                    variant={simulatedStyle === 'granel' ? 'primary' : 'secondary'}
                    onClick={() => setSimulatedStyle('granel')}
                    className="text-[10px] h-8"
                  >
                    🌿 Granel (Claro)
                  </Button>
                </div>
              </div>
            </div>

            {/* 16:9 TV Container */}
            <div className="w-full aspect-video bg-black relative rounded-md overflow-hidden shadow-lg border-4 border-zinc-800 flex flex-col justify-between p-6 text-white select-none">
              
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
                  ? 'bg-black/75 backdrop-blur-[1px]'
                  : 'bg-gradient-to-br from-white/95 via-white/90 to-white/95 backdrop-blur-[0.5px]'
              }`} />

              {/* Simulated Content Area (Above Background/Overlay) */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between">
                
                {/* Simulator Header */}
                <div className="flex justify-between items-center border-b pb-3 mb-2" style={{ borderColor: simulatedStyle === 'kg' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                  <div className="flex items-center gap-2.5">
                    {previewConfig.logo_cliente ? (
                      <img 
                        src={`${API_URL}${previewConfig.logo_cliente}`} 
                        alt="Logo" 
                        className="h-8 w-auto object-contain bg-white/20 backdrop-blur-sm p-1 rounded-sm" 
                      />
                    ) : (
                      <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${simulatedStyle === 'kg' ? 'bg-primary/20 text-primary' : 'bg-primary text-white'}`}>
                        <Store className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <h2 className={`font-black text-sm uppercase tracking-wider ${simulatedStyle === 'kg' ? 'text-white' : 'text-zinc-900'}`}>
                        {previewConfig.nome_estabelecimento || 'ChamaAí'}
                      </h2>
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${simulatedStyle === 'kg' ? 'text-white/60' : 'text-zinc-500'}`}>
                        Ofertas e Destaques do Dia
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    simulatedStyle === 'kg' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-500 text-white shadow'
                  }`}>
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    AO VIVO NO PAINEL
                  </div>
                </div>

                {/* Product Grid Area */}
                <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden items-center pb-2">
                  {previewProducts.length === 0 ? (
                    <div className="col-span-full text-center py-4">
                      <p className={`font-bold text-sm ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-400'}`}>
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
                          className={`p-3 rounded-md flex flex-col justify-between border transition-all shadow relative overflow-hidden h-[95px] ${
                            simulatedStyle === 'kg'
                              ? isOferta
                                ? 'bg-red-950/40 border-red-500/80 shadow-lg shadow-red-500/5'
                                : 'bg-zinc-900/60 border-zinc-800'
                              : isOferta
                                ? 'bg-red-50/90 border-red-500/80 shadow'
                                : 'bg-white/85 backdrop-blur-sm border-zinc-200'
                          }`}
                        >
                          {isOferta && (
                            <div className="absolute top-0 right-0 bg-red-600 text-white font-black text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-bl-sm">
                              OFERTA
                            </div>
                          )}
                          <div>
                            <span className={`text-[8px] font-mono font-bold block mb-0.5 ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-400'}`}>
                              PLU {p.plu}
                            </span>
                            <h4 className={`font-bold leading-tight line-clamp-2 text-xs uppercase tracking-wide ${
                              simulatedStyle === 'kg'
                                ? isOferta ? 'text-red-200' : 'text-white'
                                : isOferta ? 'text-red-900' : 'text-zinc-900'
                            }`}>
                              {descClean}
                            </h4>
                          </div>
                          <div className="flex justify-between items-baseline mt-1">
                            <span className={`font-black text-base ${
                              simulatedStyle === 'kg'
                                ? isOferta ? 'text-red-400' : 'text-emerald-400'
                                : isOferta ? 'text-red-600' : 'text-emerald-600'
                            }`}>
                              {formattedPreco}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}`}>
                              / {p.unidade || 'kg'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Simulator Footer */}
                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider pt-2 border-t border-dashed" style={{ borderColor: simulatedStyle === 'kg' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <span className={simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}>
                    Toledo MGV Integrador Oficial
                  </span>
                  <span className={simulatedStyle === 'kg' ? 'text-white/40' : 'text-zinc-500'}>
                    Senha Atual Telão: <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-sm font-mono text-[10px]">M042</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-2">
              <Button 
                variant="ghost"
                onClick={() => setSelectedTheme(null)}
              >
                Fechar Simulador
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </AdminLayout>
  );
}
