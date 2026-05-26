import { useState, useEffect } from 'react';
import { getApiUrl } from '../shared/apiConfig';

interface EncarteProps {
  duracao: number;
  itensPorSlide: number;
  onComplete: () => void;
  config: any;
  categoriasFiltro?: string[];
}

export default function EncartePrecos({ duracao, itensPorSlide, onComplete, config, categoriasFiltro }: EncarteProps) {
  const [slides, setSlides] = useState<any[][]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const API_URL = getApiUrl();

  const filterKey = JSON.stringify(categoriasFiltro);

  useEffect(() => {
    fetch(`${API_URL}/api/toledo/produtos`)
      .then(r => r.json())
      .then(data => {
        // Filter out items with price = 0 if configured to do so
        const ocultarEmFalta = config.toledo_ocultar_em_falta === '1' || config.toledo_ocultar_em_falta === true;
        let filteredData = ocultarEmFalta ? data.filter((p: any) => p.preco > 0) : data;

        // Apply category filter if provided
        if (categoriasFiltro && categoriasFiltro.length > 0) {
          filteredData = filteredData.filter((p: any) => {
            const productCat = (p.categoria || '').trim().toLowerCase();
            return categoriasFiltro.some(filterCat => {
              const fCat = filterCat.trim().toLowerCase();
              return productCat === fCat || productCat.includes(fCat) || fCat.includes(productCat);
            });
          });
        }

        // Group by category
        const grouped = filteredData.reduce((acc: any, p: any) => {
          const cat = p.categoria || 'Outros';
          if (!acc[cat]) acc[cat] = { nome: cat, produtos: [] };
          acc[cat].produtos.push(p);
          return acc;
        }, {});

        let sortedGroups = Object.values(grouped).sort((a: any, b: any) => a.nome.localeCompare(b.nome));

        // FEATURE: Super Ofertas
        const ofertas: any[] = [];
        const nonOfertas: any[] = [];

        sortedGroups.forEach((group: any) => {
          const norm = group.produtos.filter((p: any) => !p.descricao.includes('OFERTA') && !p.descricao.includes('*'));
          const ofs = group.produtos.filter((p: any) => p.descricao.includes('OFERTA') || p.descricao.includes('*'));

          if (ofs.length > 0) ofertas.push(...ofs);
          if (norm.length > 0) nonOfertas.push({ ...group, produtos: norm });
        });

        if (ofertas.length > 0) {
          nonOfertas.unshift({ nome: 'OFERTAS DO DIA', isOferta: true, produtos: ofertas });
        }

        // Chunk into slides
        const newSlides = [];
        let currentSlideData: any[] = [];
        let currentCount = 0;

        for (const group of nonOfertas) {
          let gCount = group.produtos.length;
          if (currentCount + gCount <= itensPorSlide && gCount > 0) {
            currentSlideData.push(group);
            currentCount += gCount;
          } else if (gCount > 0) {
            if (currentCount > 0) {
              newSlides.push(currentSlideData);
              currentSlideData = [];
              currentCount = 0;
            }
            let chunks = [];
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
        setSlides(newSlides);
      })
      .catch(console.error);
  }, [API_URL, itensPorSlide, config.toledo_ocultar_em_falta, filterKey]);

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
    if (isOferta) return { icon: '🔥', bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', isPulse: true };
    
    // Normalização de string para evitar problemas com acentos e capitalização
    const n = (nome || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    // 1. Queijos e Laticínios
    if (n === 'queijos e laticinios' || n.includes('queijo') || n.includes('laticinio')) 
      return { icon: '🧀', bg: 'bg-blue-300/10', border: 'border-blue-300/20', text: 'text-blue-200' };
    
    // 2. Embutidos, Frios e Carnes
    if (n === 'embutidos, frios e carnes' || n.includes('embutido') || n.includes('frio') || n.includes('carne')) 
      return { icon: '🥩', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' };
    
    // 3. Peixes e Frutos do Mar
    if (n === 'peixes e frutos do mar' || n.includes('peixe') || n.includes('mar')) 
      return { icon: '🐟', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' };
    
    // 4. Oleaginosas e Castanhas
    if (n === 'oleaginosas e castanhas' || n.includes('oleaginosa') || n.includes('castanha')) 
      return { icon: '🥜', bg: 'bg-amber-600/10', border: 'border-amber-600/20', text: 'text-amber-500' };
    
    // 5. Frutas Secas e Desidratadas
    if (n === 'frutas secas e desidratadas' || n.includes('fruta seca') || n.includes('desidratada')) 
      return { icon: '🍇', bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' };
    
    // 6. Farinhas, Amidos e Polvilhos
    if (n === 'farinhas, amidos e polvilhos' || n.includes('farinha') || n.includes('amido') || n.includes('polvilho')) 
      return { icon: '🌾', bg: 'bg-orange-400/10', border: 'border-orange-400/20', text: 'text-orange-300' };
    
    // 7. Grãos, Cereais e Sementes
    if (n === 'graos, cereais e sementes' || n.includes('grao') || n.includes('cereal') || n.includes('semente')) 
      return { icon: '🌱', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' };
    
    // 8. Temperos, Especiarias e Conservas
    if (n === 'temperos, especiarias e conservas' || n.includes('tempero') || n.includes('especiaria') || n.includes('conserva')) 
      return { icon: '🌿', bg: 'bg-teal-400/10', border: 'border-teal-400/20', text: 'text-teal-300' };
    
    // 9. Suplementos, Chás e Produtos Naturais
    if (n === 'suplementos, chas e produtos naturais' || n.includes('suplemento') || n.includes('cha') || n.includes('produto natural')) 
      return { icon: '🍵', bg: 'bg-sky-400/10', border: 'border-sky-400/20', text: 'text-sky-300' };
    
    // Default
    return { icon: '📦', bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/80' };
  };

  const formatPreco = (preco: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco / 100);
  };

  const colunas = config.toledo_encarte_colunas || 3;
  const currentSlideData = slides[currentSlide] || [];
  const totalSlides = slides.length || 1;

  // ── Theme resolution: toledo_encarte_tema → toledo_tema → 'padrao' ──
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

  // CSS custom properties for proportional scaling
  const descFont = config.toledo_fonte_descricao || '1.25rem';
  const priceFont = config.toledo_fonte_preco || '1.75rem';
  const cssVars = {
    '--desc-font': descFont,
    '--price-font': priceFont,
  } as React.CSSProperties;

  // To fix tailwind dynamic class issue with accentBgClass split
  const accentColor = accentBgClass.split('-')[1];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden animate-fade-in" style={{ background: bgGradient, ...cssVars }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-2 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div className={`absolute inset-0 ${accentBgClass}/30 rounded-full blur-xl animate-pulse`}></div>
            <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${glowClass} flex items-center justify-center shadow-lg overflow-hidden`}>
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

      {/* ── Products Grid ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden px-2 py-2">
        <div className="h-full" style={{ columnCount: colunas, columnGap: '2rem' }}>
          {currentSlideData.map((group, gIdx) => {
            const style = getCategoryStyle(group.nome, group.isOferta);
            return (
              <div key={`${group.nome}-${gIdx}`} className="mb-6 break-inside-avoid-page">
                {/* Category header */}
                <div className={`flex items-center gap-4 px-6 py-3 rounded-xl ${style.bg} border ${style.border} mb-3 break-inside-avoid shadow-sm ${style.isPulse ? 'animate-pulse ring-4 ring-red-500/30 scale-[1.02] shadow-red-500/20' : ''}`}>
                  <span style={{ fontSize: 'clamp(1.5rem, calc(var(--desc-font) * 1.8), 5rem)' }}>{style.icon}</span>
                  <h2 className={`font-black uppercase tracking-wider ${style.text}`} style={{ fontSize: 'clamp(1.25rem, calc(var(--desc-font) * 1.15), 5rem)' }}>
                    {group.nome}
                  </h2>
                  <span className={`font-bold uppercase tracking-widest ${style.text} opacity-60 ml-auto`} style={{ fontSize: 'clamp(0.7rem, calc(var(--desc-font) * 0.6), 2.5rem)' }}>
                    {group.produtos.length} {group.produtos.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                {/* Products list */}
                <div className="space-y-1.5">
                  {group.produtos.map((produto: any, idx: number) => (
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
                      <div className={`flex-1 pr-4 ${config.toledo_fonte_descricao === 'auto' ? '@container' : ''}`}>
                        <span className={`font-bold leading-tight tracking-wide block ${
                          produto.preco === 0 ? 'text-white/40' : group.isOferta ? 'text-red-100' : 'text-white'
                        } ${config.toledo_fonte_descricao === 'auto' ? '' : 'line-clamp-2'}`} style={{ 
                          fontSize: config.toledo_fonte_descricao === 'auto' 
                            ? `clamp(0.85rem, calc(300cqi / ${Math.max(12, produto.descricao.length)}), 2.5rem)` 
                            : config.toledo_fonte_descricao || '1.25rem' 
                        }}>
                          {produto.descricao.replace(/\*|OFERTA/gi, '').trim()}
                        </span>
                      </div>
                      <div className={`flex items-baseline gap-1 shrink-0 ${config.toledo_fonte_preco === 'auto' ? '@container' : ''}`}>
                        {produto.preco === 0 ? (
                          <span className="text-gray-400 font-extrabold tracking-tight drop-shadow-sm uppercase" style={{ fontSize: 'clamp(0.8rem, calc(var(--price-font) * 0.55), 2.5rem)' }}>
                            PRODUTO EM FALTA 🥲
                          </span>
                        ) : (
                          <>
                            <span className={`${group.isOferta ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]' : accentClass} font-black tracking-tighter drop-shadow-sm`} style={{ 
                                fontSize: config.toledo_fonte_preco === 'auto' 
                                  ? `clamp(1rem, calc(150cqi / ${Math.max(5, formatPreco(produto.preco).length)}), 4rem)`
                                  : 'var(--price-font)' 
                            }}>
                              {formatPreco(produto.preco)}
                            </span>
                            <span className={`${group.isOferta ? 'text-red-400' : accentClass} opacity-60 font-bold uppercase`} style={{ fontSize: 'clamp(0.7rem, calc(var(--price-font) * 0.3), 3rem)' }}>/kg</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
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
          Atualizado em {currentTime.toLocaleDateString('pt-BR')} às {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="shrink-0 h-1 bg-white/5">
        <div
          className={`h-full bg-gradient-to-r ${glowClass.split(' shadow')[0]}`}
          style={{ animation: `slideProgress ${duracao}s linear forwards` }}
          key={`progress-${currentSlide}`}
        />
      </div>

      <style>{`
        @keyframes slideProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
