import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ShoppingCart, Search, FileText, AlertTriangle, Plus, Minus, Trash2 } from 'lucide-react';
import { playNotificationSound } from '../shared/sounds';
import { Bell, Volume2 } from 'lucide-react';

interface Produto {
  plu: string;
  descricao: string;
  preco: number;
  categoria: string;
}

export default function ClientePortal() {
  const [searchParams] = useSearchParams();
  const ticketId = searchParams.get('ticket');
  const API_URL = getApiUrl();

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
  const [busca, setBusca] = useState('');
  const [config, setConfig] = useState<any>({});

  // Carrega configurações da loja
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações da loja', err);
      }
    };
    fetchConfig();
  }, [API_URL]);

  const loadImageToBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Canvas context not available'));
        }
      };
      img.onerror = (err) => reject(err);
    });
  };

  // Carrinho de pré-seleção: armazena PLU e Quantidade (apenas representativa para a lista)
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
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
                const tipoSom = config.tipo_som || 'chime';
                const volume = parseInt(config.volume_audio || '80');
                const customUrl = config.som_personalizado ? `${API_URL}${config.som_personalizado}` : undefined;
                playNotificationSound(tipoSom as any, volume, customUrl);
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
            }, 4000);
          } else {
            setTicketStatus('expirado');
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
  }, [ticketId, API_URL, queuePosition, config]);

  // Carrega produtos
  useEffect(() => {
    const fetchProdutos = async () => {
      try {
        const res = await fetch(`${API_URL}/api/toledo/produtos`);
        const data = await res.json();
        if (data.success && data.produtos) {
          setProdutos(data.produtos);
        }
      } catch (e) {
        console.error('Erro ao carregar produtos');
      }
    };
    if (ticketStatus === 'aguardando') {
      fetchProdutos();
    }
  }, [ticketStatus, API_URL]);

  // Restaura carrinho local
  useEffect(() => {
    if (ticketId) {
      const salvo = localStorage.getItem(`carrinho_${ticketId}`);
      if (salvo) {
        try {
          setCarrinho(JSON.parse(salvo));
        } catch (e) { }
      }
    }
  }, [ticketId]);

  // Salva carrinho local
  useEffect(() => {
    if (ticketId && Object.keys(carrinho).length > 0) {
      localStorage.setItem(`carrinho_${ticketId}`, JSON.stringify(carrinho));
    }
  }, [carrinho, ticketId]);

  const handleAdd = (plu: string) => {
    setCarrinho(prev => ({ ...prev, [plu]: (prev[plu] || 0) + 1 }));
  };

  const handleRemove = (plu: string) => {
    setCarrinho(prev => {
      const novo = { ...prev };
      if (novo[plu] > 1) {
        novo[plu]--;
      } else {
        delete novo[plu];
      }
      return novo;
    });
  };

  const handleClearItem = (plu: string) => {
    setCarrinho(prev => {
      const novo = { ...prev };
      delete novo[plu];
      return novo;
    });
  };

  const totalItens = Object.values(carrinho).reduce((acc, val) => acc + val, 0);

  const produtosFiltrados = useMemo(() => {
    if (!busca.trim()) return produtos;
    const term = busca.toLowerCase();
    return produtos.filter(p => p.descricao.toLowerCase().includes(term) || p.plu.includes(term));
  }, [produtos, busca]);

  // Agrupa produtos por categoria
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
    const doc = new jsPDF();
    let yPos = 22;

    // Se houver logo do cliente, tenta carregar e desenhar
    if (config.logo_cliente) {
      try {
        const logoUrl = `${API_URL}${config.logo_cliente}`;
        const base64Logo = await loadImageToBase64(logoUrl);
        doc.addImage(base64Logo, 'PNG', 14, 14, 30, 15);
        yPos = 38;
      } catch (e) {
        console.error('Erro ao adicionar logotipo ao PDF:', e);
      }
    }

    // Título
    doc.setFontSize(config.logo_cliente ? 16 : 18);
    doc.setFont('helvetica', 'bold');
    doc.text(config.nome_estabelecimento || 'Lista de Pré-Seleção - ChamaAí', config.logo_cliente ? 48 : 14, config.logo_cliente ? 24 : yPos);

    // Subtítulo se tiver logo
    if (config.logo_cliente) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text('Lista de Pré-Seleção de Produtos', 48, 29);
    }

    // Data e Senha
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, config.logo_cliente ? 38 : 32);
    doc.text(`Senha associada: ${ticketNumero || 'N/A'}`, 14, config.logo_cliente ? 44 : 38);

    // Aviso Legal
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38); // Red
    doc.text('* Valores válidos apenas para a data de hoje.', 14, config.logo_cliente ? 52 : 46);
    doc.text('* Preços sujeitos à alteração da balança sem aviso prévio.', 14, config.logo_cliente ? 56 : 50);

    // Tabela
    const tableData = Object.entries(carrinho).map(([plu, qtd]) => {
      const p = produtos.find(x => x.plu === plu);
      return [
        p?.descricao || `Produto ${plu}`,
        plu,
        qtd.toString(),
        p ? `R$ ${p.preco.toFixed(2).replace('.', ',')}/kg` : '-'
      ];
    });

    (doc as any).autoTable({
      startY: config.logo_cliente ? 62 : 55,
      head: [['Produto', 'Cód.', 'Qtd.', 'Preço Ref. (Kg/Un)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 9 }
    });

    doc.save(`Minha_Lista_${new Date().getTime()}.pdf`);
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
                {Object.entries(carrinho).map(([plu, qtd]) => {
                  const p = produtos.find(x => x.plu === plu) || { descricao: `Produto ${plu}` };
                  return (
                    <div key={plu} className="flex justify-between items-center bg-surface-variant/50 p-3 rounded-lg text-sm text-left">
                      <span className="font-semibold text-ink line-clamp-1 flex-1 pr-2">{p.descricao}</span>
                      <span className="bg-primary/10 text-primary font-bold px-2 py-1 rounded">x{qtd}</span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={gerarPDF}
                className="w-full bg-primary text-white font-bold rounded-xl py-4 flex items-center justify-center gap-2"
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
        <div className="p-4 pt-2">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary" />
            <input
              type="text"
              placeholder="Pesquisar produto ou código..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-surface-variant border border-outline-variant rounded-xl py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Banner de Solicitação de Notificações (PWA/Browser) */}
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
              className="w-full bg-primary text-white font-bold rounded-xl py-3 active:scale-95 transition-transform"
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
        {Object.entries(produtosPorCategoria).map(([categoria, items]) => (
          <div key={categoria}>
            <h2 className="text-xl font-bold text-ink mb-4 pl-1 border-l-4 border-primary">{categoria}</h2>
            <div className="grid grid-cols-1 gap-3">
              {items.map(p => {
                const qtd = carrinho[p.plu] || 0;
                return (
                  <div key={p.plu} className="bg-surface border border-outline-variant rounded-2xl p-4 flex justify-between items-center shadow-sm">
                    <div className="flex-1 pr-4">
                      <span className="text-xs font-mono text-ink-secondary bg-surface-variant px-1.5 py-0.5 rounded mb-1 inline-block">{p.plu}</span>
                      <h3 className="font-bold text-ink leading-tight line-clamp-2 text-sm">{p.descricao}</h3>
                      <p className="text-primary font-black mt-1">R$ {p.preco.toFixed(2).replace('.', ',')}<span className="text-xs font-medium text-ink-secondary">/kg</span></p>
                    </div>

                    {qtd === 0 ? (
                      <button
                        onClick={() => handleAdd(p.plu)}
                        className="bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 bg-surface-variant p-1 rounded-full shrink-0">
                        <button onClick={() => handleRemove(p.plu)} className="w-8 h-8 flex items-center justify-center bg-surface rounded-full shadow-sm text-ink-secondary"><Minus className="w-4 h-4" /></button>
                        <span className="font-bold text-sm w-4 text-center">{qtd}</span>
                        <button onClick={() => handleAdd(p.plu)} className="w-8 h-8 flex items-center justify-center bg-primary rounded-full shadow-sm text-white"><Plus className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(produtosPorCategoria).length === 0 && (
          <p className="text-center text-ink-secondary mt-10">Nenhum produto encontrado.</p>
        )}
      </div>

      {/* Bottom Bar Carrinho */}
      {totalItens > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/5 to-transparent z-50 pointer-events-none">
          <div className="pointer-events-auto bg-surface rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-outline-variant overflow-hidden">
            {showCarrinho ? (
              <div className="flex flex-col max-h-[60vh]">
                <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-variant/30">
                  <h3 className="font-bold text-ink flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Sua Lista</h3>
                  <button onClick={() => setShowCarrinho(false)} className="text-sm font-bold text-primary">FECHAR</button>
                </div>
                <div className="overflow-y-auto p-4 space-y-3">
                  {Object.entries(carrinho).map(([plu, qtd]) => {
                    const p = produtos.find(x => x.plu === plu) || { descricao: `Produto ${plu}`, preco: 0 };
                    return (
                      <div key={plu} className="flex justify-between items-center">
                        <div className="flex-1 pr-2">
                          <p className="font-semibold text-sm line-clamp-1 text-ink">{p.descricao}</p>
                          <p className="text-xs text-ink-secondary">Qtd: {qtd}</p>
                        </div>
                        <button onClick={() => handleClearItem(plu)} className="p-2 text-error/70 hover:text-error bg-error/5 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 bg-surface-variant/30 border-t border-outline-variant">
                  <p className="text-[10px] leading-tight text-ink-secondary text-center mb-3 font-medium">
                    * Os valores pré-selecionados são válidos apenas hoje e podem haver alterações da balança sem aviso prévio.
                  </p>
                  <button onClick={gerarPDF} className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                    <FileText className="w-5 h-5" /> GERAR PDF DA LISTA
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCarrinho(true)}
                className="w-full p-4 flex items-center justify-between text-ink"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ShoppingCart className="w-6 h-6 text-primary" />
                    <span className="absolute -top-2 -right-2 bg-error text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-surface">{totalItens}</span>
                  </div>
                  <span className="font-bold text-sm">Ver Minha Lista</span>
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
