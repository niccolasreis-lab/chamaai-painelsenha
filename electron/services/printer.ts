import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';

const execAsync = promisify(exec);

export interface TicketData {
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
          </style>
          </head>
          <body>
            ${logoHtml}
            <div class="balcao">${data.balcao}</div>
            <div class="numero">${data.numero}</div>
            <div class="tipo ${data.preferencial ? 'preferencial' : ''}">${data.preferencial ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'}</div>
            <div class="data">${data.data}</div>
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
