export interface ElectronAPI {
  printTicket: (data: {
    ticketId?: number;
    numero: string;
    balcao: string;
    data: string;
    preferencial: boolean;
    logo?: string;
    mostraEncarte?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  reprintLastTicket: () => Promise<{ success: boolean; error?: string }>;
  updatePrinterConfig: (config: any) => Promise<any>;
  testPrinter: () => Promise<boolean>;
  getPrinters: () => Promise<any[]>;
  getPrinterConfig: () => Promise<any>;
  setAutoLaunch: (enable: boolean, route: string) => Promise<any>;
  createShortcut: (route: string, title: string) => Promise<any>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ success: boolean; message: string }>;
  installUpdate: () => Promise<{ success: boolean; message?: string }>;
  ping: () => string;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
