import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Re-using the interfaces for typing
export interface ProdutoBase {
  plu: string | number;
  descricao: string;
  preco: number | string;
}

export interface ItemCarrinhoBase {
  plu?: string | number;
  quantidade: number;
  tipo: 'unidade' | 'peso';
}

interface GerarPDFParams {
  carrinho: Record<string, ItemCarrinhoBase>;
  produtos: ProdutoBase[];
  config: Record<string, string>;
  ticketNumero: string | null;
  apiUrl: string;
}

const loadImageToBase64 = (url: string): Promise<{ base64: string, width: number, height: number }> => {
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
        resolve({ base64: canvas.toDataURL('image/png'), width: img.width, height: img.height });
      } else {
        reject(new Error('Canvas context not available'));
      }
    };
    img.onerror = (err) => reject(err);
  });
};

export const gerarPDFLista = async ({ carrinho, produtos, config, ticketNumero, apiUrl }: GerarPDFParams) => {
  try {
    if (Object.keys(carrinho).length === 0) {
      alert("Adicione itens à lista primeiro.");
      return;
    }

    const doc = new jsPDF({ format: 'a5' }); // Formato A5 para celulares
    let yPos = 15;

    // Tenta carregar o logotipo do cliente
    let logoData: { base64: string, width: number, height: number } | null = null;
    if (config.logo_cliente) {
      try {
        const logoUrl = config.logo_cliente.startsWith('data:') 
          ? config.logo_cliente 
          : config.logo_cliente.startsWith('http') 
            ? config.logo_cliente 
            : `${apiUrl}${config.logo_cliente}`;
        logoData = await loadImageToBase64(logoUrl);
      } catch (e) {
        console.error('Erro ao adicionar logotipo ao PDF:', e);
      }
    }

    // --- CABEÇALHO PREMIUM ---
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, 148, 45, 'F'); // Largura do A5 é ~148mm

    // Adiciona o logotipo se disponível preservando o aspect ratio
    if (logoData) {
      try {
        const maxWidth = 30;
        const maxHeight = 20;
        const ratio = Math.min(maxWidth / logoData.width, maxHeight / logoData.height);
        const finalWidth = logoData.width * ratio;
        const finalHeight = logoData.height * ratio;
        
        // Centraliza verticalmente no cabeçalho considerando altura de 45 e padding superior
        const xPos = 12;
        const yPosLogo = (45 - finalHeight) / 2;

        doc.addImage(logoData.base64, 'PNG', xPos, yPosLogo, finalWidth, finalHeight);
      } catch (e) {
        console.error('Erro ao renderizar logo no PDF:', e);
      }
    }

    // Título / Nome da Empresa (Branco)
    doc.setTextColor(255, 255, 255);
    // Fonte Sora se suportada, ou helvetica padrão
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(config.nome_estabelecimento || 'Sua Lista - ChamaAí', logoData ? 46 : 12, 18);

    // Subtítulo
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text('Lista de Pré-Seleção de Produtos', logoData ? 46 : 12, 24);
    
    // Senha em destaque
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(250, 204, 21); // yellow-400
    doc.text(`Senha: ${ticketNumero || 'N/A'}`, logoData ? 46 : 12, 32);

    // Data alinhada à direita
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 136, 18, { align: 'right' });

    // --- DADOS DA TABELA ---
    let valorTotalEstimado = 0;
    const tableData = Object.entries(carrinho).map(([plu, item]) => {
      const p = produtos.find(x => String(x.plu) === String(plu));
      const precoRaw = p ? (typeof p.preco === 'number' ? p.preco : parseFloat(p.preco || '0')) : 0;
      
      // Ajuste para lidar com preço em centavos vs decimais dependendo da fonte
      // Se o preço for > 1000 e não tiver decimais (modulo 1 === 0), assume centavos
      let precoReais = precoRaw;
      if (precoRaw > 100 && precoRaw % 1 === 0 && !p?.preco.toString().includes('.')) {
         precoReais = precoRaw / 100;
      }
      
      const totalEst = precoReais * (item.tipo === 'peso' ? item.quantidade / 1000 : item.quantidade);
      valorTotalEstimado += totalEst;
      
      return [
        p?.descricao || `Produto ${plu}`,
        plu,
        item.tipo === 'peso' ? `${item.quantidade}g` : `${item.quantidade} un`,
        p ? `R$ ${precoReais.toFixed(2).replace('.', ',')}` : '-',
        `R$ ${totalEst.toFixed(2).replace('.', ',')}`
      ];
    });

    yPos = 55;

    // Renderiza a tabela com estilo premium
    (doc as any).autoTable({
      startY: yPos,
      head: [['PRODUTO', 'PLU', 'QTD/PESO', 'V. UN.', 'TOTAL']],
      body: tableData,
      theme: 'plain', 
      headStyles: { 
        fillColor: [241, 245, 249], 
        textColor: [71, 85, 105], 
        fontSize: 7, 
        fontStyle: 'bold',
        halign: 'center' 
      },
      styles: { 
        fontSize: 8.5, 
        cellPadding: 4,
        textColor: [51, 65, 85], 
        lineColor: [226, 232, 240], 
        lineWidth: { bottom: 0.1 }
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left', fontStyle: 'bold', textColor: [15, 23, 42] },
        1: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22, fontStyle: 'bold', textColor: [15, 23, 42] },
      }
    });

    // Pega a posição Y final da tabela
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // --- RESUMO DO TOTAL ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(12, finalY, 124, 12, 2, 2, 'FD');
    
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Estimado:', 18, finalY + 8);
    
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); 
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${valorTotalEstimado.toFixed(2).replace('.', ',')}`, 132, finalY + 8, { align: 'right' });

    // --- AVISO LEGAL PREMIUM ---
    const avisoY = finalY + 20;
    doc.setFillColor(254, 242, 242); 
    doc.setDrawColor(252, 165, 165); 
    doc.setLineWidth(0.3);
    doc.roundedRect(12, avisoY, 124, 18, 2, 2, 'FD'); 

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); 
    doc.text('ATENÇÃO: ISENÇÃO DE RESPONSABILIDADE', 16, avisoY + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(153, 27, 27); 
    doc.text('* Esta é uma lista de pré-seleção estimativa para agilizar seu atendimento.', 16, avisoY + 11);
    doc.text('* O peso e valor oficiais serão aferidos EXCLUSIVAMENTE na balança do caixa.', 16, avisoY + 15);

    doc.save(`Minha_Lista_${new Date().getTime()}.pdf`);
  } catch (err: any) {
    alert("Erro ao gerar PDF: " + err.message);
  }
};
