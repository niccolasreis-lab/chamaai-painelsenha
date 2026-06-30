import 'dotenv/config';
import { getRequiredCloudContext } from '../supabase-sync';

export function getCloudCommandsConfig() {
  return {
    commandsUrl: process.env.CHAMAAI_CLOUD_COMMANDS_URL || '',
    intervalSeconds: parseInt(process.env.CHAMAAI_CLOUD_COMMANDS_INTERVAL_SECONDS || '30', 10),
    timeoutMs: parseInt(process.env.CHAMAAI_CLOUD_TIMEOUT_MS || '10000', 10)
  };
}

const ALLOWED_COMMANDS = [
  'CALL_NEXT',
  'REPEAT_LAST',
  'RETURN_TICKET',
  'FINISH_TICKET',
  'CANCEL_TICKET',
  'REFRESH_CONFIG',
  'PING'
];

let commandsTimer: NodeJS.Timeout | null = null;
let isPolling = false;
let consecutiveFailures = 0;

// Importa dinamicamente a função para pegar o token de loopback
function getLoopbackTokenInternal(): string {
  try {
    const { getLoopbackToken } = require('../supabase-sync');
    if (typeof getLoopbackToken === 'function') {
      return getLoopbackToken();
    }
  } catch (e) {}
  return '';
}

async function executeCommand(cmd: any): Promise<{ status: 'executed' | 'failed' | 'rejected'; result?: any; error_message?: string }> {
  const { id, command_type, payload } = cmd;

  if (!ALLOWED_COMMANDS.includes(command_type)) {
    console.warn(`[CLOUD COMMANDS] ⚠️ Comando '${command_type}' rejeitado (Não está na allowlist).`);
    return { status: 'rejected', error_message: 'Comando não está na allowlist.' };
  }

  const loopbackToken = getLoopbackTokenInternal();
  const apiUrl = 'http://localhost:3001';

  try {
    let res;
    let endpoint = '';

    if (command_type === 'PING') {
      return { 
        status: 'executed', 
        result: { pong: true, timestamp: new Date().toISOString() } 
      };
    }

    if (command_type === 'REFRESH_CONFIG') {
      // Simula uma chamada segura para as configurações locais
      endpoint = `${apiUrl}/api/configuracoes`;
      res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-loopback-token': loopbackToken
        }
      });
      if (res.ok) {
        return { status: 'executed', result: { refreshed: true } };
      } else {
        return { status: 'failed', error_message: `HTTP ${res.status}` };
      }
    }

    if (command_type === 'CALL_NEXT') {
      endpoint = `${apiUrl}/api/chamar-proxima`;
    } else if (command_type === 'REPEAT_LAST') {
      endpoint = `${apiUrl}/api/chamadas`;
    } else if (command_type === 'RETURN_TICKET') {
      endpoint = `${apiUrl}/api/senhas/estornar`;
    } else if (command_type === 'FINISH_TICKET') {
      endpoint = `${apiUrl}/api/senhas/concluir`;
    } else if (command_type === 'CANCEL_TICKET') {
      endpoint = `${apiUrl}/api/senhas/cancelar`;
    }

    if (!endpoint) {
      return { status: 'rejected', error_message: 'Endpoint local não mapeado.' };
    }

    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-loopback-token': loopbackToken
      },
      body: JSON.stringify(payload || {})
    });

    if (res.ok) {
      let resultData = {};
      try {
        resultData = await res.json();
      } catch (e) {}
      return { status: 'executed', result: resultData };
    } else {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson.error || errMsg;
      } catch (e) {}
      return { status: 'failed', error_message: errMsg };
    }

  } catch (err: any) {
    console.error(`[CLOUD COMMANDS] ❌ Falha ao executar comando local ${command_type}:`, err);
    return { status: 'failed', error_message: err?.message || String(err) };
  }
}

async function pollCommandsOnce() {
  if (isPolling) return;
  isPolling = true;

  const config = getCloudCommandsConfig();
  const context = getRequiredCloudContext();

  if (!context.enabled || !context.device_token || !config.commandsUrl) {
    isPolling = false;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    // 1. Poll para comandos pendentes
    const response = await fetch(config.commandsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': context.tenant_id as string,
        'x-store-id': context.store_id as string,
        'x-installation-id': context.installation_id as string,
        'x-device-token': context.device_token as string
      },
      body: JSON.stringify({
        action: 'poll',
        limit: 5
      }),
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      console.warn(`[CLOUD COMMANDS] ⚠️ Polling de comandos recusado (${response.status}). Token inválido ou revogado. Pausando polling...`);
      stopCloudCommandsCron();
      isPolling = false;
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    consecutiveFailures = 0; // Reseta contador de falhas

    const commands = data.commands || [];
    if (commands.length === 0) {
      isPolling = false;
      return;
    }

    console.log(`[CLOUD COMMANDS] 📥 Recebidos ${commands.length} comandos remotos para processar.`);

    const results = [];
    for (const cmd of commands) {
      const execResult = await executeCommand(cmd);
      results.push({
        id: cmd.id,
        status: execResult.status,
        result: execResult.result || {},
        error_message: execResult.error_message || null
      });
    }

    // 2. Enviar ACK de volta
    const ackResponse = await fetch(config.commandsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': context.tenant_id as string,
        'x-store-id': context.store_id as string,
        'x-installation-id': context.installation_id as string,
        'x-device-token': context.device_token as string
      },
      body: JSON.stringify({
        action: 'ack',
        results
      }),
      signal: controller.signal
    });

    if (ackResponse.ok) {
      console.log(`[CLOUD COMMANDS] ✅ ACK de ${results.length} comandos enviado com sucesso.`);
    } else {
      console.error(`[CLOUD COMMANDS] ⚠️ Falha ao enviar ACK (${ackResponse.status}).`);
    }

  } catch (err: any) {
    consecutiveFailures++;
    const interval = Math.min(300, config.intervalSeconds * Math.pow(2, Math.min(5, consecutiveFailures)));
    console.warn(`[CLOUD COMMANDS] 🌐 Falha no polling de comandos (${err?.message || err}). Aplicando Backoff de ${interval}s...`);
    
    // Reaplica timer com tempo de backoff temporário
    if (commandsTimer) {
      clearInterval(commandsTimer);
      commandsTimer = setInterval(pollCommandsOnce, interval * 1000);
    }
  } finally {
    clearTimeout(timeout);
    isPolling = false;
  }
}

export function startCloudCommandsCron() {
  const config = getCloudCommandsConfig();
  if (!config.commandsUrl) {
    console.log('[CLOUD COMMANDS] 📡 Polling de comandos inativo (CHAMAAI_CLOUD_COMMANDS_URL não definida).');
    return;
  }

  const context = getRequiredCloudContext();
  if (!context.enabled || !context.device_token) {
    return;
  }

  console.log(`[CLOUD COMMANDS] 🚀 Polling de comandos iniciado (Intervalo: ${config.intervalSeconds}s)`);
  if (commandsTimer) clearInterval(commandsTimer);

  // Executa o primeiro poll 5 segundos após inicializar para não travar o boot
  setTimeout(() => {
    pollCommandsOnce().catch(() => {});
  }, 5000);

  commandsTimer = setInterval(pollCommandsOnce, config.intervalSeconds * 1000);
}

export function stopCloudCommandsCron() {
  if (commandsTimer) {
    clearInterval(commandsTimer);
    commandsTimer = null;
    console.log('[CLOUD COMMANDS] Polling de comandos remotos parado.');
  }
}
