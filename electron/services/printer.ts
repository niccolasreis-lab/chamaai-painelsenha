import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';

const execAsync = promisify(exec);

export interface TicketData {
  ticketId?: number;
  numero: string;
  balcao: string;
  data: string;
  preferencial: boolean;
  logo?: string;
}

export interface PrinterConfig {
  interface: string;
  type: string;
  width: number;
  footer: string;
  logoPath: string;
}

const DEFAULT_CONFIG: PrinterConfig = {
  interface: '',
  type: 'EPSON',
  width: 48,
  footer: 'Obrigado pela preferência!',
  logoPath: '',
};

export class PrinterService {
  private config: PrinterConfig;
  private simulationMode: boolean;
  private printWindow: any = null;

  constructor(config?: Partial<PrinterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.simulationMode = !this.config.interface || this.config.interface === '';
    this.initPrintWindow();
  }

  private initPrintWindow() {
    const { BrowserWindow } = require('electron');
    if (!this.printWindow) {
      this.printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true }
      });
    }
  }

  updateConfig(newConfig: Partial<PrinterConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.simulationMode = !this.config.interface || this.config.interface === '';
    console.log(`[PrinterService] Config atualizada. Porta: ${this.config.interface}`);
  }

  /**
   * Retorna a URL do Portal do Cliente para o QR Code.
   * Lê da configuração 'portal_cliente_url' no banco.
   * Se não configurada, usa a rota local como fallback.
   */
  private getPortalUrl(): string {
    try {
      const { getDb } = require('./database');
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'portal_cliente_url'").get() as any;
      if (row && row.valor && row.valor.trim() !== '') {
        return row.valor.trim();
      }
    } catch (err) {
      console.error('[PrinterService] Erro ao ler URL do portal:', err);
    }
    // Fallback: usa a rota local (funciona via Wi-Fi da loja)
    return 'http://localhost:3000/#/cliente';
  }

  async printTicket(data: TicketData): Promise<boolean> {
    if (this.simulationMode) {
      return this.printSimulation(data);
    }
    return this.printReal(data);
  }

  private async printReal(data: TicketData): Promise<boolean> {
    console.log(`[PrinterService] Preparando ticket (Modo Nativo) para: ${this.config.interface}`);
    
    return new Promise((resolve, reject) => {
      try {
        this.initPrintWindow();
        
        let logoHtml = '';
        if (this.config.logoPath && fs.existsSync(this.config.logoPath)) {
          // Converte o caminho local para URL que o browser entenda
          const logoUrl = `file:///${this.config.logoPath.replace(/\\/g, '/')}`;
          logoHtml = `<img src="${logoUrl}" class="logo" />`;
        }

        const largura = this.config.width === 32 ? '58mm' : '80mm';

        // Layout otimizado para Impressoras Térmicas (Custom K80, Epson, etc)
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              width: ${largura}; 
              margin: 0; 
              padding: 10px 5px; 
              text-align: center; 
              color: black; 
              box-sizing: border-box;
            }
            .balcao { font-weight: bold; font-size: 20px; text-transform: uppercase; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
            .numero { font-weight: 900; font-size: 60px; margin: 10px 0; letter-spacing: 2px; }
            .tipo { font-weight: bold; font-size: 18px; margin-bottom: 10px; padding: 5px; border-radius: 5px; border: 2px solid black; }
            .preferencial { background: black; color: white; }
            .data { font-size: 14px; margin-bottom: 10px; font-weight: 600; }
            .footer { font-size: 12px; border-top: 1px dashed black; padding-top: 10px; margin-top: 10px; }
            .logo { max-width: 80%; max-height: 100px; object-fit: contain; margin-bottom: 10px; }
            .qr-container { margin-top: 15px; border-top: 2px dashed black; padding-top: 15px; }
            .qr-title { font-weight: 900; font-size: 14px; margin-bottom: 5px; text-transform: uppercase; }
            .qr-text { font-size: 12px; margin-bottom: 10px; font-weight: 600; line-height: 1.2; }
            .qr-code { width: 120px; height: 120px; margin-bottom: 5px; }
            .qr-obs { font-size: 10px; font-weight: bold; padding: 0 5px; border-bottom: 1px solid black; padding-bottom: 10px; }
          </style>
          </head>
          <body>
            ${logoHtml}
            <div class="balcao">${data.balcao}</div>
            <div class="numero">${data.numero}</div>
            <div class="tipo ${data.preferencial ? 'preferencial' : ''}">${data.preferencial ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'}</div>
            <div class="data">${data.data}</div>

            <div class="qr-container">
              <div class="qr-title">Já sabe o que você vai precisar? Não sabe?!</div>
              <p class="qr-text">Escaneie o QR Code abaixo e tenha acesso à lista de produtos de hoje do seu celular!</p>
              <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${
                encodeURIComponent((() => {
                  const base = this.getPortalUrl();
                  const tId = data.ticketId || (data as any).id || '';
                  if (base.includes('#')) return base + '?ticket=' + tId;
                  return base.endsWith('/') ? base + '#/?ticket=' + tId : base + '/#/?ticket=' + tId;
                })())
              }" alt="QR Code Portal do Cliente" />
              <div class="qr-obs">* Os valores pre-selecionados são válidos no dia (data atual) e podem haver alterações da balança sem aviso prévio.</div>
            </div>
            <div class="footer">${this.config.footer}</div>
          </body>
          </html>
        `;

        this.printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        this.printWindow.webContents.once('did-finish-load', async () => {
          try {
            // Calcula a altura real do conteúdo em pixels
            const heightPx = await this.printWindow.webContents.executeJavaScript('document.body.offsetHeight');
            
            // Converte pixels para mícrons (1 pixel ≈ 264.583 mícrons a 96 DPI)
            // Adicionamos 40px extras de margem para o corte não pegar no texto
            const heightMicrons = Math.ceil((heightPx + 40) * 264.583);
            const widthMicrons = this.config.width === 32 ? 58000 : 80000;

            this.printWindow.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: this.config.interface,
              margins: { marginType: 'none' },
              pageSize: { width: widthMicrons, height: heightMicrons }
            }, (success: boolean, failureReason: any) => {
              if (!success) {
                console.error('[PrinterService] ❌ Falha na impressão:', failureReason);
                reject(new Error(`A impressora '${this.config.interface}' rejeitou o documento. Verifique se ela está online.`));
              } else {
                console.log(`[PrinterService] ✅ Enviado com sucesso via Driver Nativo. Altura do papel calculada: ${heightPx}px`);
                resolve(true);
              }
            });
          } catch (e: any) {
            console.error('[PrinterService] Erro ao processar tamanho do ticket:', e);
            reject(new Error('Erro interno ao calcular tamanho do papel.'));
          }
        });
      } catch (err: any) {
        console.error('[PrinterService] Erro geral:', err);
        reject(err);
      }
    });
  }

  private printSimulation(data: TicketData): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('\n[ SIMULAÇÃO ] Senha: ' + data.numero + '\n');
      resolve(true);
    });
  }
}
