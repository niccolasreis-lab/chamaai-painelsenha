require('dotenv').config();
import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initDatabase, getDb, closeDatabase } from './services/database';
import { startServer, stopServer } from '../server/index';
import { PrinterService, PrinterConfig } from './services/printer';
import { autoUpdater } from 'electron-updater';

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
let isServerStopped = false;

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
    const base = devUrl || 'https://localhost:5173';
    newWindow.loadURL(`${base}#/${route}`).then(() => {
      newWindow.webContents.openDevTools();
    }).catch(err => {
      console.error('Failed to load dev URL:', err);
    });
  }

  newWindow.on('closed', () => {
    if (newWindow === mainWindow) {
      mainWindow = null;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit(); // Garante que todos os processos ocultos sejam finalizados quando todas as janelas forem fechadas
    }
  });
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
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      if (result.updateInfo.version === app.getVersion()) {
         return { success: true, message: 'Você já está usando a versão mais recente!' };
      }
      return { success: true, message: `A atualização (${result.updateInfo.version}) foi encontrada e está sendo baixada. Clique em Instalar Atualização Agora para aplicá-la quando terminar.` };
    }
    return { success: true, message: 'O sistema já está atualizado.' };
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
    
    // 2. Desativa flags e inicia shutdown gracioso do app
    isQuitting = true;
    globalShortcut.unregisterAll();
    
    if (!isServerStopped) {
      try { 
        await stopServer(); 
        isServerStopped = true;
        logUpdate('INFO', 'Graceful shutdown do Express concluído.');
      } catch (e: any) { 
        logUpdate('ERROR', `Erro no stopServer: ${e.message || e}`); 
      }
    }
    
    try {
      closeDatabase();
      logUpdate('INFO', 'Banco de dados SQLite fechado com segurança.');
    } catch (e: any) {
      logUpdate('ERROR', `Erro ao fechar banco de dados: ${e.message || e}`);
    }
    
    // 3. Caminho temporário para o arquivo .bat de atualização em C:\ChamaAi
    const userDataPath = 'C:\\ChamaAi';
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const batPath = path.join(userDataPath, 'executar_atualizacao.bat');
    
    // 4. Cria o conteúdo do Script Separado de atualização (.bat)
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
    
    // 5. Executa o Script Separado via cmd.exe para garantir execução direta na estação
    const { spawn } = require('child_process');
    const comspec = process.env.ComSpec || 'cmd.exe';
    const child = spawn(comspec, ['/c', 'start', '""', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    
    // 6. Encerra o Electron de forma instantânea
    logUpdate('INFO', 'Saindo da aplicação imediatamente para liberação de arquivos.');
    app.exit(0);
    
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
    // Libera a porta 3000 (onde roda o servidor Express) matando o processo zumbi que estiver usando ela (menos o atual)
    const cmd2 = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Where-Object { $_ -ne ${currentPid} } | Get-Process -ErrorAction SilentlyContinue | Stop-Process -Force -EA 0"`;
    
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
  console.log('[SYSTEM] Outra instância já está rodando. Encerrando (SingleInstanceLock)...');
  app.quit();
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
      initDatabase();
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
          autoUpdateLogger.info(`Atualizador local/offline ativado! Redirecionando para servidor HTTP local: http://localhost:3000/local-updates (lendo de ${localUpdatePath})`);
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'http://localhost:3000/local-updates'
          });
        } else {
          autoUpdateLogger.info('Usando canal padrão de atualizações (GitHub Releases).');
        }
        
        autoUpdater.on('checking-for-update', () => autoUpdateLogger.info('Verificando se há atualizações...'));
        autoUpdater.on('update-available', (info) => {
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
        autoUpdater.on('update-downloaded', (info) => {
          autoUpdateLogger.info('Atualização baixada e pronta para instalar.');
          sendToAllWindows('update-downloaded', info);
        });

        autoUpdater.checkForUpdates();
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

app.on('window-all-closed', () => {
  console.log('[SYSTEM] window-all-closed acionado. Verificando se deve fechar...');
  const isServerOnly = process.argv.some(arg => arg.includes('--server'));
  if (process.platform !== 'darwin' && !isServerOnly) {
    console.log('[SYSTEM] Fechando a aplicação porque as janelas fecharam.');
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;
    console.log('[SYSTEM] Iniciando Graceful Shutdown...');
    
    globalShortcut.unregisterAll();
    
    // Só chama stopServer se ainda não foi chamado pelo install-update
    if (!isServerStopped) {
      try { 
        await stopServer();
        isServerStopped = true;
      } catch (e) { 
        console.error('[SYSTEM] Erro no stopServer durante o desligamento:', e); 
      }
    }
    
    // Garante que a conexão do SQLite foi encerrada de forma redundante e segura
    try {
      closeDatabase();
      console.log('[SYSTEM] Banco de dados SQLite fechado com segurança durante o desligamento.');
    } catch (e) {
      console.error('[SYSTEM] Erro ao fechar banco de dados durante o desligamento:', e);
    }
    
    console.log('[SYSTEM] Cleanup finalizado. Encerrando processo.');
    app.exit(0);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
