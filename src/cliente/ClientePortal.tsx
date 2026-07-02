import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import { gerarPDFLista } from '../shared/gerarPDF';
import { ShoppingCart, Search, FileText, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { playNotificationSound, preLoadCustomAudio } from '../shared/sounds';
import { Bell, Volume2 } from 'lucide-react';
import { fetchPortalSummary, fetchTicketStatus, fetchPortalProducts } from './portalApi';

interface Produto {
  id: number;
  plu?: string;
  descricao: string;
  preco: number;
  categoria: string;
}

interface ItemCarrinho {
  id: number;
  plu?: string;
  quantidade: number; // Gramas para peso (ex: 250), unidades para unidade (ex: 3)
  tipo: 'peso' | 'unidade';
}

// Category emojis are loaded dynamically from the SQLite database

function getTipoProduto(descricao: string): 'peso' | 'unidade' {
  const desc = descricao.toLowerCase();
  const termosUnidade = [' un', ' un.', 'pc', 'pct', 'unid', 'unidade', 'pacote', 'bandeja', 'un/'];
  return termosUnidade.some(t => desc.includes(t)) ? 'unidade' : 'peso';
}

export default function ClientePortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const ticketId = searchParams.get('ticket') || searchParams.get('senha_id');
  const API_URL = getApiUrl();

  const [categoriasInfo, setCategoriasInfo] = useState<any[]>([]);

  const emojisMap = useMemo(() => {
    const map: Record<string, string> = { 'Todos': '✨' };
    categoriasInfo.forEach((c: any) => {
      map[c.nome.trim()] = c.emoji || '';
    });
    return map;
  }, [categoriasInfo]);

  const getEmojiCategoria = (cat: string): string => {
    return emojisMap[cat.trim()] || '📦';
  };

  const [ticketStatus, setTicketStatus] = useState<'carregando' | 'aguardando' | 'expirado' | 'erro'>('carregando');
  const [ticketNumero, setTicketNumero] = useState<string>('');
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const ultimoAlertaPosicao = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // Inicializa a permissão de notificação se suportado
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Todos');
  const [config, setConfig] = useState<any>({});

  // Drawer Bottom Sheet State
  const [selectedProduct, setSelectedProduct] = useState<Produto | null>(null);
  const [drawerQuantidade, setDrawerQuantidade] = useState<number>(250);
  const [drawerInputManual, setDrawerInputManual] = useState<string>('250');

  // Impede rolagem da tela de fundo enquanto a gaveta do produto está aberta
  useEffect(() => {
    if (selectedProduct) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedProduct]);

  // Carrega configurações da loja
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (token) {
          const summary = await fetchPortalSummary(token);
          if (summary.ok) {
            setConfig({
              nome_estabelecimento: summary.store.name,
              logo_cliente: summary.store.theme.logo_url,
              primary_color: summary.store.theme.primary_color,
            });
          }
          return;
        }

        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          
          if (data.portal_som_prestes_chamar) preLoadCustomAudio(data.portal_som_prestes_chamar);
          if (data.portal_som_sua_vez) preLoadCustomAudio(data.portal_som_sua_vez);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações da loja', err);
      }
    };
    fetchConfig();
  }, [API_URL, token]);



  // Carrinho de pré-seleção: armazena objeto detalhado do produto
  const [carrinho, setCarrinho] = useState<Record<string, ItemCarrinho>>({});
  const [showCarrinho, setShowCarrinho] = useState(false);

  // Verifica status do ticket e fila (polling adaptativo)
  useEffect(() => {
    if (!ticketId) {
      setTicketStatus('erro');
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkStatus = async () => {
      try {
        if (token) {
          const data = await fetchTicketStatus(token, ticketId);
          if (!data.ok) throw new Error();

          setTicketNumero(data.ticket.senha_id || '');

          if (data.ticket.status === 'aguardando') {
            setTicketStatus('aguardando');
            
            if (data.ticket.position !== undefined && data.ticket.position !== null) {
              setQueuePosition(data.ticket.position);

              // Alerta sonoro: toca apenas quando a posição DIMINUI e está <= 3
              if (data.ticket.position <= 3 && (
                ultimoAlertaPosicao.current === null || 
                data.ticket.position < ultimoAlertaPosicao.current
              )) {
                ultimoAlertaPosicao.current = data.ticket.position;
                try {
                  playNotificationSound('chime', 80);
                } catch (e) {
                  // Silencioso se o navegador bloquear autoplay
                }
              }
            }
          } else {
            // Senha foi chamada — manter banner por 4 segundos antes de mudar status
            if (ticketStatus === 'aguardando' && queuePosition !== null && queuePosition <= 3) {
              try {
                playNotificationSound('bell', 80);
              } catch (e) {}

              setShowExpiringBanner(true);
              if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
              bannerTimeoutRef.current = setTimeout(() => {
                setShowExpiringBanner(false);
                setTicketStatus('expirado');
                // Limpa carrinho ao expirar
                localStorage.removeItem(`carrinho_${ticketId}`);
              }, 4000);
            } else {
              setTicketStatus('expirado');
              localStorage.removeItem(`carrinho_${ticketId}`);
            }
            setQueuePosition(null);
          }
          return;
        }

        const res = await fetch(`${API_URL}/api/senhas/${ticketId}/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();

        setTicketNumero(data.numero || '');

        if (data.aguardando) {
          setTicketStatus('aguardando');
          
          if (data.posicao !== undefined && data.posicao !== null) {
            setQueuePosition(data.posicao);

            // Alerta sonoro: toca apenas quando a posição DIMINUI e está <= 3
            if (data.posicao <= 3 && (
              ultimoAlertaPosicao.current === null || 
              data.posicao < ultimoAlertaPosicao.current
            )) {
              ultimoAlertaPosicao.current = data.posicao;
              try {
                if (config.portal_som_prestes_chamar) {
                  playNotificationSound('custom', 100, config.portal_som_prestes_chamar);
                } else {
                  const tipoSom = config.tipo_som || 'chime';
                  const volume = parseInt(config.volume_audio || '80');
                  const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
                  playNotificationSound(tipoSom as any, volume, customUrl);
                }
              } catch (e) {
                // Silencioso se o navegador bloquear autoplay
              }
              
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification('Sua senha está próxima!', {
                    body: data.posicao === 1 ? 'Prepare-se! Sua senha é a próxima a ser chamada!' : `Faltam apenas ${data.posicao} senhas na sua frente!`,
                    icon: config.logo_cliente ? `${API_URL}${config.logo_cliente}` : undefined
                  });
                } catch (e) { }
              }
            }
          }
        } else {
          // Senha foi chamada — manter banner por 4 segundos antes de mudar status
          if (ticketStatus === 'aguardando' && queuePosition !== null && queuePosition <= 3) {
            try {
              if (config.portal_som_sua_vez) {
                playNotificationSound('custom', 100, config.portal_som_sua_vez);
              } else {
                playNotificationSound('bell', 80);
              }
            } catch (e) {}

            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Sua vez chegou!', {
                  body: 'Dirija-se ao local de atendimento indicado.',
                  icon: config.logo_cliente ? `${API_URL}${config.logo_cliente}` : undefined
                });
              } catch (e) { }
            }
            setShowExpiringBanner(true);
            if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
            bannerTimeoutRef.current = setTimeout(() => {
              setShowExpiringBanner(false);
              setTicketStatus('expirado');
              // Limpa carrinho ao expirar
              localStorage.removeItem(`carrinho_${ticketId}`);
            }, 4000);
          } else {
            setTicketStatus('expirado');
            localStorage.removeItem(`carrinho_${ticketId}`);
          }
          setQueuePosition(null);
        }
      } catch (err) {
        setTicketStatus('erro');
      }
    };

    checkStatus();
    
    // Polling adaptativo: 2s quando posição <= 10, 5s demais
    const startPolling = () => {
      const intervalo = queuePosition !== null && queuePosition <= 10 ? 2000 : 5000;
      intervalId = setInterval(checkStatus, intervalo);
    };
    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    };
  }, [ticketId, API_URL, queuePosition, config, ticketStatus, token]);

  // Carrega produtos e categorias dinâmicas
  useEffect(() => {
    const fetchData = async () => {
      setLoadingProdutos(true);
      try {
        if (token) {
          const data = await fetchPortalProducts(token, 1, 50);
          if (data.ok && Array.isArray(data.products)) {
            setProdutos(data.products as any);
            
            const cats = Array.from(new Set(data.products.map(p => p.categoria))).map((cat, idx) => ({
              id: idx,
              nome: cat,
              emoji: '📦'
            }));
            setCategoriasInfo(cats);
          }
          return;
        }

        const [resProds, resCats] = await Promise.all([
          fetch(`${API_URL}/api/toledo/produtos`),
          fetch(`${API_URL}/api/categorias`)
        ]);
        const prodsData = await resProds.json();
        const catsData = await resCats.json();

        if (Array.isArray(prodsData)) {
          setProdutos(prodsData);
        } else if (prodsData.success && prodsData.produtos) {
          setProdutos(prodsData.produtos);
        }

        if (Array.isArray(catsData)) {
          setCategoriasInfo(catsData);
        }
      } catch (e) {
        console.error('Erro ao carregar produtos ou categorias:', e);
      } finally {
        setLoadingProdutos(false);
      }
    };
    if (ticketStatus === 'aguardando') {
      fetchData();
    }
  }, [ticketStatus, API_URL, token]);

  // Restaura carrinho local com migração robusta de dados legados e chaves unificadas por ID
  useEffect(() => {
    if (ticketId && produtos.length > 0) {
      const salvo = localStorage.getItem(`carrinho_${ticketId}`);
      if (salvo) {
        try {
          const parsed = JSON.parse(salvo);
          const migrated: Record<string, ItemCarrinho> = {};
          
          Object.entries(parsed).forEach(([key, value]) => {
            const p = produtos.find(x => String(x.id) === String(key) || (x.plu && String(x.plu) === String(key)));
            if (!p) return;

            const targetKey = String(p.id);
            if (typeof value === 'number') {
              // Legado (somente o multiplicador)
              const tipo = getTipoProduto(p.descricao);
              migrated[targetKey] = {
                id: p.id,
                plu: p.plu,
                quantidade: value,
                tipo
              };
            } else if (value && typeof value === 'object' && 'quantidade' in value) {
              // Estrutura nova
              migrated[targetKey] = {
                ...(value as any),
                id: p.id,
                plu: p.plu
              };
            }
          });
          
          setCarrinho(migrated);
        } catch (e) { }
      }
    }
  }, [ticketId, produtos]);

  // Salva carrinho local
  useEffect(() => {
    if (ticketId) {
      if (Object.keys(carrinho).length > 0) {
        localStorage.setItem(`carrinho_${ticketId}`, JSON.stringify(carrinho));
      } else {
        localStorage.removeItem(`carrinho_${ticketId}`);
      }
    }
  }, [carrinho, ticketId]);

  const handleOpenDrawer = (product: Produto) => {
    setSelectedProduct(product);
    const itemExistente = carrinho[product.id];
    const tipo = getTipoProduto(product.descricao);
    
    if (itemExistente) {
      setDrawerQuantidade(itemExistente.quantidade);
      setDrawerInputManual(itemExistente.quantidade.toString());
    } else {
      const defaultQtd = tipo === 'peso' ? 250 : 1;
      setDrawerQuantidade(defaultQtd);
      setDrawerInputManual(defaultQtd.toString());
    }
  };

  const handleSaveItem = (product: Produto) => {
    const tipo = getTipoProduto(product.descricao);
    setCarrinho(prev => ({
      ...prev,
      [product.id]: {
        id: product.id,
        plu: product.plu,
        quantidade: drawerQuantidade,
        tipo
      }
    }));
    setSelectedProduct(null);
  };

  const handleClearItem = (id: string | number) => {
    setCarrinho(prev => {
      const novo = { ...prev };
      delete novo[id];
      return novo;
    });
  };

  const totalItens = Object.keys(carrinho).length;

  const todasCategorias = useMemo(() => {
    const catsWithProds = new Set<string>();
    produtos.forEach(p => {
      if (p.categoria) catsWithProds.add(p.categoria.trim());
    });
    
    const orderedCats: string[] = [];
    categoriasInfo.forEach((c: any) => {
      const nameTrimmed = c.nome.trim();
      if (catsWithProds.has(nameTrimmed)) {
        orderedCats.push(c.nome);
        catsWithProds.delete(nameTrimmed);
      }
    });
    
    catsWithProds.forEach(cat => {
      orderedCats.push(cat);
    });

    return ['Todos', ...orderedCats];
  }, [produtos, categoriasInfo]);

  const produtosFiltrados = useMemo(() => {
    let list = produtos;
    if (categoriaAtiva !== 'Todos') {
      list = list.filter(p => p.categoria === categoriaAtiva);
    }
    if (!busca.trim()) return list;
    const term = busca.toLowerCase();
    return list.filter(p => p.descricao.toLowerCase().includes(term) || (p.plu && p.plu.includes(term)));
  }, [produtos, busca, categoriaAtiva]);

  // Agrupa produtos por categoria para renderização
  const produtosPorCategoria = useMemo(() => {
    const grupos: Record<string, Produto[]> = {};
    produtosFiltrados.forEach(p => {
      const cat = p.categoria || 'Outros';
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    });
    return grupos;
  }, [produtosFiltrados]);

  const gerarPDF = async () => {
    await gerarPDFLista({
      carrinho,
      produtos,
      config,
      ticketNumero,
      apiUrl: API_URL
    });
  };

  if (ticketStatus === 'carregando') {
    return <div className="h-screen w-full flex items-center justify-center font-sans text-ink">Carregando...</div>;
  }

  if (ticketStatus === 'erro') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center font-sans text-center p-6 bg-surface">
        <AlertTriangle className="w-16 h-16 text-error mb-4" />
        <h2 className="text-2xl font-bold mb-2">Acesso Inválido</h2>
        <p className="text-ink-secondary">O QR Code escaneado é inválido ou a conexão falhou.</p>
      </div>
    );
  }

  if (ticketStatus === 'expirado') {
    return (
      <div className="min-h-screen w-full flex flex-col font-sans bg-background">
        <div className="bg-error text-white p-6 rounded-b-3xl shadow-md text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
          <h2 className="text-2xl font-bold uppercase tracking-widest mb-1">Sua vez chegou!</h2>
          <p className="text-sm font-medium opacity-90">Dirija-se ao balcão.</p>
        </div>

        <div className="p-6 text-center">
          <p className="text-ink-secondary font-medium mb-6">A lista de produtos completa não está mais disponível para esta senha.</p>

          {totalItens > 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant p-4">
              <h3 className="font-bold text-lg mb-4 text-ink flex items-center justify-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Sua Seleção Final
              </h3>
              <div className="space-y-3 mb-6">
                {Object.entries(carrinho).map(([id, item]) => {
                  const p = produtos.find(x => String(x.id) === String(id)) || { descricao: `Produto ${item.plu || id}` };
                  const labelQtd = item.tipo === 'peso' ? `${item.quantidade}g` : `${item.quantidade} un`;
                  return (
                    <div key={id} className="flex justify-between items-center bg-surface-variant/50 p-3 rounded-lg text-sm text-left">
                      <span className="font-semibold text-ink line-clamp-1 flex-1 pr-2">{p.descricao}</span>
                      <span className="bg-primary/10 text-primary font-bold px-2 py-1 rounded">{labelQtd}</span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={gerarPDF}
                className="w-full bg-primary text-on-primary font-bold rounded-xl py-4 flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                GERAR PDF DA LISTA
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-secondary/70">Você não pré-selecionou nenhum item.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background font-sans pb-24">
      {/* Header Fixo */}
      <div className="sticky top-0 z-40 bg-surface shadow-sm border-b border-outline-variant">
        <div className="bg-surface pt-4 pb-2 px-4 shadow-sm border-b border-outline-variant/30 flex items-center gap-3">
          {config.logo_cliente ? (
            <img src={`${API_URL}${config.logo_cliente}`} alt="Logo" className="h-10 w-auto rounded object-contain max-w-[120px]" />
          ) : (
            <div className="bg-primary/10 w-10 h-10 rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-primary font-bold">storefront</span>
            </div>
          )}
          <h1 className="font-sans text-lg font-bold text-ink uppercase tracking-widest leading-none">
            {config.nome_estabelecimento || 'ChamaAí'}
          </h1>
        </div>
        <div className="bg-surface text-ink px-4 py-2 flex justify-between items-center text-xs font-bold uppercase tracking-widest">
          <span>Sua Senha: <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{ticketNumero}</span></span>
          <span className="flex items-center gap-1 text-primary"><span className="w-2 h-2 rounded-full bg-success animate-pulse"></span> AO VIVO</span>
        </div>
        
        {/* Barra de Pesquisa */}
        <div className="p-4 pt-2 pb-1">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary" />
            <input
              type="text"
              placeholder="Pesquisar produto ou código PLU..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-surface-variant border border-outline-variant rounded-xl py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Categorias Swipable Horizontal */}
        <div className="px-4 pb-3 overflow-x-auto scrollbar-hide flex gap-2 w-full pt-1 select-none">
          {todasCategorias.map(cat => {
            const isActive = categoriaAtiva === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/15 scale-[1.03]'
                    : 'bg-surface-variant/40 border-outline-variant/60 text-ink hover:bg-surface-variant'
                }`}
              >
                <span>{getEmojiCategoria(cat)}</span>
                <span>{cat === 'Todos' ? 'Todos Itens' : cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner de Solicitação de Notificações */}
      {'Notification' in window && notifPermission === 'default' && (
        <div className="mx-4 mt-3">
          <div className="bg-surface border border-outline-variant rounded-2xl p-4 shadow-sm flex flex-col items-center text-center">
            <Bell className="w-8 h-8 text-primary mb-2" />
            <h3 className="font-bold text-ink mb-1">Ativar Notificações</h3>
            <p className="text-xs text-ink-secondary mb-3">Seja avisado no celular quando sua senha estiver próxima, mesmo com a tela desligada.</p>
            <button 
              onClick={() => {
                Notification.requestPermission().then(perm => setNotifPermission(perm));
              }}
              className="w-full bg-primary text-on-primary font-bold rounded-xl py-3 active:scale-95 transition-transform"
            >
              ATIVAR AGORA
            </button>
          </div>
        </div>
      )}

      {/* Alerta de Notificações Bloqueadas */}
      {'Notification' in window && notifPermission === 'denied' && (
        <div className="mx-4 mt-3">
          <div className="bg-surface-variant/50 border border-outline-variant rounded-2xl p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-error mx-auto mb-2 opacity-80" />
            <p className="text-xs text-ink-secondary leading-tight">
              As notificações estão bloqueadas. Para ser avisado sobre sua senha, ative-as nas configurações do seu navegador.
            </p>
          </div>
        </div>
      )}

      {/* Banner de Alerta de Posição na Fila */}
      {(queuePosition !== null && queuePosition <= 3 || showExpiringBanner) && (
        <div className="mx-4 mt-3 animate-pulse">
          <div className={`rounded-2xl p-4 shadow-lg border-2 flex items-center gap-4 ${
            queuePosition === 1 || showExpiringBanner
              ? 'bg-gradient-to-r from-red-500 to-orange-500 border-red-300 text-white'
              : 'bg-gradient-to-r from-amber-400 to-orange-400 border-amber-300 text-white'
          }`}>
            <div className="shrink-0 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Bell className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <p className="font-black text-lg leading-tight uppercase tracking-wide">
                {showExpiringBanner ? 'SUA VEZ CHEGOU!' : queuePosition === 1 
                  ? 'Prepare-se! Sua senha é a próxima a ser chamada!' 
                  : `Prepare-se! Faltam apenas ${queuePosition} senhas na sua frente!`}
              </p>
              <p className="text-white/80 text-xs font-bold mt-1 uppercase tracking-widest flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> Alerta sonoro ativado
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Catálogo de Produtos */}
      <div className="p-4 space-y-8">
        {loadingProdutos ? (
          /* SKELETON LOADINGS */
          <div className="space-y-4 pt-4">
            <div className="h-6 bg-surface-variant rounded-md w-36 animate-pulse mb-6"></div>
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-surface border border-outline-variant/60 rounded-2xl p-4 flex justify-between items-center shadow-sm animate-pulse">
                <div className="flex-1 pr-4">
                  <div className="h-4 bg-surface-variant rounded-md w-16 mb-2"></div>
                  <div className="h-5 bg-surface-variant rounded-md w-3/4 mb-2"></div>
                  <div className="h-4 bg-surface-variant rounded-md w-24"></div>
                </div>
                <div className="w-10 h-10 bg-surface-variant rounded-full shrink-0"></div>
              </div>
            ))}
          </div>
        ) : (
          Object.entries(produtosPorCategoria).map(([categoria, items]) => (
            <div key={categoria}>
              <h2 className="text-lg font-bold text-ink mb-4 pl-2 border-l-4 border-primary flex items-center gap-2">
                <span>{getEmojiCategoria(categoria)}</span>
                <span>{categoria}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {items.map(p => {
                  const item = carrinho[p.id];
                  const isSelected = !!item;
                  const tipo = getTipoProduto(p.descricao);
                  const labelQuantidade = isSelected
                    ? item.tipo === 'peso'
                      ? `${item.quantidade}g`
                      : `${item.quantidade} un`
                    : '';

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleOpenDrawer(p)}
                      className={`bg-surface border rounded-2xl p-4 flex justify-between items-center shadow-sm transition-all duration-300 active:scale-[0.98] cursor-pointer ${
                        isSelected
                           ? 'border-primary ring-2 ring-primary/10 bg-primary/[0.02]'
                           : 'border-outline-variant/60 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          {p.plu && (
                            <span className="text-[10px] font-mono font-bold text-ink-secondary bg-surface-variant/80 px-2 py-0.5 rounded-md">
                              PLU {p.plu}
                            </span>
                          )}
                          {isSelected && (
                            <span className="bg-success/15 text-success font-black text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-0.5">
                              ✓ {labelQuantidade}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-ink leading-tight text-sm line-clamp-2">
                          {p.descricao}
                        </h3>
                        <p className="text-primary font-black mt-1.5 text-base">
                          R$ {p.preco.toFixed(2).replace('.', ',')}
                          <span className="text-xs font-semibold text-ink-secondary">
                            /{tipo === 'peso' ? 'kg' : 'un'}
                          </span>
                        </p>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isSelected ? (
                          <div className="bg-primary text-on-primary w-10 h-10 rounded-full flex items-center justify-center shadow-md shadow-primary/20">
                            <span className="material-symbols-outlined text-lg font-bold">edit</span>
                          </div>
                        ) : (
                          <div className="bg-primary/10 text-primary transition-colors w-10 h-10 rounded-full flex items-center justify-center">
                            <Plus className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        
        {!loadingProdutos && Object.keys(produtosPorCategoria).length === 0 && (
          <p className="text-center text-ink-secondary mt-10">Nenhum produto encontrado.</p>
        )}
      </div>

      {/* Drawer Bottom Sheet para Ajuste de Peso/Quantidade */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Background overlay (Android safe) */}
          <div
            className="absolute inset-0 bg-black/60 transition-opacity"
            onClick={() => setSelectedProduct(null)}
          ></div>

          {/* Gaveta principal */}
          <div className="relative w-full max-w-md bg-surface rounded-t-[32px] p-6 shadow-[0_-8px_32px_rgba(0,0,0,0.15)] border-t border-outline-variant/30 transform transition-transform duration-300 max-h-[90vh] overflow-y-auto animate-slide-up pb-8 z-10">
            {/* Barra de arraste visual */}
            <div className="w-12 h-1.5 bg-outline-variant/60 rounded-full mx-auto mb-6"></div>

            {/* Informações do Produto */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1.5">
                {selectedProduct.plu && (
                  <span className="text-[10px] font-mono font-bold text-ink-secondary bg-surface-variant px-2 py-0.5 rounded-md">
                    PLU {selectedProduct.plu}
                  </span>
                )}
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {getTipoProduto(selectedProduct.descricao) === 'peso' ? 'Por Peso' : 'Por Unidade'}
                </span>
              </div>
              <h3 className="font-bold text-lg text-ink leading-snug">
                {selectedProduct.descricao}
              </h3>
              <p className="text-xl font-black text-primary mt-2">
                R$ {selectedProduct.preco.toFixed(2).replace('.', ',')}
                <span className="text-sm font-medium text-ink-secondary">
                  /{getTipoProduto(selectedProduct.descricao) === 'peso' ? 'kg' : 'un'}
                </span>
              </p>
            </div>

            {/* Controles de Quantidade */}
            {getTipoProduto(selectedProduct.descricao) === 'peso' ? (
              /* Seletor por Peso */
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink-secondary mb-3">
                    Predefinições de Peso
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 250, 500, 750, 1000, 1500, 2000, 3000].map(grams => (
                      <button
                        key={grams}
                        type="button"
                        onClick={() => {
                          setDrawerQuantidade(grams);
                          setDrawerInputManual(grams.toString());
                        }}
                        className={`py-2.5 px-1 text-xs font-bold rounded-xl border transition-all ${
                          drawerQuantidade === grams
                            ? 'bg-primary text-on-primary border-primary shadow-sm shadow-primary/20 scale-[1.03]'
                            : 'bg-surface-variant/40 border-outline-variant/50 text-ink hover:bg-surface-variant'
                        }`}
                      >
                        {grams >= 1000 ? `${grams / 1000} kg` : `${grams}g`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink-secondary mb-2 flex justify-between">
                    <span>Ajuste Preciso</span>
                    <span className="text-primary font-black text-sm">
                      {drawerQuantidade >= 1000 ? `${(drawerQuantidade / 1000).toFixed(3).replace('.', ',')} kg` : `${drawerQuantidade}g`}
                    </span>
                  </label>
                  <div className="flex items-center gap-4 bg-surface-variant/40 p-2 rounded-2xl border border-outline-variant/30 justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const newVal = Math.max(50, drawerQuantidade - 50);
                        setDrawerQuantidade(newVal);
                        setDrawerInputManual(newVal.toString());
                      }}
                      className="w-12 h-12 bg-surface text-ink hover:bg-surface-variant border border-outline-variant/30 rounded-xl flex items-center justify-center font-black text-xl shadow-sm active:scale-95 transition-all"
                    >
                      -
                    </button>
                    <div className="flex items-baseline gap-1">
                      <input
                        type="number"
                        pattern="[0-9]*"
                        value={drawerInputManual}
                        onChange={e => {
                          const val = e.target.value;
                          setDrawerInputManual(val);
                          const num = parseInt(val);
                          if (!isNaN(num) && num > 0) {
                            setDrawerQuantidade(num);
                          }
                        }}
                        onBlur={() => {
                          if (!drawerInputManual || isNaN(parseInt(drawerInputManual)) || parseInt(drawerInputManual) <= 0) {
                            setDrawerQuantidade(250);
                            setDrawerInputManual('250');
                          }
                        }}
                        className="w-20 bg-transparent text-center font-black text-2xl text-ink outline-none border-b border-primary/30 focus:border-primary"
                      />
                      <span className="font-bold text-ink-secondary text-sm">g</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newVal = Math.min(10000, drawerQuantidade + 50);
                        setDrawerQuantidade(newVal);
                        setDrawerInputManual(newVal.toString());
                      }}
                      className="w-12 h-12 bg-primary text-on-primary hover:bg-primary-hover rounded-xl flex items-center justify-center font-black text-xl shadow-md shadow-primary/10 active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Seletor por Unidade */
              <div className="space-y-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-ink-secondary mb-1 flex justify-between">
                  <span>Quantidade</span>
                  <span className="text-primary font-black text-sm">{drawerQuantidade} un</span>
                </label>
                <div className="flex items-center gap-4 bg-surface-variant/40 p-2 rounded-2xl border border-outline-variant/30 justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const newVal = Math.max(1, drawerQuantidade - 1);
                      setDrawerQuantidade(newVal);
                      setDrawerInputManual(newVal.toString());
                    }}
                    className="w-12 h-12 bg-surface text-ink hover:bg-surface-variant border border-outline-variant/30 rounded-xl flex items-center justify-center font-black text-xl shadow-sm active:scale-95 transition-all"
                  >
                    -
                  </button>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      pattern="[0-9]*"
                      value={drawerInputManual}
                      onChange={e => {
                        const val = e.target.value;
                        setDrawerInputManual(val);
                        const num = parseInt(val);
                        if (!isNaN(num) && num > 0) {
                          setDrawerQuantidade(num);
                        }
                      }}
                      onBlur={() => {
                        if (!drawerInputManual || isNaN(parseInt(drawerInputManual)) || parseInt(drawerInputManual) <= 0) {
                          setDrawerQuantidade(1);
                          setDrawerInputManual('1');
                        }
                      }}
                      className="w-20 bg-transparent text-center font-black text-2xl text-ink outline-none border-b border-primary/30 focus:border-primary"
                    />
                    <span className="font-bold text-ink-secondary text-sm">un</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newVal = Math.min(100, drawerQuantidade + 1);
                      setDrawerQuantidade(newVal);
                      setDrawerInputManual(newVal.toString());
                    }}
                    className="w-12 h-12 bg-primary text-on-primary hover:bg-primary-hover rounded-xl flex items-center justify-center font-black text-xl shadow-md shadow-primary/10 active:scale-95 transition-all"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Card de Preço Estimado em Tempo Real */}
            <div className="mt-6 bg-primary/[0.02] border border-primary/10 rounded-2xl p-4 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
                Subtotal Estimado
              </span>
              <div className="text-2xl font-black text-success">
                R${' '}
                {(
                  (selectedProduct.preco *
                    (getTipoProduto(selectedProduct.descricao) === 'peso' ? drawerQuantidade / 1000 : drawerQuantidade))
                )
                  .toFixed(2)
                  .replace('.', ',')}
              </div>
              <span className="text-[9px] font-bold text-ink-secondary/70 mt-1.5 leading-relaxed text-center">
                * Referência: {getTipoProduto(selectedProduct.descricao) === 'peso' 
                  ? `${drawerQuantidade >= 1000 ? `${drawerQuantidade / 1000}kg` : `${drawerQuantidade}g`} × R$ ${selectedProduct.preco.toFixed(2).replace('.', ',')}/kg`
                  : `${drawerQuantidade} un × R$ ${selectedProduct.preco.toFixed(2).replace('.', ',')}/un`
                }
              </span>
            </div>

            {/* Botões de Ação */}
            <div className="grid grid-cols-1 gap-3 mt-6">
              <button
                type="button"
                onClick={() => handleSaveItem(selectedProduct)}
                className="w-full bg-primary hover:bg-primary-hover text-on-primary py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary/10 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                {carrinho[selectedProduct.id] ? 'Atualizar na Lista' : 'Confirmar e Adicionar'}
              </button>
              
              {carrinho[selectedProduct.id] && (
                <button
                  type="button"
                  onClick={() => {
                    handleClearItem(selectedProduct.id);
                    setSelectedProduct(null);
                  }}
                  className="w-full bg-error/5 hover:bg-error/10 text-error py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover da Lista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar Carrinho */}
      {totalItens > 0 && !selectedProduct && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/5 to-transparent z-50 pointer-events-none">
          <div className="pointer-events-auto bg-surface rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-outline-variant overflow-hidden">
            {showCarrinho ? (
              <div className="flex flex-col max-h-[60vh]">
                {/* Header do carrinho com "Limpar Tudo" */}
                <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-variant/30">
                  <h3 className="font-bold text-ink flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Sua Lista</h3>
                  <div className="flex gap-4 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Deseja limpar todos os itens selecionados da sua lista?')) {
                          setCarrinho({});
                          setShowCarrinho(false);
                        }
                      }}
                      className="text-xs font-bold text-error uppercase tracking-wider"
                    >
                      Limpar Tudo
                    </button>
                    <button type="button" onClick={() => setShowCarrinho(false)} className="text-sm font-bold text-primary">FECHAR</button>
                  </div>
                </div>

                {/* Lista de itens no carrinho */}
                <div className="overflow-y-auto p-4 space-y-3">
                  {Object.entries(carrinho).map(([id, item]) => {
                    const p = produtos.find(x => String(x.id) === String(id)) || { id: Number(id), descricao: `Produto ${item.plu || id}`, preco: 0 };
                    const labelQtd = item.tipo === 'peso' ? `${item.quantidade}g` : `${item.quantidade} un`;
                    const subtotal = p.preco * (item.tipo === 'peso' ? item.quantidade / 1000 : item.quantidade);
                    
                    return (
                      <div key={id} className="flex justify-between items-center bg-surface-variant/20 p-3 rounded-xl border border-outline-variant/30">
                        <div className="flex-1 pr-3">
                          <p className="font-bold text-sm text-ink line-clamp-1">{p.descricao}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                              {labelQtd}
                            </span>
                            <span className="text-xs font-bold text-success">
                              Est: R$ {subtotal.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p as any);
                              setDrawerQuantidade(item.quantidade);
                              setDrawerInputManual(item.quantidade.toString());
                              setShowCarrinho(false);
                            }}
                            className="p-2 text-primary hover:bg-primary/5 rounded-lg border border-primary/20"
                          >
                            <span className="material-symbols-outlined text-base">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClearItem(id)}
                            className="p-2 text-error hover:bg-error/5 rounded-lg border border-error/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer do carrinho com Aviso Legal Airtight */}
                <div className="p-4 bg-surface-variant/30 border-t border-outline-variant">
                  <div className="bg-error/5 border border-error/15 rounded-xl p-3 mb-4">
                    <p className="text-[10px] leading-relaxed text-error font-medium text-center uppercase tracking-wide">
                      ⚠️ <strong>Aviso Importante:</strong> Valores e gramaturas são apenas estimativas para referência. O peso e valor oficial cobrado final serão aferidos na balança do caixa de atendimento.
                    </p>
                  </div>
                  <button onClick={gerarPDF} className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md">
                    <FileText className="w-5 h-5" /> GERAR PDF DA LISTA
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCarrinho(true)}
                className="w-full p-4 flex items-center justify-between text-ink"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ShoppingCart className="w-6 h-6 text-primary" />
                    <span className="absolute -top-2 -right-2 bg-error text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-surface">{totalItens}</span>
                  </div>
                  <span className="font-bold text-sm">Ver Minha Lista de Pré-Seleção</span>
                </div>
                <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-lg uppercase tracking-wider">Expandir</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
