import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../shared/apiConfig';

interface EncarteGranelProps {
  duracao: number;
  itensPorSlide: number;
  onComplete: () => void;
  config: any;
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

// ── Category icon/label map ──────────────────────────────────────────────────
function getCategoryMeta(name: string) {
  const n = name.toLowerCase();
  if (n.match(/grão|grao|cereal|arroz|feijão|feijao|aveia|lentilha/))
    return { icon: '🌾', label: 'Energia · Fibras Naturais', tag: 'granel' };
  if (n.match(/fruta|desidratada|cristalizada|uva|damasco|banana/))
    return { icon: '🍇', label: 'Secas · Cristalizadas', tag: 'desidratada' };
  if (n.match(/especiaria|tempero|pimenta|canela|cravo|cominho/))
    return { icon: '🌿', label: 'Temperos · Aromas Naturais', tag: 'especiaria' };
  if (n.match(/oleaginosa|castanha|nozes|amêndoa|amendoim|pistache/))
    return { icon: '🥜', label: 'Oleaginosas · Proteínas', tag: 'granel' };
  if (n.match(/farinha|polvilho|amido|fubá|trigo/))
    return { icon: '🫘', label: 'Farináceos · Base Culinária', tag: 'granel' };
  if (n.match(/doce|bala|confeito|chocolate|goma/))
    return { icon: '🍬', label: 'Doces · Confeitos', tag: 'granel' };
  if (n.match(/chá|erva|mate|hibisco|camomila/))
    return { icon: '🍵', label: 'Chás · Infusões Naturais', tag: 'granel' };
  if (n.match(/semente|linhaça|chia|gergelim|girassol/))
    return { icon: '🌻', label: 'Sementes · Superfoods', tag: 'granel' };
  if (n.match(/açougue|acougue|carne|bovina|suína|suina|frango/))
    return { icon: '🥩', label: 'Cortes · Carnes Frescas', tag: 'granel' };
  if (n.match(/frio|embutido|presunto|mortadela|salame/))
    return { icon: '🧀', label: 'Frios · Embutidos', tag: 'granel' };
  if (n.match(/laticínio|laticinio|leite|queijo|manteiga/))
    return { icon: '🥛', label: 'Laticínios · Derivados', tag: 'granel' };
  if (n.match(/horti|fruta|verdura|legume/))
    return { icon: '🍎', label: 'Hortifruti · Naturais', tag: 'granel' };
  if (n.match(/peix|frutos do mar/))
    return { icon: '🐟', label: 'Peixaria · Frutos do Mar', tag: 'granel' };
  if (n.match(/padaria|pão|pao|bolo|confeitaria/))
    return { icon: '🥖', label: 'Padaria · Confeitaria', tag: 'granel' };
  if (n.match(/bebida|suco|cerveja|refrigerante|vinho/))
    return { icon: '🥤', label: 'Bebidas · Líquidos', tag: 'granel' };
  if (n.match(/limpeza|higiene|perfumaria/))
    return { icon: '🧼', label: 'Limpeza · Higiene', tag: 'granel' };
  if (n.match(/congelado|sorvete|pizza/))
    return { icon: '🧊', label: 'Congelados · Práticos', tag: 'granel' };
  if (n.match(/pet|ração|racao/))
    return { icon: '🐕', label: 'Pet Shop · Animais', tag: 'granel' };
  return { icon: '🛒', label: 'Produtos Variados', tag: 'granel' };
}

function getProductIcon(desc: string) {
  const d = desc.toLowerCase();

  // ── Carnes / Açougue ──
  if (d.match(/picanha|alcatra|maminha|contra.?fil|fil.?mignon|patinho|coxão|lagarto|acém|acem/)) return '🥩';
  if (d.match(/costela|t.?bone|baby.?beef|bife|chuleta/)) return '🥩';
  if (d.match(/carne\s|carne$|bovina|bovino|gado|boi\b/)) return '🥩';
  if (d.match(/suíno|suino|porco|lombo|pernil|panceta|bacon|toucinho|leitão|leitao/)) return '🐷';
  if (d.match(/frango|peito de frango|coxa|sobrecoxa|asa\b|filé de frango|file de frango|chester/)) return '🍗';
  if (d.match(/linguiça|linguica|calabresa|paio|chouriço|chourico/)) return '🌭';
  if (d.match(/salsicha|hot.?dog|frank/)) return '🌭';
  if (d.match(/hambúrguer|hamburguer|burger/)) return '🍔';
  if (d.match(/charque|carne.?seca|jerked|jabá|jaba/)) return '🥩';
  if (d.match(/moída|moida|ground|tripa|bucho|dobradinha|rabada|rabo/)) return '🥩';
  if (d.match(/cordeiro|cabrito|carneiro|ovelha/)) return '🐑';

  // ── Frios / Embutidos ──
  if (d.match(/salame|salami|copa|capicola|capocollo|mortadela|presunt/)) return '🥓';
  if (d.match(/peito de peru|blanquet|apresuntado|rosbife/)) return '🥓';
  if (d.match(/lombo\s|lombo$|defumad/)) return '🥓';
  if (d.match(/embutido|fatiado|frios/)) return '🥓';

  // ── Peixes / Frutos do Mar ──
  if (d.match(/salmão|salmao|tilápia|tilapia|bacalhau|merluza|pescada|sardinha|atum/)) return '🐟';
  if (d.match(/peixe|filé de peixe|file de peixe|robalo|dourado|pintado|tambaqui/)) return '🐟';
  if (d.match(/camarão|camarao|lagosta|lula|polvo|mexilhão|mexilhao|ostra|marisco/)) return '🦐';

  // ── Queijos / Laticínios ──
  if (d.match(/queijo|mussarela|muçarela|parmesão|parmesao|provolone|gorgonzola|brie|camembert/)) return '🧀';
  if (d.match(/ricota|cottage|coalho|minas|cheddar|gruyere|emmental|gouda/)) return '🧀';
  if (d.match(/requeijão|requeijao|cream.?cheese/)) return '🧀';
  if (d.match(/manteiga|margarina/)) return '🧈';
  if (d.match(/leite\b|iogurte|coalhada|nata|creme de leite/)) return '🥛';
  if (d.match(/ovo\b|ovos\b/)) return '🥚';

  // ── Frutas (frescas e secas) ──
  if (d.match(/ameixa/)) return '🫐';
  if (d.match(/uva\b|passa/)) return '🍇';
  if (d.match(/banana/)) return '🍌';
  if (d.match(/maçã|maca|apple/)) return '🍎';
  if (d.match(/laranja|tangerina|mexerica|bergamota/)) return '🍊';
  if (d.match(/limão|limao|lima/)) return '🍋';
  if (d.match(/manga\b/)) return '🥭';
  if (d.match(/abacaxi|ananás|ananas/)) return '🍍';
  if (d.match(/morango|framboesa|blueberry|mirtilo/)) return '🍓';
  if (d.match(/melão|melao|melancia/)) return '🍈';
  if (d.match(/pêssego|pessego|nectarina/)) return '🍑';
  if (d.match(/caqui|figo/)) return '🍑';
  if (d.match(/mamão|mamao|papaia|papaya/)) return '🍈';
  if (d.match(/goiaba|pitanga|acerola|jabuticaba/)) return '🍒';
  if (d.match(/abacate/)) return '🥑';
  if (d.match(/kiwi/)) return '🥝';
  if (d.match(/coco\b/)) return '🥥';
  if (d.match(/pera\b|pêra/)) return '🍐';
  if (d.match(/damasco|apricot/)) return '🍑';
  if (d.match(/fruta\s|mix|nuts|nut|frutas/)) return '🥜';
  if (d.match(/desidratad|cristaliz/)) return '🍇';
  if (d.match(/cranberr/)) return '🍒';
  if (d.match(/tâmara|tamara/)) return '🌴';

  // ── Oleaginosas / Castanhas ──
  if (d.match(/castanha|castanhas/)) return '🌰';
  if (d.match(/nozes|noz\b|walnut/)) return '🌰';
  if (d.match(/amêndoa|amendoa|almond/)) return '🌰';
  if (d.match(/amendoim|peanut/)) return '🥜';
  if (d.match(/pistache|pistachio/)) return '🥜';
  if (d.match(/macadâmia|macadamia|pecã|pecan|avelã|avela/)) return '🌰';

  // ── Grãos / Cereais ──
  if (d.match(/arroz/)) return '🍚';
  if (d.match(/feijão|feijao|feijoada/)) return '🫘';
  if (d.match(/aveia/)) return '🥣';
  if (d.match(/granola/)) return '🥣';
  if (d.match(/lentilha|grão de bico|grao de bico|ervilha|soja/)) return '🫛';
  if (d.match(/milho|fubá|fuba|canjica|pipoca|quirera/)) return '🌽';
  if (d.match(/quinoa|quinua|centeio|cevada|painço|painco/)) return '🌾';
  if (d.match(/trigo|triguilho|bulgur/)) return '🌾';
  if (d.match(/semente|gergelim|linhaça|linhaca|chia|girassol|abóbora/)) return '🌻';

  // ── Farinhas / Amidos ──
  if (d.match(/farinha|polvilho|amido|fécula|fecula|tapioca/)) return '🌾';
  if (d.match(/flocão|flocao|flocos/)) return '🌾';

  // ── Temperos / Especiarias ──
  if (d.match(/pimenta/)) return '🌶️';
  if (d.match(/cominho|canela|cravo|cúrcuma|curcuma|curry|noz.?moscada/)) return '🌿';
  if (d.match(/orégano|oregano|manjericão|manjericao|alecrim|tomilho|sálvia|salvia/)) return '🌿';
  if (d.match(/páprica|paprica|louro|gengibre|açafrão|acafrao|erva.?doce/)) return '🌿';
  if (d.match(/tempero|condimento|chimichurri|mostarda em grão/)) return '🌿';
  if (d.match(/sal\b|sal\s/)) return '🧂';

  // ── Doces / Confeitos ──
  if (d.match(/chocolate|cacau|achocolatado/)) return '🍫';
  if (d.match(/bala|jujuba|gominha|goma|confeito|drageado/)) return '🍬';
  if (d.match(/açúcar|açucar|rapadura|mascavo|demerara|cristal/)) return '🍯';
  if (d.match(/mel\b|melado|geleia|geléia/)) return '🍯';
  if (d.match(/biscoito|cookie|bolacha/)) return '🍪';
  if (d.match(/bolo|torta|brownie|cupcake/)) return '🍰';
  if (d.match(/paçoca|pacoca|pé de moleque|pe de moleque/)) return '🍬';

  // ── Bebidas ──
  if (d.match(/café|cafe|cappuccino|espresso/)) return '☕';
  if (d.match(/chá|cha\b|erva\s|mate\b|hibisco|camomila|cidreira|boldo/)) return '🍵';
  if (d.match(/suco|néctar|nectar|refresco/)) return '🧃';
  if (d.match(/cerveja|chopp|chope/)) return '🍺';
  if (d.match(/vinho|espumante|champagne/)) return '🍷';
  if (d.match(/whisky|whiskey|vodka|gin|rum|tequila|cachaça|cachaca/)) return '🥃';
  if (d.match(/água|agua|mineral/)) return '💧';
  if (d.match(/refrigerante|coca|guaraná|guarana|sprite|fanta/)) return '🥤';

  // ── Padaria ──
  if (d.match(/pão|pao|baguete|ciabatta|brioche|bisnaga/)) return '🍞';
  if (d.match(/croissant|sonho|rosca/)) return '🥐';

  // ── Massas ──
  if (d.match(/macarrão|macarrao|espaguete|penne|fusilli|lasanha|massa\b|nhoque/)) return '🍝';

  // ── Congelados ──
  if (d.match(/sorvete|picolé|picole|gelato/)) return '🍦';
  if (d.match(/pizza|esfiha|empada|coxinha|pastel/)) return '🍕';
  if (d.match(/congelad|nugget|steak/)) return '🧊';

  // ── Limpeza / Higiene ──
  if (d.match(/sabão|sabao|detergente|desinfetante|amaciante|alvejante/)) return '🧴';
  if (d.match(/papel\s|papel$|guardanapo|toalha/)) return '🧻';
  if (d.match(/shampoo|condicionador|sabonete|creme dental|escova/)) return '🧴';

  // ── Pet ──
  if (d.match(/ração|racao|petisco|pet|cachorro|gato\b/)) return '🐕';

  // ── Conservas / Enlatados ──
  if (d.match(/azeitona|palmito|milho verde|ervilha|conserva/)) return '🫒';
  if (d.match(/extrato|molho|catchup|ketchup|maionese|mostarda/)) return '🥫';

  // ── Azeites / Óleos ──
  if (d.match(/azeite|óleo|oleo|vinagre/)) return '🫒';

  // ── Hortifruti / Verduras ──
  if (d.match(/alface|rúcula|rucula|espinafre|couve|agrião|agriao|repolho/)) return '🥬';
  if (d.match(/tomate/)) return '🍅';
  if (d.match(/cenoura|beterraba|batata|mandioca|inhame|cará|cara\b/)) return '🥕';
  if (d.match(/cebola|alho\b/)) return '🧅';
  if (d.match(/pimentão|pimentao|abobrinha|berinjela|pepino|jiló|jilo|quiabo/)) return '🫑';
  if (d.match(/brócolis|brocolis|couve.?flor/)) return '🥦';
  if (d.match(/cogumelo|champignon|shitake|shiitake/)) return '🍄';

  // ── Fallback: usar ícone da categoria ──
  return '🏷️';
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function EncarteGranel({ duracao, itensPorSlide, onComplete, config }: EncarteGranelProps) {
  const [categorySlides, setCategorySlides] = useState<any[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const API_URL = getApiUrl();
  const colunas = parseInt(config?.toledo_encarte_colunas || '4', 10);
  const itemsLimit = itensPorSlide || (colunas * 2); // Default to 2 rows based on columns if not set

  // ── Fetch products and build slides ──────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/toledo/produtos`)
      .then(r => r.json())
      .then((data: any[]) => {
        setAllProducts(data);

        // Group by category
        const groups: Record<string, any[]> = {};
        data.forEach(p => {
          const cat = p.categoria || 'Outros';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(p);
        });

        // Build slides: each slide = one chunk of a category
        const slides: any[] = [];
        const sortedCats = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        for (const catName of sortedCats) {
          const items = groups[catName].sort((a: any, b: any) => a.descricao.localeCompare(b.descricao));
          const meta = getCategoryMeta(catName);

          for (let i = 0; i < items.length; i += itemsLimit) {
            slides.push({
              category: catName,
              ...meta,
              items: items.slice(i, i + itemsLimit),
              totalItems: items.length,
            });
          }
        }

        if (slides.length === 0) slides.push({ category: 'Vazio', icon: '📦', label: '', tag: 'granel', items: [], totalItems: 0 });
        setCategorySlides(slides);
      })
      .catch(console.error);
  }, [API_URL]);

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

  return (
    <div className="h-full w-full flex flex-col" style={{ background: COLORS.bg, fontFamily: 'Barlow, Inter, sans-serif', overflow: 'hidden' }}>

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
        padding: '10px 28px 6px', display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1.5px solid rgba(0,0,0,0.07)', flexShrink: 0, background: COLORS.paper
      }}>
        {/* Pill */}
        <span style={{
          background: COLORS.forest, color: '#fff', fontSize: 10, fontWeight: 700,
          letterSpacing: 3, padding: '5px 12px', borderRadius: 4, textTransform: 'uppercase'
        }}>Categoria</span>
        {/* Icon */}
        <span style={{ fontSize: 28 }}>{slide.icon}</span>
        {/* Name */}
        <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 800, fontSize: 30, color: COLORS.forest }}>
          {slide.category}
        </span>
        {/* Spacer + subtitle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.muted }}>{slide.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.muted, marginLeft: 12, opacity: 0.7 }}>
              {slide.totalItems} {slide.totalItems === 1 ? 'item' : 'itens'}
            </span>
          </div>
          {/* Counter Overlay */}
          <div style={{
            background: 'rgba(0,0,0,0.04)', padding: '6px 14px', borderRadius: 20,
            fontSize: 14, fontWeight: 700, color: COLORS.forest, letterSpacing: 1
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
            const stripe = STRIPE_COLORS[idx % 4];
            const pIcon = getProductIcon(p.descricao);
            const isOferta = p.descricao.includes('OFERTA') || p.descricao.includes('*');
            const cleanName = p.descricao.replace(/\* OFERTA \*/g, '').replace(/OFERTA/gi, '').replace(/\*/g, '').trim();
            const tag = slide.tag || 'granel';

            return (
              <div
                key={p.plu}
                className="encarte-granel-card"
                style={{
                  height: 62, background: COLORS.paper,
                  border: `1px solid rgba(0,0,0,0.07)`, borderRadius: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex', overflow: 'hidden', position: 'relative',
                  animationDelay: `${idx * 45}ms`,
                }}
              >
                {/* Stripe */}
                <div style={{ width: 4, background: isOferta ? '#e53e3e' : stripe, flexShrink: 0 }} />
                {/* Icon area */}
                <div style={{
                  width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: COLORS.bg, borderRight: '1px solid rgba(0,0,0,0.07)', flexShrink: 0
                }}>
                  <span style={{ fontSize: 22 }}>{pIcon}</span>
                </div>
                {/* Body */}
                <div style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: 1.1,
                    color: COLORS.text, textTransform: 'uppercase',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {cleanName}
                  </span>
                  {isOferta && (
                    <span style={{
                      display: 'inline-block', width: 'fit-content', marginTop: 2,
                      fontSize: 9, fontWeight: 700, background: '#fef2f2', color: '#dc2626',
                      padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: 1
                    }}>🔥 Oferta</span>
                  )}
                </div>
                {/* Price */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
                  padding: '0 14px', flexShrink: 0
                }}>
                  <div>
                    <sup style={{ fontWeight: 800, fontSize: 16, color: isOferta ? '#dc2626' : COLORS.amber, top: '-0.3em' }}>R$</sup>
                    <span style={{
                      fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 36, lineHeight: 1,
                      color: isOferta ? '#dc2626' : COLORS.amber
                    }}>{formatPreco(p.preco)}</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: COLORS.muted, textTransform: 'uppercase' }}>por kg</span>
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
  );
}
