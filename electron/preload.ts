import { contextBridge, ipcRenderer } from 'electron';

// Encaminha erros globais e rejeições de promessa não tratadas para o processo principal
window.addEventListener('error', (event) => {
  ipcRenderer.send('renderer-error', {
    type: 'error',
    message: event.message,
    source: event.filename,
    line: event.lineno,
    col: event.colno,
    error: event.error ? event.error.stack : null
  });
});

window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.send('renderer-error', {
    type: 'rejection',
    message: event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection',
    error: event.reason ? event.reason.stack : null
  });
});

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
  checkUpdateStatus: () => ipcRenderer.invoke('check-update-status'),
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
  ping: () => 'pong',
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  LOCAL_APP_NO_LOGIN: typeof process !== 'undefined' ? (process.env.LOCAL_APP_NO_LOGIN === 'true' || process.env.LOCAL_APP_NO_LOGIN === '1') : false
});

