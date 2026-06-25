import { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../shared/apiConfig';
import type { ProdutoToledo, Categoria, TemaEncarte, EstablishmentConfig } from '../shared/types';

interface EncarteProps {
  duracao: number;
  itensPorSlide: number;
  onComplete: () => void;
  config: EstablishmentConfig;
  categoriasFiltro?: string[];
  // Caching props
  produtos: ProdutoToledo[];
  categorias: Categoria[];
  temaAtivo: TemaEncarte | null;
  loading: boolean;
  error: string | null;
  lowPerformanceMode?: boolean;
}

type PrecosGroup = {
  nome: string;
  isOferta?: boolean;
  produtos: ProdutoToledo[];
};

function getProductNameStyle(name: string, isAuto: boolean, customFont?: string): React.CSSProperties {
  if (!isAuto) {
    return { fontSize: customFont || '1.25rem' };
  }
  const cleanName = name.replace(/\*|OFERTA/gi, '').trim();
  let size = '1.35rem';
  if (cleanName.length > 36) {
    size = '1.05rem';
  } else if (cleanName.length > 24) {
    size = '1.2rem';
  }
  return { fontSize: size };
}

function getPriceStyle(priceText: string, isAuto: boolean, customFont?: string): React.CSSProperties {
  if (!isAuto) {
    return { fontSize: customFont || '1.75rem' };
  }
  let size = '2.1rem';
  if (priceText.length > 8) {
    size = '1.6rem';
  } else if (priceText.length > 6) {
    size = '1.85rem';
  }
  return { fontSize: size };
}

export default function EncartePrecos({ 
  duracao, 
  itensPorSlide, 
  onComplete, 
  config, 
  categoriasFiltro,
  produtos,
  categorias,
  temaAtivo,
  loading,
  error,
  lowPerformanceMode = false
}: EncarteProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const API_URL = getApiUrl();

  const activeCategories = useMemo(() => {
    return categorias.filter((c: Categoria) => c.ativo);
  }, [categorias]);

  const temaDinâmico = temaAtivo;

  const slides = useMemo(() => {
    if (loading) return [];

    const catMap = new Map<string, Categoria>();
    activeCategories.forEach((c: Categoria) => {
      catMap.set(c.nome.trim().toLowerCase(), c);
    });

    // Filter out items with price = 0 if configured to do so
    const ocultarEmFalta = config.toledo_ocultar_em_falta === '1' || config.toledo_ocultar_em_falta === true;
    let filteredData = ocultarEmFalta ? produtos.filter((p: ProdutoToledo) => p.preco > 0) : produtos;

    // Apply category filter if provided
    if (categoriasFiltro && categoriasFiltro.length > 0) {
      filteredData = filteredData.filter((p: ProdutoToledo) => {
        const productCat = (p.categoria || '').trim().toLowerCase();
        return categoriasFiltro.some(filterCat => {
          const fCat = filterCat.trim().toLowerCase();
          return productCat === fCat || productCat.includes(fCat) || fCat.includes(productCat);
        });
      });
    }

    // Group by category
    const grouped = filteredData.reduce((acc: Record<string, PrecosGroup>, p: ProdutoToledo) => {
      const cat = p.categoria || 'Despensa e Utilidades Básicas';
      if (!acc[cat]) acc[cat] = { nome: cat, produtos: [] };
      acc[cat].produtos.push(p);
      return acc;
    }, {});

    // Sort categories based on their database 'ordem'
    const sortedGroups = Object.values(grouped).sort((a: PrecosGroup, b: PrecosGroup) => {
      const catA = catMap.get(a.nome.trim().toLowerCase());
      const catB = catMap.get(b.nome.trim().toLowerCase());
      const orderA = catA ? catA.ordem : 999;
      const orderB = catB ? catB.ordem : 999;
      return orderA - orderB;
    });

    // FEATURE: Super Ofertas
    const ofertas: ProdutoToledo[] = [];
    const nonOfertas: PrecosGroup[] = [];

    sortedGroups.forEach((group: PrecosGroup) => {
      const norm = group.produtos.filter((p: ProdutoToledo) => !p.descricao.includes('OFERTA') && !p.descricao.includes('*'));
      const ofs = group.produtos.filter((p: ProdutoToledo) => p.descricao.includes('OFERTA') || p.descricao.includes('*'));

      if (ofs.length > 0) ofertas.push(...ofs);
      if (norm.length > 0) nonOfertas.push({ ...group, produtos: norm });
    });

    if (ofertas.length > 0) {
      nonOfertas.unshift({ nome: 'OFERTAS DO DIA', isOferta: true, produtos: ofertas });
    }

    // Chunk into slides
    const newSlides: PrecosGroup[][] = [];
    let currentSlideData: PrecosGroup[] = [];
    let currentCount = 0;

    for (const group of nonOfertas) {
      const gCount = group.produtos.length;
      if (currentCount + gCount <= itensPorSlide && gCount > 0) {
        currentSlideData.push(group);
        currentCount += gCount;
      } else if (gCount > 0) {
        if (currentCount > 0) {
          newSlides.push(currentSlideData);
          currentSlideData = [];
          currentCount = 0;
        }
        const chunks = [];
        for (let i = 0; i < group.produtos.length; i += itensPorSlide) {
          chunks.push(group.produtos.slice(i, i + itensPorSlide));
        }
        for (let i = 0; i < chunks.length; i++) {
          if (i < chunks.length - 1) {
            newSlides.push([{ nome: group.nome, isOferta: group.isOferta, produtos: chunks[i] }]);
          } else {
            currentSlideData = [{ nome: group.nome, isOferta: group.isOferta, produtos: chunks[i] }];
            currentCount = chunks[i].length;
          }
        }
      }
    }
    if (currentSlideData.length > 0) {
      newSlides.push(currentSlideData);
    }

    if (newSlides.length === 0) {
      newSlides.push([]);
    }
    return newSlides;
  }, [produtos, activeCategories, config.toledo_ocultar_em_falta, categoriasFiltro, itensPorSlide, loading]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (slides.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => {
        if (prev + 1 >= slides.length) {
          onComplete();
          return 0;
        }
        return prev + 1;
      });
    }, duracao * 1000);
    return () => clearInterval(interval);
  }, [slides.length, duracao, onComplete]);

  const getCategoryStyle = (nome: string, isOferta: boolean) => {
    if (isOferta) return { icon: '🔥', bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', isPulse: !lowPerformanceMode };

    const dbCat = activeCategories.find((c: Categoria) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    const emoji = dbCat ? dbCat.emoji : '📦';

    const colorsPool = [
      { bg: 'bg-blue-300/10', border: 'border-blue-300/20', text: 'text-blue-200' },
      { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
      { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
      { bg: 'bg-amber-600/10', border: 'border-amber-600/20', text: 'text-amber-500' },
      { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
      { bg: 'bg-orange-400/10', border: 'border-orange-400/20', text: 'text-orange-300' },
      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
      { bg: 'bg-teal-400/10', border: 'border-teal-400/20', text: 'text-teal-300' },
      { bg: 'bg-sky-400/10', border: 'border-sky-400/20', text: 'text-sky-300' },
    ];

    const idx = dbCat ? activeCategories.indexOf(dbCat) : 0;
    const style = colorsPool[idx % colorsPool.length];

    return {
      icon: emoji || '📦',
      ...style
    };
  };

  const formatPreco = (preco: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco / 100);
  };

  if (loading && slides.length === 0) {
    return (
      <div className="h-full w-full bg-slate-950 flex items-center justify-center text-white text-lg uppercase tracking-widest font-sans">
        Carregando Encarte...
      </div>
    );
  }

  if (error && slides.length === 0) {
    return (
      <div className="h-full w-full bg-slate-950 flex items-center justify-center text-red-400 text-lg uppercase tracking-widest font-sans">
        Erro ao carregar dados do Encarte.
      </div>
    );
  }

  if (slides.length === 0 || (slides.length === 1 && slides[0].length === 0)) {
    return (
      <div className="h-full w-full bg-slate-950 flex items-center justify-center text-white/50 text-lg uppercase tracking-widest font-sans">
        Nenhum produto a granel disponível.
      </div>
    );
  }

  const colunas = config.toledo_encarte_colunas || 3;
  const currentSlideData = slides[currentSlide] || [];
  const totalSlides = slides.length || 1;

  const theme = config.toledo_encarte_tema || config.toledo_tema || 'padrao';
  let bgGradient = 'linear-gradient(135deg, #0f172a 0%, #020617 100%)';
  let accentClass = 'text-emerald-400';
  let accentBgClass = 'bg-emerald-400';
  let glowClass = 'from-emerald-400 to-teal-600 shadow-emerald-500/30';

  if (theme === 'acougue') {
    bgGradient = 'linear-gradient(135deg, #2a0a0a 0%, #4a1111 30%, #2a0a0a 70%, #1a0505 100%)';
    accentClass = 'text-red-400';
    accentBgClass = 'bg-red-400';
    glowClass = 'from-red-400 to-rose-600 shadow-red-500/30';
  } else if (theme === 'padaria') {
    bgGradient = 'linear-gradient(135deg, #2a1b0a 0%, #4a3011 30%, #2a1b0a 70%, #1a1005 100%)';
    accentClass = 'text-amber-400';
    accentBgClass = 'bg-amber-400';
    glowClass = 'from-amber-400 to-orange-600 shadow-amber-500/30';
  } else if (theme === 'hortifruti') {
    bgGradient = 'linear-gradient(135deg, #0a2a0f 0%, #1a4a1f 30%, #0a2a0f 70%, #051a08 100%)';
    accentClass = 'text-lime-400';
    accentBgClass = 'bg-lime-400';
    glowClass = 'from-lime-400 to-green-600 shadow-lime-500/30';
  }

  let dynamicBgStyle = {};
  if (temaDinâmico && temaDinâmico.imagem_fundo) {
    dynamicBgStyle = {
      backgroundImage: `url(${API_URL}${temaDinâmico.imagem_fundo})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
    bgGradient = ''; 
  }

  const isAutoDesc = config.toledo_fonte_descricao === 'auto';
  const isAutoPrice = config.toledo_fonte_preco === 'auto';
  const accentColor = accentBgClass.split('-')[1];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden animate-fade-in" style={{ background: bgGradient || 'transparent', ...dynamicBgStyle }}>
      {temaDinâmico && <div className="absolute inset-0 bg-black/60 z-0"></div>}
      
      <div className="relative z-10 flex flex-col h-full w-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-2 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {!lowPerformanceMode && (
                <div className={`absolute inset-0 ${accentBgClass}/30 rounded-full blur-xl animate-pulse`}></div>
              )}
              <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${glowClass.split(' shadow')[0]} flex items-center justify-center shadow-lg overflow-hidden`}>
                {config?.logo_cliente ? (
                  <img src={`${API_URL}${config.logo_cliente}`} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="material-symbols-outlined text-white text-[2rem] font-bold">monitoring</span>
                )}
              </div>
            </div>
            <div>
              <h1 className="text-[2.5rem] font-black text-white uppercase tracking-tight leading-none">
                PREÇOS POR KG <span className={`text-transparent bg-clip-text bg-gradient-to-r ${glowClass.split(' ')[0]} ${glowClass.split(' ')[1]}`}>— HOJE</span>
              </h1>
              <p className="text-white/50 font-bold uppercase tracking-[0.2em] text-sm mt-1">
                Supermercado • Atualização Automática
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {totalSlides > 1 && (
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10">
                <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Página</span>
                <span className="text-white text-2xl font-black">{currentSlide + 1}</span>
                <span className="text-white/30 text-lg font-bold">/</span>
                <span className="text-white/50 text-2xl font-bold">{totalSlides}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`shrink-0 mx-2 h-[2px] bg-gradient-to-r from-transparent via-${accentColor}-500/40 to-transparent`}></div>

        {/* Products Grid */}
        <div className="flex-1 overflow-hidden px-2 py-2">
          <div className="h-full" style={{ columnCount: colunas, columnGap: '2rem' }}>
            {currentSlideData.map((group, gIdx) => {
              const style = getCategoryStyle(group.nome, !!group.isOferta);
              return (
                <div key={`${group.nome}-${gIdx}`} className="mb-6 break-inside-avoid-page">
                  {/* Category header */}
                  <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${style.bg} border ${style.border} mb-3.5 break-inside-avoid shadow-sm ${style.isPulse ? 'animate-pulse ring-4 ring-red-500/30 scale-[1.02] shadow-red-500/20' : ''}`}>
                    <span className="text-2xl flex items-center shrink-0">{style.icon}</span>
                    <h2 className="font-black uppercase tracking-wider text-base truncate text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                      {group.nome}
                    </h2>
                    <span className="font-bold uppercase tracking-widest text-white opacity-60 ml-auto text-[10px] shrink-0">
                      {group.produtos.length} {group.produtos.length === 1 ? 'item' : 'itens'}
                    </span>
                  </div>

                  {/* Products list */}
                  <div className="space-y-1.5">
                    {group.produtos.map((produto: ProdutoToledo, idx: number) => {
                      const cleanName = produto.descricao.replace(/\*|OFERTA/gi, '').trim();
                      const priceText = formatPreco(produto.preco);
                      return (
                        <div
                          key={produto.plu}
                          className={`flex items-center justify-between px-5 py-3 rounded-lg transition-colors break-inside-avoid ${
                            produto.preco === 0
                              ? 'bg-white/[0.02] border border-white/5 opacity-50'
                              : group.isOferta
                              ? 'bg-gradient-to-r from-red-500/20 to-orange-500/10 border border-red-500/30 shadow-lg'
                              : (idx % 2 === 0 ? 'bg-white/[0.04]' : 'bg-white/[0.08]')
                          }`}
                        >
                          <div className="flex-1 pr-4">
                            <span 
                              className={`font-bold leading-tight tracking-wide block ${
                                produto.preco === 0 ? 'text-white/40' : group.isOferta ? 'text-red-100' : 'text-white'
                              } line-clamp-2`}
                              style={getProductNameStyle(produto.descricao, isAutoDesc, config.toledo_fonte_descricao ?? undefined)}
                            >
                              {cleanName}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 shrink-0">
                            {produto.preco === 0 ? (
                              <span className="text-gray-400 font-extrabold tracking-tight drop-shadow-sm uppercase text-sm">
                                PRODUTO EM FALTA 🥲
                              </span>
                            ) : (
                              <>
                                <span 
                                  className={`${group.isOferta ? 'text-red-400' : accentClass} font-black tracking-tighter drop-shadow-sm`}
                                  style={getPriceStyle(priceText, isAutoPrice, config.toledo_fonte_preco ?? undefined)}
                                >
                                  {priceText}
                                </span>
                                <span className={`${group.isOferta ? 'text-red-400' : accentClass} opacity-60 font-bold uppercase text-xs`}>
                                  /{produto.unidade || 'kg'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 mx-2 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        <div className="shrink-0 px-2 py-3 flex items-center justify-between">
          <p className="text-white/20 text-xs font-bold uppercase tracking-[0.2em]">
            Preços sujeitos a alteração sem aviso prévio
          </p>
          <p className="text-white/20 text-xs font-bold uppercase tracking-[0.2em]">
            {error ? '⚠️ Usando dados offline' : `Atualizado em ${currentTime.toLocaleDateString('pt-BR')} às ${currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>

        {!lowPerformanceMode && (
          <div className="shrink-0 h-1 bg-white/5">
            <div
              className={`h-full bg-gradient-to-r ${glowClass.split(' shadow')[0]}`}
              style={{ animation: `slideProgress ${duracao}s linear forwards` }}
              key={`progress-${currentSlide}`}
            />
          </div>
        )}

        <style>{`
          @keyframes slideProgress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    </div>
  );
}
