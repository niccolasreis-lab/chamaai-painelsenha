import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initDatabase, getDb } from './services/database';
import { startServer } from '../server/index';
import { PrinterService, PrinterConfig } from './services/printer';
import { autoUpdater } from 'electron-updater';

// Disable node integration in all webcontents for security
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
  });
});

let mainWindow: BrowserWindow | null = null;
let printerService: PrinterService;

/** Carrega config de impressora do banco */
function loadPrinterConfig(): Partial<PrinterConfig> {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'impressora_%'").all() as any[];
    const cfg: any = {};
    for (const r of rows) {
      const key = r.chave.replace('impressora_', '');
      cfg[key] = r.valor;
    }
    // Resolve logo path
    if (cfg.logoPath && !cfg.logoPath.startsWith('/') && !cfg.logoPath.startsWith('C:')) {
      let userDataPath;
      try { userDataPath = app.getPath('userData'); } catch { userDataPath = '.'; }
      cfg.logoPath = path.join(userDataPath, cfg.logoPath);
    }
    return {
      interface: cfg.interface || '',
      type: cfg.type || 'EPSON',
      width: parseInt(cfg.width || '48'),
      footer: cfg.footer || 'Obrigado pela preferência!',
      logoPath: cfg.logoPath || '',
    };
  } catch {
    return {};
  }
}

function createWindow() {
  // Initialize printer with DB config
  const printerCfg = loadPrinterConfig();
  printerService = new PrinterService(printerCfg);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // Detect route from command line arguments (e.g. --telao, --totem)
  // We use .slice(1) because the first arg is the executable path
  const args = process.argv.slice(1);
  let route = '';
  if (args.includes('--telao')) route = 'telao';
  else if (args.includes('--totem')) route = 'totem';
  else if (args.includes('--operador')) route = 'operador';
  else if (args.includes('--operador-touch')) route = 'operador-touch';
  else if (args.includes('--admin')) route = 'admin';

  // Load the local URL for development or the local file for production
  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../../dist/index.html');
    mainWindow.loadFile(indexPath, { hash: route }).catch(err => {
      console.error('Failed to load local file:', err);
    });
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const base = devUrl || 'http://localhost:5173';
    mainWindow.loadURL(`${base}#/${route}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit(); // Garante que todos os processos ocultos (ex: impressora) sejam finalizados
  });
}

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  const { dialog } = require('electron');
  dialog.showErrorBox('Erro no Processo Principal', error.message || String(error));
});

// Register IPC Handlers
ipcMain.handle('print-ticket', async (_event, data) => {
  return await printerService.printTicket(data);
});

ipcMain.handle('update-printer-config', async (_event, newConfig) => {
  printerService.updateConfig(newConfig);
  return { success: true };
});

ipcMain.handle('set-auto-launch', async (_event, { enable, route }) => {
  const exePath = process.execPath;
  const args = route ? [`--${route}`] : [];
  
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: exePath,
    args: args
  });
  return { success: true };
});

ipcMain.handle('create-shortcut', async (_event, { route, title }) => {
  const { app, shell } = require('electron');
  const path = require('path');
  const desktopPath = app.getPath('desktop');
  const shortcutPath = path.join(desktopPath, `${title}.lnk`);
  
  const exePath = process.execPath;
  
  const success = shell.writeShortcutLink(shortcutPath, {
    target: exePath,
    args: `--${route}`,
    cwd: path.dirname(exePath),
    description: `Abre o ChamaAí diretamente na tela do ${title}`,
    appUserModelId: 'com.chamaai.app'
  });
  
  return { success, path: shortcutPath };
});

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('test-printer', async () => {
  return await printerService.printTicket({
    numero: '000',
    balcao: 'TESTE DE IMPRESSÃO',
    data: new Date().toLocaleString('pt-BR'),
    preferencial: false,
  });
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // Lê os argumentos passados pelo atalho clicado e redireciona a tela
      let newRoute = '';
      if (commandLine.includes('--telao')) newRoute = 'telao';
      else if (commandLine.includes('--totem')) newRoute = 'totem';
      else if (commandLine.includes('--admin')) newRoute = 'admin';
      
      if (newRoute) {
        if (app.isPackaged) {
          const indexPath = require('path').join(__dirname, '../../dist/index.html');
          mainWindow.loadFile(indexPath, { hash: newRoute });
        } else {
          const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
          mainWindow.loadURL(`${devUrl}#/${newRoute}`);
        }
      }
    }
  });

  app.whenReady().then(async () => {
    try {
      console.log('Initializing system...');
      initDatabase();
      startServer();
      createWindow();

      // Inicializa o verificador de atualizações silencioso
      if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
          console.error('Erro ao verificar atualizações:', err);
        });
        
        autoUpdater.on('update-downloaded', () => {
          console.log('Atualização baixada. Instalando no fechamento do app.');
        });
      }
    } catch (err: any) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Erro na Inicialização', err.message || String(err));
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
