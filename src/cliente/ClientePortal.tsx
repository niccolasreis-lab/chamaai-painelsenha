import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiUrl } from '../shared/apiConfig';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ShoppingCart, Search, FileText, AlertTriangle, Plus, Minus, Trash2 } from 'lucide-react';

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
  
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState('');
  
  // Carrinho de pré-seleção: armazena PLU e Quantidade (apenas representativa para a lista)
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [showCarrinho, setShowCarrinho] = useState(false);

  // Verifica status do ticket e fila
  useEffect(() => {
    if (!ticketId) {
      setTicketStatus('erro');
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/senhas/${ticketId}/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        setTicketNumero(data.numero || '');
        if (data.aguardando) {
          setTicketStatus('aguardando');
        } else {
          setTicketStatus('expirado');
        }
      } catch (err) {
        setTicketStatus('erro');
      }
    };

    checkStatus();
    // Poll a cada 10 segundos
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [ticketId, API_URL]);

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
        } catch (e) {}
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

  const gerarPDF = () => {
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(18);
    doc.text('Lista de Pré-Seleção - ChamaAí', 14, 22);
    
    // Data e Senha
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
    doc.text(`Senha associada: ${ticketNumero || 'N/A'}`, 14, 35);
    
    // Aviso Legal
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38); // Red
    doc.text('* Valores válidos apenas para a data de hoje.', 14, 42);
    doc.text('* Preços sujeitos à alteração da balança sem aviso prévio.', 14, 46);

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
      startY: 55,
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
        <div className="bg-primary text-white px-4 py-2 flex justify-between items-center text-xs font-bold uppercase tracking-widest">
          <span>Sua Senha: {ticketNumero}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success animate-pulse"></span> AO VIVO</span>
        </div>
        <div className="p-4">
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
