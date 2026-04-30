import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  printTicket: (data: any) => ipcRenderer.invoke('print-ticket', data),
  updatePrinterConfig: (config: any) => ipcRenderer.invoke('update-printer-config', config),
  testPrinter: () => ipcRenderer.invoke('test-printer'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setAutoLaunch: (enable: boolean, route: string) => ipcRenderer.invoke('set-auto-launch', { enable, route }),
  createShortcut: (route: string, title: string) => ipcRenderer.invoke('create-shortcut', { route, title }),
  ping: () => 'pong'
});
