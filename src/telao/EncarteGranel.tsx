import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../shared/apiConfig';

interface EncarteGranelProps {
  duracao: number;
  itensPorSlide: number;
  onComplete: () => void;
  config: any;
  categoriasFiltro?: string[];
}

// ── Paleta ────────────────────────────────────────────────────────────────────
const COLORS = {
  forest:    '#1b3d28',
  forestMid: '#2c5f3e',
  green:     '#3d8c56',
  greenLt:   '#e8f3ec',
  amber:     '#b85e0a',
  amberLt:   '#fff3e8',
  gold:      '#d4a017',
  goldLt:    '#f5c842',
  bg:        '#f6f3ee',
  paper:     '#fffefb',
  text:      '#1a1a18',
  muted:     '#7a7a74',
};

const STRIPE_COLORS = [COLORS.green, COLORS.amber, COLORS.gold, COLORS.forest];

// Toledo dynamic category mappings are now queried directly from SQLite database.

// ═══════════════════════════════════════════════════════════════════════════════
export default function EncarteGranel({ duracao, itensPorSlide, onComplete, config, categoriasFiltro }: EncarteGranelProps) {
  const [categorySlides, setCategorySlides] = useState<any[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [temaDinamico, setTemaDinamico] = useState<any>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const API_URL = getApiUrl();
  const colunas = parseInt(config?.toledo_encarte_colunas || '4', 10);
  const itemsLimit = itensPorSlide || (colunas * 2); // Default to 2 rows based on columns if not set

  const filterKey = JSON.stringify(categoriasFiltro);

  // ── Fetch products and dynamic categories from SQLite ────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/toledo/produtos`).then(r => r.json()),
      fetch(`${API_URL}/api/categorias`).then(r => r.json()),
      fetch(`${API_URL}/api/telao/tema-atual`).then(r => r.json().catch(() => null))
    ]).then(([prodData, catData, temaData]) => {
      setTemaDinamico(temaData);
      const activeCats = catData.filter((c: any) => c.ativo);
      const catMap = new Map<string, any>();
      activeCats.forEach((c: any) => {
        catMap.set(c.nome.trim().toLowerCase(), c);
      });

      const ocultarEmFalta = config?.toledo_ocultar_em_falta === '1' || config?.toledo_ocultar_em_falta === true;
      let filteredData = ocultarEmFalta ? prodData.filter((p: any) => p.preco > 0) : prodData;

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
      const groups: Record<string, any[]> = {};
      filteredData.forEach((p: any) => {
        const cat = p.categoria || 'Despensa e Utilidades Básicas';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
      });

      // Build slides: each slide = one chunk of a category
      const slides: any[] = [];
      const sortedCats = Object.keys(groups).sort((a, b) => {
        const catA = catMap.get(a.trim().toLowerCase());
        const catB = catMap.get(b.trim().toLowerCase());
        const orderA = catA ? catA.ordem : 999;
        const orderB = catB ? catB.ordem : 999;
        return orderA - orderB;
      });

      for (const catName of sortedCats) {
        const items = groups[catName].sort((a: any, b: any) => a.descricao.localeCompare(b.descricao));
        const dbCat = catMap.get(catName.trim().toLowerCase()) || { emoji: '📦', descricao: '' };

        for (let i = 0; i < items.length; i += itemsLimit) {
          slides.push({
            category: catName,
            icon: dbCat.emoji || '📦',
            label: dbCat.descricao || '',
            items: items.slice(i, i + itemsLimit),
            totalItems: items.length,
          });
        }
      }

      if (slides.length === 0) slides.push({ category: 'Vazio', icon: '📦', label: '', tag: 'granel', items: [], totalItems: 0 });
      setCategorySlides(slides);
    })
    .catch(console.error);
  }, [API_URL, itemsLimit, config?.toledo_ocultar_em_falta, filterKey]);

  // ── Auto-advance ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (categorySlides.length === 0) return;
    const timer = setInterval(() => {
      setCurrentSlide(prev => {
        const next = prev + 1;
        if (next >= categorySlides.length) {
          onComplete();
          return 0;
        }
        return next;
      });
      setAnimKey(k => k + 1);
    }, duracao * 1000);
    return () => clearInterval(timer);
  }, [categorySlides.length, duracao, onComplete]);

  // ── Current slide data ──────────────────────────────────────────────────────
  const slide = categorySlides[currentSlide] || { category: '', icon: '', label: '', tag: 'granel', items: [] };
  const totalSlides = categorySlides.length || 1;
  const storeName = config.nome_estabelecimento || 'Mercado';

  // ── Price formatter ─────────────────────────────────────────────────────────
  const formatPreco = (val: number) => {
    const reais = val / 100;
    return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // CSS custom properties for proportional scaling
  const descFont = config?.toledo_fonte_descricao || '1.25rem';
  const priceFont = config?.toledo_fonte_preco || '1.75rem';
  const cssVars = {
    '--desc-font': descFont,
    '--price-font': priceFont,
  } as React.CSSProperties;

  // Se houver um tema dinâmico ativo, sobrescreve o fundo
  let dynamicBgStyle = {};
  if (temaDinamico && temaDinamico.imagem_fundo) {
    dynamicBgStyle = {
      backgroundImage: `url(${API_URL}${temaDinamico.imagem_fundo})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  return (
    <div className="h-full w-full flex flex-col" style={{ background: temaDinamico?.imagem_fundo ? 'transparent' : COLORS.bg, fontFamily: 'Barlow, Inter, sans-serif', overflow: 'hidden', ...dynamicBgStyle, ...cssVars }}>
      {temaDinamico && <div className="absolute inset-0 bg-white/70 z-0 backdrop-blur-sm"></div>}
      
      <div className="relative z-10 flex flex-col h-full w-full overflow-hidden">
        {/* ══════════════ HEADER ══════════════ */}
        <div style={{ background: COLORS.forest, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Logo box */}
            <div style={{
              width: 48, height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid rgba(255,255,255,0.15)', flexShrink: 0
            }}>
              {config.logo_cliente ? (
                <img src={`${API_URL}${config.logo_cliente}`} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              ) : (
                <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 800, fontSize: 20, color: COLORS.goldLt }}>
                  {storeName.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 22, color: '#fff', lineHeight: 1.1 }}>
                {storeName}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500, letterSpacing: 1, marginTop: 2 }}>
                Produtos a Granel — <em style={{ fontFamily: 'Playfair Display, serif', color: COLORS.goldLt, fontStyle: 'italic' }}>Ofertas da Semana</em>
              </div>
            </div>
          </div>
        </div>
        {/* Gold strip */}
        <div style={{ height: 4, background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLt}, ${COLORS.gold})`, flexShrink: 0 }} />

        {/* ══════════════ CATEGORY HEADER ══════════════ */}
        <div style={{
          padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid rgba(0,0,0,0.05)', flexShrink: 0, background: 'rgba(255,255,255,0.8)'
        }}>
          {/* Pill */}
          <span style={{
            background: COLORS.forest, color: '#fff', fontWeight: 700,
            letterSpacing: 2, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' as const,
            fontSize: '10px',
          }}>Categoria</span>
          {/* Icon */}
          <span style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center' }}>{slide.icon}</span>
          {/* Name */}
          <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 800, color: COLORS.forest, fontSize: '1.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {slide.category}
          </span>
          {/* Spacer + subtitle */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: COLORS.muted }}>{slide.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.muted, marginLeft: 8, opacity: 0.7 }}>
                {slide.totalItems} {slide.totalItems === 1 ? 'item' : 'itens'}
              </span>
            </div>
            {/* Counter Overlay */}
            <div style={{
              background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 12,
              fontSize: 12, fontWeight: 700, color: COLORS.forest, letterSpacing: 1
            }}>
              {currentSlide + 1} / {totalSlides}
            </div>
          </div>
        </div>

        {/* ══════════════ PRODUCTS GRID ══════════════ */}
        <div style={{ flex: 1, padding: '6px 10px', overflow: 'hidden' }}>
          <div key={`grid-${animKey}`} style={{
            display: 'grid', gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: 6,
            height: '100%', alignContent: 'start'
          }}>
            {slide.items.map((p: any, idx: number) => {
              const isOferta = p.descricao.includes('OFERTA') || p.descricao.includes('*');
              const cleanName = p.descricao.replace(/\* OFERTA \*/g, '').replace(/OFERTA/gi, '').replace(/\*/g, '').trim();
              const stripe = STRIPE_COLORS[idx % STRIPE_COLORS.length];

              return (
                <div
                  key={p.plu}
                  className="encarte-granel-card"
                  style={{
                    minHeight: 'clamp(68px, calc(var(--price-font) * 1.4), 180px)',
                    height: 'auto',
                    background: p.preco === 0 ? 'rgba(0,0,0,0.02)' : COLORS.paper,
                    border: p.preco === 0 ? '1px dashed rgba(0,0,0,0.1)' : '1px solid rgba(0,0,0,0.07)', borderRadius: 8,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex', overflow: 'hidden', position: 'relative' as const,
                    animationDelay: `${idx * 45}ms`,
                    padding: '6px 0',
                    opacity: p.preco === 0 ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: 4, background: p.preco === 0 ? '#a1a1aa' : (isOferta ? '#e53e3e' : stripe), flexShrink: 0
                  }} />
                  {/* Body */}
                  <div style={{ flex: 1, padding: '4px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }} className={config?.toledo_fonte_descricao === 'auto' ? '@container' : ''}>
                    <span style={{
                      fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, 
                      fontSize: config?.toledo_fonte_descricao === 'auto'
                          ? `clamp(0.9rem, calc(280cqi / ${Math.max(12, cleanName.length)}), 3rem)`
                          : config?.toledo_fonte_descricao || '18px', 
                      lineHeight: 1.1,
                      color: p.preco === 0 ? '#9f9f9f' : COLORS.text, textTransform: 'uppercase',
                      display: config?.toledo_fonte_descricao === 'auto' ? 'block' : '-webkit-box', 
                      WebkitLineClamp: config?.toledo_fonte_descricao === 'auto' ? undefined : 2, 
                      WebkitBoxOrient: config?.toledo_fonte_descricao === 'auto' ? undefined : 'vertical', 
                      overflow: 'hidden',
                    }}>
                      {cleanName}
                    </span>
                    {isOferta && (
                      <span style={{
                        display: 'inline-block', width: 'fit-content', marginTop: 2,
                        fontSize: 'clamp(8px, calc(var(--desc-font) * 0.55), 28px)', fontWeight: 700, background: '#fef2f2', color: '#dc2626',
                        padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' as const, letterSpacing: 1
                      }}>🔥 Oferta</span>
                    )}
                  </div>
                  {/* Price */}
                  <div style={{
                    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', justifyContent: 'center',
                    padding: '0 14px', flexShrink: 0
                  }} className={config?.toledo_fonte_preco === 'auto' ? '@container' : ''}>
                    {p.preco === 0 ? (
                      <span style={{
                        fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800,
                        fontSize: 'clamp(0.7rem, calc(var(--price-font) * 0.45), 2.5rem)',
                        color: '#a1a1aa', textTransform: 'uppercase'
                      }}>
                        PRODUTO EM FALTA 🥲
                      </span>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline' }}>
                          <sup style={{ fontWeight: 800, color: isOferta ? '#dc2626' : COLORS.amber, marginRight: 2, position: 'relative' as const, top: '-0.3em', fontSize: 'clamp(0.5rem, calc(var(--price-font) * 0.35), 3rem)' }}>R$</sup>
                          <span style={{
                            fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, 
                            fontSize: config?.toledo_fonte_preco === 'auto'
                               ? `clamp(1rem, calc(180cqi / ${Math.max(5, formatPreco(p.preco).length)}), 4rem)`
                               : 'var(--price-font)', 
                            lineHeight: 1,
                            color: isOferta ? '#dc2626' : COLORS.amber
                          }}>{formatPreco(p.preco)}</span>
                        </div>
                        <span style={{ fontSize: 'clamp(8px, calc(var(--price-font) * 0.25), 28px)', fontWeight: 600, letterSpacing: 2, color: COLORS.muted, textTransform: 'uppercase' as const, marginTop: 2 }}>por kg</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════════════ OVERLAY PROGRESS BAR ══════════════ */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 6,
          background: 'rgba(0,0,0,0.05)', zIndex: 10
        }}>
          <div
            ref={progressRef}
            key={`progress-${currentSlide}`}
            style={{
              height: '100%',
              background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.goldLt})`,
              animation: `slideProgress ${duracao}s linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
