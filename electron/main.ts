import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load default .env from current working directory
dotenv.config();

// Try loading from the persistent data directory C:\ChamaAi\.env
const prodEnvPath = 'C:\\ChamaAi\\.env';
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath });
}

import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { initDatabase, getDb, closeDatabase } from './services/database';
import { startServer, stopServer } from '../server/index';
import { PrinterService, PrinterConfig } from './services/printer';
import { autoUpdater } from 'electron-updater';
import { launchSafeMode, resetSafeModeCounter } from './services/safemode';
import { writeRecoveryLog } from './services/recovery';

// Watchdog State
let watchdogWarn: NodeJS.Timeout;
let watchdogAction: NodeJS.Timeout;
let reloadAttempts = 0;
const isDev = !app.isPackaged;

function startWatchdog() {
  clearWatchdog();
  watchdogWarn = setTimeout(() => {
    console.warn('[WATCHDOG] Renderer demorando a responder...');
  }, isDev ? 30000 : 15000);

  watchdogAction = setTimeout(() => {
    if (reloadAttempts === 0) {
      console.warn('[WATCHDOG] Tentando recarregar mainWindow...');
      reloadAttempts++;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
      startWatchdog(); // Reinicia o ciclo após recarregar
    } else {
      console.error('[WATCHDOG] Falha crítica de UI contínua. Entrando em Safe Mode.');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      launchSafeMode('Timeout crítico de renderização', undefined, 'renderer_timeout');
    }
  }, isDev ? 60000 : 30000);
}

function clearWatchdog() {
  clearTimeout(watchdogWarn);
  clearTimeout(watchdogAction);
}

function isVersionGreater(remote: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

ipcMain.on('renderer-ready', (event) => {
  console.log('[WATCHDOG] renderer-ready recebido de sender ID:', event.sender.id, 'mainWindow ID:', mainWindow?.webContents?.id);
  if (mainWindow && event.sender.id === mainWindow.webContents.id) {
    clearWatchdog();
    reloadAttempts = 0;
    resetSafeModeCounter(['renderer_timeout']);
  }
});

function logUpdate(level: 'INFO' | 'WARN' | 'ERROR', message: string) {
  try {
    const updateLogPath = 'C:\\ChamaAi\\autoupdate.log';
    const logMsg = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    console.log(`[UPDATE] [${level}]`, message);
    if (fs.existsSync(updateLogPath)) {
      const stats = fs.statSync(updateLogPath);
      if (stats.size > 5 * 1024 * 1024) {
        try { if (fs.existsSync(`${updateLogPath}.bak`)) fs.unlinkSync(`${updateLogPath}.bak`); } catch(e) {}
        fs.renameSync(updateLogPath, `${updateLogPath}.bak`);
      }
    } else {
      const parentDir = path.dirname(updateLogPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }
    fs.appendFileSync(updateLogPath, logMsg, 'utf8');
  } catch (e) {}
}


// Disable hardware acceleration to avoid GPU process crashes (common in VMs, RDP, or old/missing drivers)
app.disableHardwareAcceleration();

// Disable GPU and sandboxing to allow running correctly from mapped network drives (e.g. Z:\)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// Disable node integration in all webcontents for security
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
  });
});

// Otimizações de performance exclusivas para o Totem (Hardwares limitados)
const isTotemEarly = process.argv.some(arg => arg.includes('--totem'));
if (isTotemEarly) {
  // Desativa isolamento de segurança que consome muita RAM
  app.commandLine.appendSwitch('disable-site-isolation-trials');
  // Desativa scroll suave para melhorar resposta da tela de toque
  app.commandLine.appendSwitch('disable-smooth-scrolling');
  // Limita o coletor de lixo de RAM para 512MB
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  // Evita cálculos desnecessários de oclusão de janela do Windows
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

// Configurações globais de mídia e performance para evitar pausas
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// Ignora erros de SSL causados pelo certificado autoassinado do Vite/mkcert
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow: BrowserWindow | null = null;
let printerService: PrinterService;
let isQuitting = false;
let isUpdating = false;
let shutdownStarted = false;
let isServerStopped = false;
let updateDownloadedInfo: any = null;

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
      const userDataPath = 'C:\\ChamaAi';
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

/** Busca caminho personalizado para atualizações locais/offline */
function getCustomUpdatePath(): string | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'update_path'").get() as any;
    if (row && row.valor) {
      // Verifica se o path personalizado contém latest.yml
      const customYml = path.join(row.valor, 'latest.yml');
      if (fs.existsSync(customYml)) {
        return row.valor;
      }
    }
  } catch (e) {}

  // Fallback: pasta padrão local — só ativa se latest.yml existir dentro dela
  const defaultLocalPath = 'C:\\ChamaAi_Atualizacoes';
  const defaultYml = path.join(defaultLocalPath, 'latest.yml');
  if (fs.existsSync(defaultYml)) {
    return defaultLocalPath;
  }
  return null;
}

function sendToAllWindows(channel: string, ...args: any[]) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  });
}

function createSafeModeWindow(errorMsg?: string) {
  launchSafeMode(errorMsg || 'Erro desconhecido', undefined, 'unknown');
}

function createWindow(customRoute?: string) {
  // Initialize printer with DB config
  if (!printerService) {
    const printerCfg = loadPrinterConfig();
    printerService = new PrinterService(printerCfg);
  }

  const newWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // Captura logs do console do renderer e imprime no terminal para depuração rápida
  newWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    console.log(`[RENDERER ${levels[level] || 'LOG'}] ${message} (${path.basename(sourceId)}:${line})`);
  });

  // Captura falhas de carregamento de recursos/páginas
  newWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[RENDERER FAILED LOAD] Code: ${errorCode}, Description: ${errorDescription}, URL: ${validatedURL}`);
  });

  newWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`[RENDERER CRASH] Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });

  newWindow.webContents.on('dom-ready', () => {
    console.log('[RENDERER] dom-ready disparado');
  });

  newWindow.webContents.on('did-finish-load', () => {
    console.log('[RENDERER] did-finish-load disparado');
  });

  try {
    newWindow.webContents.on('preload-error', (event, preloadPath, error) => {
      console.error(`[PRELOAD ERROR] Path: ${preloadPath}, Error:`, error);
    });
  } catch (e) {}

  if (!mainWindow) {
    mainWindow = newWindow;
  }

  // Detect route from command line arguments or custom parameter
  let route = customRoute || '';
  if (customRoute === undefined) {
    const args = process.argv.slice(1);
    if (args.includes('--telao')) route = 'telao';
    else if (args.includes('--totem')) route = 'totem';
    else if (args.includes('--operador')) route = 'operador';
    else if (args.includes('--operador-touch')) route = 'operador-touch';
    else if (args.includes('--admin')) route = 'admin';
  }

  const isTotem = route === 'totem';
  const isTelao = route === 'telao';

  if (isTotem) {
    newWindow.setKiosk(true);
    newWindow.setAlwaysOnTop(true, 'screen-saver');

    // Blindagem de teclas (Kiosk Mode Restrito)
    globalShortcut.register('CommandOrControl+W', () => { console.log('[BLINDAGEM] Bloqueado: Ctrl+W'); });
    globalShortcut.register('CommandOrControl+Q', () => { console.log('[BLINDAGEM] Bloqueado: Ctrl+Q'); });
    globalShortcut.register('CommandOrControl+Shift+I', () => { console.log('[BLINDAGEM] Bloqueado: DevTools'); });
    globalShortcut.register('Alt+F4', () => { console.log('[BLINDAGEM] Bloqueado: Alt+F4'); });
    
    // Força o foco de volta se o usuário tentar abrir o menu iniciar ou alt+tab
    newWindow.on('blur', () => {
      setTimeout(() => {
        if (newWindow && !newWindow.isDestroyed() && !newWindow.isFocused()) {
          newWindow.focus();
        }
      }, 100);
    });
  } else if (isTelao) {
    newWindow.setFullScreen(true);
  }

  // Load the local URL for development or the local file for production
  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../../dist/index.html');
    newWindow.loadFile(indexPath, { hash: route }).catch(err => {
      console.error('Failed to load local file:', err);
    });
  } else {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const base = devUrl || 'http://localhost:5175';
    newWindow.loadURL(`${base}#/${route}`).then(() => {
      newWindow.webContents.openDevTools();
    }).catch(err => {
      console.error('Failed to load dev URL:', err);
    });
  }

  newWindow.on('closed', () => {
    clearWatchdog();
    if (newWindow === mainWindow) {
      mainWindow = null;
    }
    const visibleWindows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed() && win.isVisible() && win !== newWindow);
    if (visibleWindows.length === 0) {
      console.log('[SYSTEM] Todas as janelas visíveis foram fechadas. Chamando gracefulShutdown...');
      gracefulShutdown('user_close');
    }
  });

  startWatchdog();
}

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  const { dialog } = require('electron');
  try {
    dialog.showErrorBox('Erro no Processo Principal', error.message || String(error));
  } catch (e) {}
  app.exit(1);
});

ipcMain.on('renderer-error', (_event, data) => {
  console.error('[RENDERER EXCEPTION]', data);
});

// Register IPC Handlers
ipcMain.handle('print-ticket', async (_event, data) => {
  return await printerService.printTicket(data);
});

ipcMain.handle('reprint-last-ticket', async () => {
  return await printerService.reprintLastTicket();
});

ipcMain.handle('update-printer-config', async (_event, newConfig) => {
  try {
    const db = getDb();
    const stmt = db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))");
    if (newConfig.interface !== undefined) stmt.run('impressora_interface', String(newConfig.interface));
    if (newConfig.type !== undefined) stmt.run('impressora_type', String(newConfig.type));
    if (newConfig.width !== undefined) stmt.run('impressora_width', String(newConfig.width));
    if (newConfig.footer !== undefined) stmt.run('impressora_footer', String(newConfig.footer));
    if (newConfig.logoPath !== undefined) stmt.run('impressora_logoPath', String(newConfig.logoPath));
    console.log('[ELECTRON] Configurações de impressora salvas localmente no banco de dados SQLite.');
  } catch (err) {
    console.error('[ELECTRON] Erro ao salvar configurações de impressora localmente:', err);
  }
  
  printerService.updateConfig(newConfig);
  return { success: true };
});

ipcMain.handle('get-printer-config', async () => {
  return loadPrinterConfig();
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
    description: `Abre o ChamaAi diretamente na tela do ${title}`,
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

ipcMain.handle('check-update-status', async () => {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT,
      atualizado_em TEXT
    )`);
    const currentVersion = app.getVersion();
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'versao_registrada'").get() as any;
    let justUpdated = false;
    let previousVersion = null;
    if (row && row.valor) {
      previousVersion = row.valor;
      if (previousVersion !== currentVersion) {
        justUpdated = true;
      }
    } else {
      // Se não houver versão anterior registrada, significa que o usuário
      // estava em uma versão antiga (ex: 1.0.101) e acaba de atualizar para a 1.0.102!
      justUpdated = true;
      previousVersion = "1.0.101";
    }
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('versao_registrada', ?, datetime('now'))").run(currentVersion);
    return {
      justUpdated,
      previousVersion,
      currentVersion
    };
  } catch (err) {
    console.error('[UPDATE STATUS] Erro ao verificar status de atualização:', err);
    return { justUpdated: false, currentVersion: app.getVersion() };
  }
});


ipcMain.handle('check-for-updates', async () => {
  const isPackagedOrTesting = app.isPackaged || fs.existsSync(path.join(app.getAppPath(), 'dev-app-update.yml'));
  if (!isPackagedOrTesting) return { success: false, message: 'Atualizações só funcionam no aplicativo instalado (.exe).' };
  try {
    if (updateDownloadedInfo) {
      return { success: true, updateDownloaded: true, info: updateDownloadedInfo };
    }
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      if (!isVersionGreater(result.updateInfo.version, app.getVersion())) {
         return { success: true, message: 'Você já está usando a versão mais recente!', isLatest: true };
      }
      return { success: true, updateAvailable: true, info: result.updateInfo, message: `A atualização (${result.updateInfo.version}) foi encontrada e está sendo baixada. Clique em Instalar Atualização Agora para aplicá-la quando terminar.` };
    }
    return { success: true, message: 'O sistema já está atualizado.', isLatest: true };
  } catch (err: any) {
    return { success: false, message: `Erro ao verificar atualizações: ${err.message}` };
  }
});

function getDownloadedInstallerPath(): string | null {
  try {
    const localAppData = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
    const dirs = [
      path.join(localAppData, 'chamaai-novo-updater', 'pending'),
      path.join(localAppData, 'chamaai-novo', 'pending')
    ];
    
    const candidateFiles: { path: string; mtime: number; version: string }[] = [];
    
    for (const pendingDir of dirs) {
      if (fs.existsSync(pendingDir)) {
        const files = fs.readdirSync(pendingDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.exe') && file.toLowerCase().includes('setup')) {
            const filePath = path.join(pendingDir, file);
            try {
              const stats = fs.statSync(filePath);
              const match = file.match(/(\d+\.\d+\.\d+)/);
              const version = match ? match[1] : '0.0.0';
              candidateFiles.push({
                path: filePath,
                mtime: stats.mtimeMs,
                version: version
              });
            } catch (e) {}
          }
        }
      }
    }
    
    if (candidateFiles.length > 0) {
      // Sort by version (highest first), then by modification time (newest first)
      candidateFiles.sort((a, b) => {
        const partsA = a.version.split('.').map(Number);
        const partsB = b.version.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const valA = partsA[i] || 0;
          const valB = partsB[i] || 0;
          if (valA !== valB) return valB - valA;
        }
        return b.mtime - a.mtime;
      });
      
      logUpdate('INFO', `Candidatos de instaladores encontrados: ${JSON.stringify(candidateFiles.map(c => `${c.version} (${c.path})`))}`);
      logUpdate('INFO', `Instalador selecionado para execução: ${candidateFiles[0].path}`);
      return candidateFiles[0].path;
    } else {
      logUpdate('WARN', 'Nenhum instalador físico (.exe com setup no nome) encontrado nas pastas pending.');
    }
  } catch (e: any) {
    logUpdate('ERROR', `Erro ao buscar instalador físico: ${e.message || e}`);
  }
  return null;
}

ipcMain.handle('install-update', async () => {
  const isPackagedOrTesting = app.isPackaged || fs.existsSync(path.join(app.getAppPath(), 'dev-app-update.yml'));
  if (!isPackagedOrTesting) return { success: false, message: 'Atualizações só funcionam no aplicativo instalado (.exe).' };
  try {
    logUpdate('INFO', 'Iniciando shutdown via Script Separado (Option C)...');
    
    // 1. Busca o caminho do instalador físico baixado
    const installerPath = getDownloadedInstallerPath();
    if (!installerPath || !fs.existsSync(installerPath)) {
      logUpdate('ERROR', 'Instalador físico não encontrado no disco.');
      return { success: false, message: 'Arquivo do instalador não encontrado no disco. Tente verificar atualizações novamente.' };
    }
    
    logUpdate('INFO', `Instalador encontrado em: ${installerPath}`);
    
    // 2. Caminho temporário para o arquivo .bat de atualização em C:\ChamaAi
    const userDataPath = 'C:\\ChamaAi';
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const batPath = path.join(userDataPath, 'executar_atualizacao.bat');
    
    // 3. Cria o conteúdo do Script Separado de atualização (.bat)
    // Esse script espera 2s, força o encerramento do ChamaAi por completo e roda o instalador.
    let restartPath = process.execPath;
    if (!app.isPackaged) {
      try {
        const localAppData = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
        const installedExe = path.join(localAppData, 'Programs', 'chamaai-novo', 'ChamaAi.exe');
        if (fs.existsSync(installedExe)) {
          restartPath = installedExe;
        }
      } catch (e) {}
    }

    const batContent = `@echo off
title INSTALANDO ATUALIZACAO - CHAMAAI
echo Aguardando encerramento do processo pai...
timeout /t 2 /nobreak >nul
echo Forcando encerramento de eventuais instancias do ChamaAi...
taskkill /F /IM "ChamaAi.exe" /T >nul 2>&1
taskkill /F /IM "chamaai-novo.exe" /T >nul 2>&1
echo Iniciando o instalador...
start /wait "" "${installerPath}"
echo Reiniciando o aplicativo atualizado...
start "" "${restartPath}"
echo Limpando script temporario...
del "%~f0"
exit
`;
    
    fs.writeFileSync(batPath, batContent, 'utf8');
    logUpdate('INFO', `Script de atualização .bat gravado em: ${batPath}`);
    
    // 4. Executa o Script Separado via cmd.exe para garantir execução direta na estação
    const { spawn } = require('child_process');
    const comspec = process.env.ComSpec || 'cmd.exe';
    const child = spawn(comspec, ['/c', 'start', '""', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    
    // 5. Aciona o encerramento seguro e controlado com flags adequadas
    isUpdating = true;
    logUpdate('INFO', 'Saindo da aplicação de forma graciosa para liberação de arquivos.');
    await gracefulShutdown('auto_update');
    
    return { success: true };
  } catch (err: any) {
    logUpdate('ERROR', `Erro crítico no install-update: ${err.message || err}`);
    return { success: false, message: `Erro ao preparar atualização: ${err.message}` };
  }
});

async function cleanZombieProcesses() {
  try {
    console.log('[SYSTEM] Iniciando limpeza de instâncias zumbis...');
    const { execSync } = require('child_process');
    const currentPid = process.pid;
    
    // Mata qualquer processo ChamaA* ou chamaai* zumbi na máquina (menos o atual)
    const cmd1 = `powershell -NoProfile -Command "Get-Process | Where-Object { (($_.ProcessName -like '*ChamaA*') -or ($_.ProcessName -like '*chamaai*')) -and ($_.Id -ne ${currentPid}) } | Stop-Process -Force -EA 0"`;
    // Libera a porta 3001 (onde roda o servidor Express) matando o processo zumbi que estiver usando ela (menos o atual)
    const cmd2 = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Where-Object { $_ -ne ${currentPid} } | Get-Process -ErrorAction SilentlyContinue | Stop-Process -Force -EA 0"`;
    
    try { execSync(cmd1, { windowsHide: true }); } catch (e) {}
    try { execSync(cmd2, { windowsHide: true }); } catch (e) {}
    
    return { success: true, message: 'Processos zumbis e travas de porta foram finalizados com sucesso!' };
  } catch (err: any) {
    console.error('[SYSTEM] Erro ao limpar processos zumbis:', err);
    return { success: false, message: `Erro ao limpar processos: ${err.message}` };
  }
}

ipcMain.handle('kill-zombie-processes', async () => {
  return await cleanZombieProcesses();
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
  console.log('[SYSTEM] Outra instância já está rodando. Encerrando imediatamente (SingleInstanceLock)...');
  app.exit(0);
} else {
  app.on('second-instance', (event, commandLine) => {
    // Lê os argumentos passados pelo atalho clicado e redireciona a tela abrindo uma nova janela se for o caso
    let newRoute = '';
    if (commandLine.includes('--telao')) newRoute = 'telao';
    else if (commandLine.includes('--totem')) newRoute = 'totem';
    else if (commandLine.includes('--operador')) newRoute = 'operador';
    else if (commandLine.includes('--operador-touch')) newRoute = 'operador-touch';
    else if (commandLine.includes('--admin')) newRoute = 'admin';
    
    if (newRoute) {
      createWindow(newRoute);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      console.log('Cleaning zombie processes...');
      await cleanZombieProcesses();
      
      console.log('Initializing system...');
      const dbInitResult = await initDatabase({ appVersion: app.getVersion() });

      if (dbInitResult.status === 'ERROR') {
        console.error('[SAFE MODE] Banco de dados falhou de forma crítica:', dbInitResult.error || dbInitResult.details);
        launchSafeMode(dbInitResult.error || dbInitResult.details || 'Falha Crítica do DB', undefined, dbInitResult.reason as any || 'unknown');
        return; // Halt normal boot
      } else if (dbInitResult.status === 'RECOVERED') {
        console.warn('[RECOVERY] Banco restaurado, mas iniciando sistema com aviso:', dbInitResult.details);
        writeRecoveryLog('Boot prosseguindo após RECOVERED mode', dbInitResult);
      }
      
      startServer();

      const isServerOnly = process.argv.some(arg => arg.includes('--server'));

      if (isServerOnly) {
        console.log('[MODO SERVIDOR] Rodando em background silencioso. Nenhuma interface será aberta.');
      } else {
        createWindow();
      }

      // Inicializa o verificador de atualizações silencioso
      const isPackagedOrTesting = app.isPackaged || fs.existsSync(path.join(app.getAppPath(), 'dev-app-update.yml'));
      if (isPackagedOrTesting) {
        const updateLogPath = 'C:\\ChamaAi\\autoupdate.log';
        const writeLog = (logMsg: string) => {
          try {
            // Log rotation: se o arquivo exceder 5MB, rotaciona para .bak
            if (fs.existsSync(updateLogPath)) {
              const stats = fs.statSync(updateLogPath);
              if (stats.size > 5 * 1024 * 1024) { // 5MB
                try { if (fs.existsSync(`${updateLogPath}.bak`)) fs.unlinkSync(`${updateLogPath}.bak`); } catch(e) {}
                fs.renameSync(updateLogPath, `${updateLogPath}.bak`);
              }
            }
            fs.appendFileSync(updateLogPath, logMsg, 'utf8');
          } catch (e) {}
        };

        const autoUpdateLogger = {
          info(message: string) {
            const logMsg = `[${new Date().toISOString()}] [INFO] ${message}\n`;
            console.log('[AUTO-UPDATE]', message);
            writeLog(logMsg);
          },
          warn(message: string) {
            const logMsg = `[${new Date().toISOString()}] [WARN] ${message}\n`;
            console.warn('[AUTO-UPDATE]', message);
            writeLog(logMsg);
          },
          error(message: string) {
            const logMsg = `[${new Date().toISOString()}] [ERROR] ${message}\n`;
            console.error('[AUTO-UPDATE]', message);
            writeLog(logMsg);
          }
        };

        autoUpdateLogger.info('Iniciando configuração do autoUpdater...');
        autoUpdater.logger = autoUpdateLogger;
        autoUpdater.autoInstallOnAppQuit = false;

        if (!app.isPackaged) {
          autoUpdater.forceDevUpdateConfig = true;
        }

        // Configuração dinâmica de atualização local/offline
        const localUpdatePath = getCustomUpdatePath();
        if (localUpdatePath) {
          autoUpdateLogger.info(`Atualizador local/offline ativado! Redirecionando para servidor HTTP local: http://localhost:3001/local-updates (lendo de ${localUpdatePath})`);
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'http://localhost:3001/local-updates'
          });
        } else {
          autoUpdateLogger.info('Usando canal padrão de atualizações (GitHub Releases).');
        }
        
        autoUpdater.on('checking-for-update', () => autoUpdateLogger.info('Verificando se há atualizações...'));
        autoUpdater.on('update-available', (info) => {
          if (!isVersionGreater(info.version, app.getVersion())) {
            autoUpdateLogger.info(`Ignorando versão ${info.version} pois não é mais recente que a atual (${app.getVersion()}).`);
            return;
          }
          autoUpdateLogger.info(`Atualização disponível: ${info.version}`);
          sendToAllWindows('update-available', info);
        });
        autoUpdater.on('update-not-available', () => autoUpdateLogger.info('Nenhuma atualização encontrada.'));
        autoUpdater.on('error', (err) => {
          autoUpdateLogger.error(`Erro no autoUpdater: ${err.message || err}`);
          sendToAllWindows('update-error', err.message);
        });
        autoUpdater.on('download-progress', (progress) => {
          autoUpdateLogger.info(`Progresso do Download: ${Math.round(progress.percent || 0)}%`);
          sendToAllWindows('download-progress', progress);
        });
        autoUpdater.on('update-downloaded', async (info) => {
          autoUpdateLogger.info('Atualização baixada, iniciando backup seguro do SQLite...');
          writeRecoveryLog('Update baixado, iniciando procedimento de backup seguro');
          
          const { backupDatabase, getDb } = require('./services/database');
          const userDataPath = 'C:\\ChamaAi';
          const dbPath = path.join(userDataPath, 'database.sqlite');
          const backupPath = path.join(userDataPath, 'Backups', '_update_backup.sqlite');
          
          let dbInstance;
          try { dbInstance = getDb(); } catch(e) {}
          
          const backupOk = await backupDatabase(dbPath, backupPath, dbInstance);
          
          if (backupOk) {
            updateDownloadedInfo = info;
            autoUpdateLogger.info('Backup seguro do SQLite concluído. Informando renderer...');
            sendToAllWindows('update-downloaded', info);
            // NOTA: Em nosso fluxo, o app fará autoUpdater.quitAndInstall() 
            // através do renderer (se estiver configurado) ou manualmente.
            // Se o comportamento for instalar direto, colocamos quitAndInstall() aqui.
          } else {
            autoUpdateLogger.error('Update retido: Falha ao criar o backup prévio do banco SQLite.');
            writeRecoveryLog('Update cancelado devido a falha no backup preventivo do SQLite.');
          }
        });

        // Removido o autoUpdater.checkForUpdates() daqui para evitar concorrência com o React
      }
    } catch (err: any) {
      console.error('[SYSTEM] Erro Fatal na Inicialização:', err);
      const { dialog } = require('electron');
      try { dialog.showErrorBox('Erro na Inicialização', err.message || String(err)); } catch(e) {}
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

async function gracefulShutdown(reason: string) {
  if (shutdownStarted) {
    console.log(`[SYSTEM] [SHUTDOWN] gracefulShutdown ignorado. Shutdown já está em referência (origem atual: ${reason}).`);
    return;
  }
  shutdownStarted = true;
  isQuitting = true;

  console.log(`[SYSTEM] [SHUTDOWN] Iniciando Graceful Shutdown... Motivo: ${reason}`);
  writeRecoveryLog(`Graceful shutdown iniciado. Motivo: ${reason}`);

  // Safety fallback: se o shutdown demorar mais de 5s, força encerramento
  const fallbackTimeout = setTimeout(() => {
    console.warn('[SYSTEM] [SHUTDOWN] Shutdown demorou muito. Forçando encerramento imediato via app.exit(0).');
    writeRecoveryLog('Shutdown forçado por exceder o tempo limite');
    app.exit(0);
  }, 5000);

  // 1. Limpar timers do watchdog
  try {
    clearWatchdog();
    console.log('[SYSTEM] [SHUTDOWN] Watchdog timers limpos.');
  } catch (e) {
    console.error('[SYSTEM] [SHUTDOWN] Erro ao limpar watchdog:', e);
  }

  // 2. Desregistrar atalhos globais
  try {
    globalShortcut.unregisterAll();
    console.log('[SYSTEM] [SHUTDOWN] Atalhos globais desregistrados.');
  } catch (e) {}

  // Log das janelas abertas antes de fechar
  try {
    const wins = BrowserWindow.getAllWindows();
    console.log(`[SYSTEM] [SHUTDOWN] Janelas abertas detectadas antes de fechar: ${wins.length}`);
    wins.forEach((w, index) => {
      console.log(`  Window ${index + 1}: Title="${w.getTitle()}", Visible=${w.isVisible()}, Destroyed=${w.isDestroyed()}`);
    });
  } catch (e) {}

  // 3. Encerrar recursos do PrinterService / printWindow
  if (printerService) {
    try {
      console.log('[SYSTEM] [SHUTDOWN] Solicitando fechamento do PrinterService/printWindow...');
      if (typeof printerService.destroy === 'function') {
        printerService.destroy();
        console.log('[SYSTEM] [SHUTDOWN] PrinterService/printWindow destruído com sucesso.');
      } else {
        console.warn('[SYSTEM] [SHUTDOWN] PrinterService não possui método destroy.');
      }
    } catch (e: any) {
      console.error('[SYSTEM] [SHUTDOWN] Erro ao destruir PrinterService:', e);
      writeRecoveryLog('Erro ao destruir PrinterService', e);
    }
  }

  // 4. Fechar backend Express (stopServer libera as portas e limpa timers)
  if (!isServerStopped) {
    try {
      console.log('[SYSTEM] [SHUTDOWN] Parando o servidor backend Express...');
      await stopServer();
      isServerStopped = true;
      console.log('[SYSTEM] [SHUTDOWN] Servidor Express parado com sucesso (portas liberadas).');
    } catch (e: any) {
      console.error('[SYSTEM] [SHUTDOWN] Erro ao parar o servidor Express:', e);
      writeRecoveryLog('Erro ao parar o servidor Express', e);
    }
  }

  // 5. Fechar banco SQLite com segurança
  try {
    console.log('[SYSTEM] [SHUTDOWN] Fechando conexão SQLite...');
    closeDatabase();
    console.log('[SYSTEM] [SHUTDOWN] Banco de dados SQLite fechado com segurança.');
  } catch (e: any) {
    console.error('[SYSTEM] [SHUTDOWN] Erro ao fechar banco de dados SQLite:', e);
    writeRecoveryLog('Erro ao fechar banco de dados SQLite', e);
  }

  // 6. Destruir todas as janelas restantes
  try {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      console.log(`[SYSTEM] [SHUTDOWN] Destruindo ${windows.length} janelas restantes...`);
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.destroy();
        }
      });
      console.log('[SYSTEM] [SHUTDOWN] Todas as janelas restantes destruídas.');
    }
  } catch (e) {}

  clearTimeout(fallbackTimeout);

  console.log('[SYSTEM] [SHUTDOWN] Processo finalizado com sucesso. Encerrando processo.');
  writeRecoveryLog(`Graceful shutdown finalizado com sucesso. Motivo: ${reason}`);

  app.exit(0);
}

app.on('window-all-closed', () => {
  console.log('[SYSTEM] window-all-closed acionado.');
  if (!isUpdating) {
    gracefulShutdown('window_all_closed');
  }
});

app.on('before-quit', (event) => {
  if (shutdownStarted) {
    console.log('[SYSTEM] before-quit acionado, mas o shutdown já está em andamento. Permitindo prosseguir.');
    return;
  }
  console.log('[SYSTEM] before-quit acionado pela primeira vez. Iniciando gracefulShutdown...');
  event.preventDefault();
  gracefulShutdown('before_quit');
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}
});
