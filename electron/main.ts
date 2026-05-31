import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initDatabase, getDb, closeDatabase } from './services/database';
import { startServer, stopServer } from '../server/index';
import { PrinterService, PrinterConfig } from './services/printer';
import { autoUpdater } from 'electron-updater';

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
      return row.valor;
    }
  } catch (e) {}

  // Fallback: pasta padrão local
  const defaultLocalPath = 'C:\\ChamaAi_Atualizacoes';
  if (fs.existsSync(defaultLocalPath)) {
    return defaultLocalPath;
  }
  return null;
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

  // Detecta se é Telão ou Totem para modo tela cheia
  const argsEarly = process.argv.slice(1);
  const isTelao = argsEarly.some(arg => arg.includes('--telao'));
  const isTotem = argsEarly.some(arg => arg.includes('--totem'));

  if (isTotem) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    // Blindagem de teclas (Kiosk Mode Restrito)
    globalShortcut.register('CommandOrControl+W', () => { console.log('[BLINDAGEM] Bloqueado: Ctrl+W'); });
    globalShortcut.register('CommandOrControl+Q', () => { console.log('[BLINDAGEM] Bloqueado: Ctrl+Q'); });
    globalShortcut.register('CommandOrControl+Shift+I', () => { console.log('[BLINDAGEM] Bloqueado: DevTools'); });
    globalShortcut.register('Alt+F4', () => { console.log('[BLINDAGEM] Bloqueado: Alt+F4'); });
    
    // Força o foco de volta se o usuário tentar abrir o menu iniciar ou alt+tab
    mainWindow.on('blur', () => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isFocused()) {
          mainWindow.focus();
        }
      }, 100);
    });
  } else if (isTelao) {
    mainWindow.setFullScreen(true);
  }

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
    const base = devUrl || 'https://localhost:5173';
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
    const pendingDir = path.join(localAppData, 'chamaai-novo', 'pending');
    if (fs.existsSync(pendingDir)) {
      const files = fs.readdirSync(pendingDir);
      const exeFile = files.find(f => f.endsWith('.exe') && f.startsWith('ChamaAi-Setup'));
      if (exeFile) {
        return path.join(pendingDir, exeFile);
      }
    }
  } catch (e) {
    console.error('[UPDATE] Erro ao buscar instalador físico:', e);
  }
  return null;
}

ipcMain.handle('install-update', async () => {
  const isPackagedOrTesting = app.isPackaged || fs.existsSync(path.join(app.getAppPath(), 'dev-app-update.yml'));
  if (!isPackagedOrTesting) return { success: false, message: 'Atualizações só funcionam no aplicativo instalado (.exe).' };
  try {
    console.log('[UPDATE] Iniciando shutdown via Script Separado (Option C)...');
    
    // 1. Busca o caminho do instalador físico baixado
    const installerPath = getDownloadedInstallerPath();
    if (!installerPath || !fs.existsSync(installerPath)) {
      console.error('[UPDATE] Instalador não encontrado física no disco.');
      return { success: false, message: 'Arquivo do instalador não encontrado no disco. Tente verificar atualizações novamente.' };
    }
    
    console.log('[UPDATE] Instalador encontrado em:', installerPath);
    
    // 2. Desativa flags e inicia shutdown gracioso do app
    isQuitting = true;
    globalShortcut.unregisterAll();
    
    if (!isServerStopped) {
      try { 
        await stopServer(); 
        isServerStopped = true;
        console.log('[UPDATE] Graceful shutdown do Express concluído.');
      } catch (e) { 
        console.error('[UPDATE] Erro no stopServer:', e); 
      }
    }
    
    try {
      closeDatabase();
      console.log('[UPDATE] Banco de dados SQLite fechado com segurança.');
    } catch (e) {
      console.error('[UPDATE] Erro ao fechar banco de dados:', e);
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
    console.log('[UPDATE] Script de atualização .bat gravado em:', batPath);
    
    // 5. Executa o Script Separado via explorer.exe para garantir que ele rode no foreground interativo
    const { spawn } = require('child_process');
    const child = spawn('explorer.exe', [batPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    // 6. Encerra o Electron de forma instantânea
    console.log('[UPDATE] Saindo da aplicação imediatamente para liberação de arquivos.');
    app.exit(0);
    
    return { success: true };
  } catch (err: any) {
    console.error('[UPDATE] Erro crítico no install-update:', err);
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
          const devUrl = process.env.VITE_DEV_SERVER_URL || 'https://localhost:5173';
          mainWindow.loadURL(`${devUrl}#/${newRoute}`);
        }
      }
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
          if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
          }
        });
        autoUpdater.on('update-not-available', () => autoUpdateLogger.info('Nenhuma atualização encontrada.'));
        autoUpdater.on('error', (err) => {
          autoUpdateLogger.error(`Erro no autoUpdater: ${err.message || err}`);
          if (mainWindow) {
            mainWindow.webContents.send('update-error', err.message);
          }
        });
        autoUpdater.on('download-progress', (progress) => {
          autoUpdateLogger.info(`Progresso do Download: ${Math.round(progress.percent || 0)}%`);
          if (mainWindow) {
            mainWindow.webContents.send('download-progress', progress);
          }
        });
        autoUpdater.on('update-downloaded', (info) => {
          autoUpdateLogger.info('Atualização baixada e pronta para instalar.');
          if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
          }
        });

        autoUpdater.checkForUpdates();
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
  const isServerOnly = process.argv.some(arg => arg.includes('--server'));
  if (process.platform !== 'darwin' && !isServerOnly) {
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
