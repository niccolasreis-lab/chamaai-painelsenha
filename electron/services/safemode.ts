import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { writeRecoveryLog } from './recovery';

const statePath = 'C:\\ChamaAi\\safemode.json';

export type FailType = 'renderer_timeout' | 'migration_failed' | 'database_restore_failed' | 'schema_invalid' | 'unknown';

export function launchSafeMode(reason: string, details?: any, failType: FailType = 'unknown') {
  let state: Record<string, number> = { renderer_timeout: 0, migration_failed: 0, database_restore_failed: 0, schema_invalid: 0, unknown: 0 };
  
  if (fs.existsSync(statePath)) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) }; } catch(e) {}
  }
  
  state[failType] = (state[failType] || 0) + 1;
  
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state));
  } catch(e) {}

  const isBlocked = state[failType] >= 3;
  writeRecoveryLog(`Safe Mode acionado. Motivo: ${reason}. Bloqueado: ${isBlocked}`, details);

  const safeWin = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
    <html>
      <body style="background: #1e1e1e; color: #fff; font-family: sans-serif; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h1 style="color: #ff5555;">Sistema em Modo de Segurança</h1>
        <p>Ocorreu uma falha que impediu o carregamento normal.</p>
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; width: 100%; max-width: 500px;">
          <strong>Motivo:</strong> ${reason}<br/>
          <strong>Tipo:</strong> ${failType}<br/>
          <strong>Tentativas:</strong> ${state[failType]}
        </div>
        <div style="display: flex; gap: 20px; margin-top: 20px;">
          <button id="btnRetry" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;" ${isBlocked ? 'disabled style="background: #555; cursor: not-allowed;"' : ''}>Tentar Novamente</button>
          <button id="btnUpdate" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Verificar Atualização</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          document.getElementById('btnRetry').addEventListener('click', () => {
            if (!${isBlocked}) ipcRenderer.send('safemode-retry');
          });
          document.getElementById('btnUpdate').addEventListener('click', () => {
            ipcRenderer.send('safemode-check-update');
          });
        </script>
      </body>
    </html>
  `;
  
  safeWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

export function resetSafeModeCounter(failTypes: FailType[]) {
  if (fs.existsSync(statePath)) {
    try {
      let state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      let modified = false;
      for (const type of failTypes) {
        if (state[type] > 0) {
          state[type] = 0;
          modified = true;
        }
      }
      if (modified) fs.writeFileSync(statePath, JSON.stringify(state));
    } catch(e) {}
  }
}
