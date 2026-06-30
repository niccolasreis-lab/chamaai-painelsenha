import 'dotenv/config';
import { getCloudIdentity, setDeviceToken, setCloudIdentity } from './cloud-identity.service';
import { getRequiredCloudContext } from '../supabase-sync';
import os from 'os';

export function getCloudLicenseConfig() {
  return {
    activateUrl: process.env.CHAMAAI_CLOUD_ACTIVATE_URL || '',
    checkinUrl: process.env.CHAMAAI_CLOUD_CHECKIN_URL || '',
    timeoutMs: parseInt(process.env.CHAMAAI_CLOUD_TIMEOUT_MS || '10000', 10)
  };
}

export function isLicenseCloudConfigured(): boolean {
  const config = getCloudLicenseConfig();
  return !!config.activateUrl && !!config.checkinUrl;
}

export async function activateLicense(licenseKey: string) {
  const config = getCloudLicenseConfig();
  if (!config.activateUrl) {
    throw new Error('CHAMAAI_CLOUD_ACTIVATE_URL não está configurada no .env');
  }

  const identity = getCloudIdentity();
  if (!identity || !identity.installation_id) {
    throw new Error('installation_id não encontrado. O sistema local está corrompido.');
  }

  // Prepara dados da máquina
  const hostname = os.hostname();
  const local_ip = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface?.internal)
    .map((iface) => iface?.address)[0] || '127.0.0.1';
  
  // O app_version e db_version poderiam ser importados dinamicamente do package.json,
  // mas vamos colocar valores seguros.
  const app_version = '1.0.0';
  const db_version = '1';

  const payload = {
    license_key: licenseKey,
    installation_id: identity.installation_id,
    app_version,
    db_version,
    hostname,
    local_ip
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.activateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      let errorMessage = `Erro HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {}
      throw new Error(`Falha na ativação: ${errorMessage}`);
    }

    const data = await response.json();

    if (!data.ok || !data.device_token || !data.tenant_id || !data.store_id) {
      throw new Error('Resposta inválida do servidor de ativação.');
    }

    // Salva identidade completa
    setCloudIdentity({
      tenant_id: data.tenant_id,
      store_id: data.store_id,
      license_key: licenseKey,
      portal_public_token: data.portal_public_token || null
    });

    // Salva o device_token puro localmente
    setDeviceToken(data.device_token);

    console.log(`[CLOUD LICENSE] ✅ Licença ativada com sucesso para Tenant: ${data.tenant_id.split('-')[0]}...`);
    
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Timeout ao conectar no servidor de ativação.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendLicenseCheckin() {
  const config = getCloudLicenseConfig();
  if (!config.checkinUrl) return; // Silent return se não tem url

  const context = getRequiredCloudContext();
  if (!context.enabled || !context.device_token) {
    return; // Não tem como fazer checkin sem identidade ou token
  }

  const hostname = os.hostname();
  const local_ip = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface?.internal)
    .map((iface) => iface?.address)[0] || '127.0.0.1';

  const payload = {
    app_version: '1.0.0',
    db_version: '1',
    hostname,
    local_ip,
    status: 'online'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.checkinUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': context.tenant_id as string,
        'x-store-id': context.store_id as string,
        'x-installation-id': context.installation_id as string,
        'x-device-token': context.device_token as string
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      console.warn(`[CLOUD LICENSE] ⚠️ Check-in recusado (${response.status}). O device token pode ter sido revogado.`);
      return;
    }

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[CLOUD LICENSE] ✅ Check-in realizado. Próximo em ${data.next_checkin_seconds || 3600}s`);
    
    // Atualiza o token do portal localmente se alterado na nuvem
    if (data.portal_public_token !== undefined) {
      setCloudIdentity({
        portal_public_token: data.portal_public_token
      });
    }

  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[CLOUD LICENSE] ⚠️ Timeout no check-in. Sistema continuará offline-first.');
    } else {
      console.warn(`[CLOUD LICENSE] ⚠️ Falha no check-in: ${err.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

let checkinTimer: NodeJS.Timeout | null = null;

export function startCloudCheckinCron() {
  const config = getCloudLicenseConfig();
  if (!config.checkinUrl) return;

  if (checkinTimer) clearInterval(checkinTimer);
  
  // Roda o checkin 1 minuto após o boot para não atrasar o startup e depois a cada 60 minutos
  setTimeout(() => {
    sendLicenseCheckin().catch(() => {});
  }, 60 * 1000);

  checkinTimer = setInterval(() => {
    sendLicenseCheckin().catch(() => {});
  }, 60 * 60 * 1000); // 60 minutos
}

