export interface ElectronAPI {
  printTicket: (data: {
    ticketId?: number;
    numero: string;
    balcao: string;
    data: string;
    preferencial: boolean;
    logo?: string;
    mostraEncarte?: boolean;
  }) => Promise<boolean>;
  updatePrinterConfig: (config: any) => Promise<any>;
  testPrinter: () => Promise<boolean>;
  ping: () => string;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
