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
  mostraEncarte?: boolean;
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

// Cache de configurações de impressão (TTL: 30 segundos)
let printConfigCache: { data: Record<string, string>; timestamp: number } | null = null;
const PRINT_CACHE_TTL = 30000; // 30 segundos

function getPrintConfig(): Record<string, string> {
  const now = Date.now();
  if (printConfigCache && (now - printConfigCache.timestamp) < PRINT_CACHE_TTL) {
    return printConfigCache.data;
  }
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const rows = db.prepare("SELECT chave, valor FROM configuracoes WHERE chave IN ('print_logo', 'print_escrita', 'print_qrcode')").all() as any[];
    const config = rows.reduce((acc: any, row: any) => ({ ...acc, [row.chave]: row.valor }), {});
    printConfigCache = { data: config, timestamp: now };
    return config;
  } catch (err) {
    console.error('[PrinterService] Erro ao ler configurações de impressão:', err);
    return {};
  }
}

export class PrinterService {
  private config: PrinterConfig;
  private simulationMode: boolean;
  private printWindow: any = null;
  private lastPrintedTicket: TicketData | null = null;

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

  private isEncarteAtivo(): boolean {
    try {
      const { getDb } = require('./database');
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'toledo_encarte_ativo'").get() as any;
      if (row && row.valor) {
        return row.valor === '1';
      }
    } catch (err) {
      console.error('[PrinterService] Erro ao ler toledo_encarte_ativo:', err);
    }
    return false; // Default to not showing if not explicitly enabled
  }

  async printTicket(data: TicketData): Promise<{ success: boolean; error?: string }> {
    this.lastPrintedTicket = data;
    if (this.simulationMode) {
      return this.printSimulation(data);
    }
    return this.printReal(data);
  }

  async reprintLastTicket(): Promise<{ success: boolean; error?: string }> {
    if (!this.lastPrintedTicket) {
      return { success: false, error: 'Nenhum ticket anterior para reimprimir.' };
    }
    console.log('[PrinterService] 🔄 Reimprimindo último ticket:', this.lastPrintedTicket.numero);
    if (this.simulationMode) {
      return this.printSimulation(this.lastPrintedTicket);
    }
    return this.printReal(this.lastPrintedTicket);
  }

  private async printReal(data: TicketData): Promise<{ success: boolean; error?: string }> {
    console.log(`[PrinterService] Preparando ticket (Modo Nativo) para: ${this.config.interface}`);

    return new Promise((resolve) => {
      try {
        this.initPrintWindow();

        // Tenta carregar o logo do cliente atualizado direto do banco e converter para base64 (evita restrições de CORS/Same-Origin do Chromium em data URLs)
        // Consultar flags de impressão com cache
        const printFlags = getPrintConfig();

        let logoHtml = '';
        if (printFlags.print_logo !== '0') {
          try {
            const { getDb } = require('./database');
            const db = getDb();
            const logoRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'logo_cliente'").get() as any;
            if (logoRow && logoRow.valor) {
              const relativePath = logoRow.valor.replace(/^\//, ''); // remove barra inicial se existir
              const absolutePath = path.join('C:\\ChamaAi', relativePath);
              if (fs.existsSync(absolutePath)) {
                const base64 = fs.readFileSync(absolutePath, 'base64');
                const ext = path.extname(absolutePath).toLowerCase().replace('.', '');
                const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
                const dataUrl = `data:${mimeType};base64,${base64}`;
                logoHtml = `<img src="${dataUrl}" class="logo" />`;
              }
            }
          } catch (e) {
            console.error('[PrinterService] Erro ao carregar logo_cliente do banco:', e);
          }

          // Se não achou logo_cliente ou não existe o arquivo, usa o logoPath de fallback da config convertido para base64
          if (!logoHtml && this.config.logoPath && fs.existsSync(this.config.logoPath)) {
            try {
              const base64 = fs.readFileSync(this.config.logoPath, 'base64');
              const ext = path.extname(this.config.logoPath).toLowerCase().replace('.', '');
              const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
              const dataUrl = `data:${mimeType};base64,${base64}`;
              logoHtml = `<img src="${dataUrl}" class="logo" />`;
            } catch (e) {
              console.error('[PrinterService] Erro ao carregar logoPath de fallback:', e);
            }
          }
        }

        // Tenta carregar o nome do estabelecimento atualizado direto do banco
        let nomeEstabelecimento = '';
        try {
          const { getDb } = require('./database');
          const db = getDb();
          const nomeRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nome_estabelecimento'").get() as any;
          if (nomeRow && nomeRow.valor) {
            nomeEstabelecimento = nomeRow.valor.trim();
          }
        } catch (e) {
          console.error('[PrinterService] Erro ao carregar nome_estabelecimento do banco:', e);
        }

        const tituloEstabelecimento = nomeEstabelecimento || data.balcao || 'ChamaAí';
        const mostrarEscrita = printFlags.print_escrita !== '0';
        const largura = this.config.width === 32 ? '58mm' : '80mm';
        const mostraQRCode = printFlags.print_qrcode !== '0';

        // Monta a URL do QR Code fora do template literal para evitar problemas com 'this'
        let qrCodeUrl = '';
        if (mostraQRCode) {
          const portalBase = this.getPortalUrl();
          const tId = data.ticketId || (data as any).id || '';
          let portalComTicket: string;
          if (portalBase.includes('#')) {
            portalComTicket = portalBase + '?ticket=' + tId;
          } else {
            portalComTicket = portalBase.endsWith('/')
              ? portalBase + '#/?ticket=' + tId
              : portalBase + '/#/?ticket=' + tId;
          }
          qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(portalComTicket)}`;
        }

        // Layout otimizado para Impressoras Térmicas (Custom K80, Epson, etc)
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              background: white;
              overflow: hidden;
            }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              width: ${largura}; 
              text-align: center; 
              color: black; 
            }
            #ticket-content {
              padding: 0px 5px 10px 5px; /* Sem padding no topo */
              display: block;
              width: 100%;
              margin: 0;
            }
            .balcao { font-weight: 900; font-size: 22px; text-transform: uppercase; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; margin-top: 5px; }
            .numero { font-weight: 900; font-size: 64px; margin: 5px 0 10px 0; letter-spacing: 2px; line-height: 1; }
            .tipo { font-weight: 900; font-size: 20px; margin-bottom: 10px; padding: 6px; border-radius: 5px; border: 2px solid black; }
            .preferencial { background: black; color: white; }
            .data { font-size: 16px; margin-bottom: 10px; font-weight: 900; }
            .footer { font-size: 14px; font-weight: bold; border-top: 2px dashed black; padding-top: 10px; margin-top: 10px; padding-bottom: 5px; }
            .logo { max-width: 80%; max-height: 100px; object-fit: contain; margin-bottom: 5px; margin-top: 5px; }
            .qr-container { margin-top: 6px; border-top: 2px dashed black; padding-top: 6px; }
            .qr-text { font-size: 11px; margin-bottom: 4px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
            .qr-code { width: 90px; height: 90px; margin-bottom: 2px; display: inline-block; }
            .qr-obs { font-size: 9px; font-weight: bold; margin-top: 1px; }
          </style>
          </head>
          <body>
            <div id="ticket-content">
              ${logoHtml}
              ${mostrarEscrita ? `<div class="balcao">${tituloEstabelecimento}</div>` : ''}
              <div class="numero">${data.numero}</div>
              <div class="tipo ${data.preferencial ? 'preferencial' : ''}">${data.preferencial ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'}</div>
              <div class="data">${data.data}</div>

              ${mostraQRCode ? `
              <div class="qr-container">
                <div class="qr-text">Confira Nossas Ofertas:</div>
                <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
                <div class="qr-obs">* Preços válidos para hoje.</div>
              </div>
              ` : ''}
              <div class="footer">${this.config.footer}</div>
            </div>
          </body>
          </html>
        `;

        this.printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        this.printWindow.webContents.once('did-finish-load', async () => {
          try {
            // Aguarda o carregamento das imagens (Logo e QR Code) para obter a altura exata
            await this.printWindow.webContents.executeJavaScript(`
              new Promise((resolve) => {
                const imgs = document.querySelectorAll('img');
                if (imgs.length === 0) return resolve(true);
                let loaded = 0;
                imgs.forEach(img => {
                  if (img.complete) { loaded++; }
                  else {
                    img.addEventListener('load', () => { loaded++; if (loaded === imgs.length) resolve(true); });
                    img.addEventListener('error', () => { loaded++; if (loaded === imgs.length) resolve(true); });
                  }
                });
                if (loaded === imgs.length) resolve(true);
              })
            `);

            // Calcula a altura real do conteúdo em pixels
            const heightPx = await this.printWindow.webContents.executeJavaScript("document.getElementById('ticket-content').offsetHeight");

            // Converte pixels para mícrons (1 pixel ≈ 264.583 mícrons a 96 DPI)
            // Adicionamos apenas 15px extras de margem de segurança para o corte exato
            const heightMicrons = Math.ceil((heightPx + 15) * 264.583);
            const widthMicrons = this.config.width === 32 ? 58000 : 80000;

            this.printWindow.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: this.config.interface,
              margins: { marginType: 'none' },
              pageSize: {
                width: widthMicrons,
                height: heightMicrons
              }
            }, (success: boolean, failureReason: any) => {
              if (!success) {
                console.error('[PrinterService] ❌ Falha na impressão:', failureReason);
                resolve({ success: false, error: `A impressora '${this.config.interface}' rejeitou o documento. Verifique se ela está online e com papel.` });
              } else {
                console.log(`[PrinterService] ✅ Enviado com sucesso via Driver Nativo.`);
                resolve({ success: true });
              }
            });
          } catch (e: any) {
            console.error('[PrinterService] Erro ao processar tamanho do ticket:', e);
            resolve({ success: false, error: 'Erro interno ao calcular tamanho do papel.' });
          }
        });
      } catch (err: any) {
        console.error('[PrinterService] Erro geral:', err);
        resolve({ success: false, error: err.message || 'Erro desconhecido na impressora.' });
      }
    });
  }

  private printSimulation(data: TicketData): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      console.log('\n[ SIMULAÇÃO ] Senha: ' + data.numero + '\n');
      resolve({ success: true });
    });
  }
}
