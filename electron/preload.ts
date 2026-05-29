import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
  printTicket: (data: any) => ipcRenderer.invoke('print-ticket', data),
  reprintLastTicket: () => ipcRenderer.invoke('reprint-last-ticket'),
  updatePrinterConfig: (config: any) => ipcRenderer.invoke('update-printer-config', config),
  testPrinter: () => ipcRenderer.invoke('test-printer'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
  setAutoLaunch: (enable: boolean, route: string) => ipcRenderer.invoke('set-auto-launch', { enable, route }),
  createShortcut: (route: string, title: string) => ipcRenderer.invoke('create-shortcut', { route, title }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  killZombieProcesses: () => ipcRenderer.invoke('kill-zombie-processes'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-available', subscription);
    return () => { ipcRenderer.off('update-available', subscription); };
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', subscription);
    return () => { ipcRenderer.off('update-downloaded', subscription); };
  },
  onDownloadProgress: (callback: (progress: any) => void) => {
    const subscription = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('download-progress', subscription);
    return () => { ipcRenderer.off('download-progress', subscription); };
  },
  onUpdateError: (callback: (error: any) => void) => {
    const subscription = (_event: any, error: any) => callback(error);
    ipcRenderer.on('update-error', subscription);
    return () => { ipcRenderer.off('update-error', subscription); };
  },
  ping: () => 'pong'
});
