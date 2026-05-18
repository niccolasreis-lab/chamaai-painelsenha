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

        // Tenta carregar o logo do cliente atualizado direto do banco
        let logoHtml = '';
        try {
          const { getDb } = require('./database');
          const db = getDb();
          const logoRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'logo_cliente'").get() as any;
          if (logoRow && logoRow.valor) {
            const relativePath = logoRow.valor.replace(/^\//, ''); // remove barra inicial se existir
            const absolutePath = path.join('C:\\ChamaAi', relativePath);
            if (fs.existsSync(absolutePath)) {
              const logoUrl = `file:///${absolutePath.replace(/\\/g, '/')}`;
              logoHtml = `<img src="${logoUrl}" class="logo" />`;
            }
          }
        } catch (e) {
          console.error('[PrinterService] Erro ao carregar logo_cliente do banco:', e);
        }

        // Se não achou logo_cliente ou não existe o arquivo, usa o logoPath de fallback da config
        if (!logoHtml && this.config.logoPath && fs.existsSync(this.config.logoPath)) {
          const logoUrl = `file:///${this.config.logoPath.replace(/\\/g, '/')}`;
          logoHtml = `<img src="${logoUrl}" class="logo" />`;
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
        const largura = this.config.width === 32 ? '58mm' : '80mm';
        const mostraEncarte = this.isEncarteAtivo();

        // Layout otimizado para Impressoras Térmicas (Custom K80, Epson, etc)
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; padding: 0; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              min-height: 0;
              height: auto;
              background: white;
              overflow: hidden;
            }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              width: ${largura}; 
              text-align: center; 
              color: black; 
              position: absolute;
              top: 0;
              left: 0;
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
            .qr-container { margin-top: 10px; border-top: 2px dashed black; padding-top: 10px; }
            .qr-title { font-weight: 900; font-size: 16px; margin-bottom: 5px; text-transform: uppercase; }
            .qr-text { font-size: 14px; margin-bottom: 5px; font-weight: bold; line-height: 1.2; }
            .qr-code { width: 130px; height: 130px; margin-bottom: 5px; display: inline-block; }
            .qr-obs { font-size: 12px; font-weight: bold; padding: 0 5px; border-bottom: 2px solid black; padding-bottom: 10px; }
          </style>
          </head>
          <body>
            <div id="ticket-content">
              ${logoHtml}
              <div class="balcao">${tituloEstabelecimento}</div>
              <div class="numero">${data.numero}</div>
              <div class="tipo ${data.preferencial ? 'preferencial' : ''}">${data.preferencial ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'}</div>
              <div class="data">${data.data}</div>

              ${mostraEncarte ? `
              <div class="qr-container">
                <div class="qr-title">Confira os valores do dia</div>
                <p class="qr-text">Escaneie o QR Code para ver<br>preços e ofertas no celular.</p>
                <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent((() => {
                  const base = this.getPortalUrl();
                  const tId = data.ticketId || (data as any).id || '';
                  if (base.includes('#')) return base + '?ticket=' + tId;
                  return base.endsWith('/') ? base + '#/?ticket=' + tId : base + '/#/?ticket=' + tId;
                })())
                }" alt="QR Code Portal do Cliente" />
                <div class="qr-obs">Preços válidos para hoje e sujeitos<br>a alterações sem aviso prévio.</div>
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
              margins: { marginType: 'none' }
              // REMOVED pageSize to allow the Windows Thermal Driver to auto-size the roll paper
            }, (success: boolean, failureReason: any) => {
              if (!success) {
                console.error('[PrinterService] ❌ Falha na impressão:', failureReason);
                reject(new Error(`A impressora '${this.config.interface}' rejeitou o documento. Verifique se ela está online.`));
              } else {
                console.log(`[PrinterService] ✅ Enviado com sucesso via Driver Nativo.`);
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
