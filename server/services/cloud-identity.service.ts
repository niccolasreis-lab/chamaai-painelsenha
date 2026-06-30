import { getDb } from '../../electron/services/database';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface CloudIdentity {
  id: number;
  tenant_id: string | null;
  store_id: string | null;
  installation_id: string;
  license_key: string | null;
  cloud_enabled: number;
  status: string;
  device_token: string | null;
  device_token_created_at: string | null;
  device_token_last_rotated_at: string | null;
  portal_public_token: string | null;
  last_checkin_at: string | null;
  created_at: string;
  updated_at: string;
}

// Retorna a chave de licença mascarada (ex: CH-****-ABCD)
export function maskLicenseKey(licenseKey: string | null | undefined): string {
  if (!licenseKey) return '';
  const clean = licenseKey.trim();
  if (clean.length <= 4) return 'CH-****';
  return `CH-****-${clean.slice(-4).toUpperCase()}`;
}

// Gera um UUID v4 de fallback seguro se randomUUID não existir
function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

// Lê a versão do aplicativo do package.json
function getAppVersion(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return pkg.version || '1.0.0';
    }
  } catch (err) {
    console.error('[CLOUD IDENTITY] Erro ao ler package.json:', err);
  }
  return '1.0.0';
}

// Garante que o installation_id exista no banco local
export function ensureInstallationId(): CloudIdentity {
  const db = getDb();
  
  try {
    db.prepare('ALTER TABLE cloud_installation ADD COLUMN device_token TEXT').run();
  } catch (e) { /* Coluna já existe */ }
  try {
    db.prepare('ALTER TABLE cloud_installation ADD COLUMN device_token_created_at TEXT').run();
  } catch (e) { /* Coluna já existe */ }
  try {
    db.prepare('ALTER TABLE cloud_installation ADD COLUMN device_token_last_rotated_at TEXT').run();
  } catch (e) { /* Coluna já existe */ }
  try {
    db.prepare('ALTER TABLE cloud_installation ADD COLUMN portal_public_token TEXT').run();
  } catch (e) { /* Coluna já existe */ }

  // Tenta buscar o primeiro registro de configuração cloud
  let row = db.prepare('SELECT * FROM cloud_installation LIMIT 1').get() as CloudIdentity | undefined;
  
  if (!row) {
    const uuid = generateUUID();
    console.log(`[CLOUD IDENTITY] 🔑 Gerando novo installation_id único: ${uuid}`);
    
    db.prepare(`
      INSERT INTO cloud_installation (
        tenant_id, store_id, installation_id, license_key, cloud_enabled, status, last_checkin_at, device_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(null, null, uuid, null, 0, 'pending', null, null);
    
    row = db.prepare('SELECT * FROM cloud_installation LIMIT 1').get() as CloudIdentity;
  }
  
  return row;
}

// Retorna a identidade atual
export function getCloudIdentity(): CloudIdentity {
  return ensureInstallationId();
}

// Atualiza a identidade local com novos parâmetros
export function setCloudIdentity(data: {
  tenant_id?: string | null;
  store_id?: string | null;
  license_key?: string | null;
  cloud_enabled?: number;
  status?: string;
  portal_public_token?: string | null;
  last_checkin_at?: string | null;
}): CloudIdentity {
  const db = getDb();
  const current = ensureInstallationId();
  
  const tenant_id = data.tenant_id !== undefined ? data.tenant_id : current.tenant_id;
  const store_id = data.store_id !== undefined ? data.store_id : current.store_id;
  const license_key = data.license_key !== undefined ? data.license_key : current.license_key;
  const cloud_enabled = data.cloud_enabled !== undefined ? data.cloud_enabled : current.cloud_enabled;
  const status = data.status !== undefined ? data.status : current.status;
  const portal_public_token = data.portal_public_token !== undefined ? data.portal_public_token : current.portal_public_token;
  const last_checkin_at = data.last_checkin_at !== undefined ? data.last_checkin_at : current.last_checkin_at;
  
  db.prepare(`
    UPDATE cloud_installation 
    SET tenant_id = ?, 
        store_id = ?, 
        license_key = ?, 
        cloud_enabled = ?, 
        status = ?, 
        portal_public_token = ?,
        last_checkin_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(tenant_id, store_id, license_key, cloud_enabled, status, portal_public_token, last_checkin_at, current.id);
  
  return getCloudIdentity();
}

// Retorna se o sync cloud está ativo e configurado
export function isCloudEnabled(): boolean {
  const identity = getCloudIdentity();
  return identity.cloud_enabled === 1 && !!identity.tenant_id && !!identity.store_id;
}

// Retorna o payload para a rota de checkin
export function getCloudCheckinPayload() {
  const identity = getCloudIdentity();
  
  let db_version = 'unknown';
  try {
    const db = getDb();
    const verRow = db.prepare('SELECT db_version FROM system_version WHERE id = 1').get() as { db_version: string } | undefined;
    if (verRow && verRow.db_version) {
      db_version = verRow.db_version;
    }
  } catch (err) {}
  
  return {
    tenant_id: identity.tenant_id,
    store_id: identity.store_id,
    installation_id: identity.installation_id,
    cloud_enabled: identity.cloud_enabled === 1,
    status: identity.status,
    last_checkin_at: identity.last_checkin_at,
    app_version: getAppVersion(),
    db_version,
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  };
}

// ==========================================
// FUNÇÕES DE GERENCIAMENTO DE DEVICE TOKEN
// ==========================================

export function maskDeviceToken(token: string | null | undefined): string {
  if (!token) return '';
  const clean = token.trim();
  if (clean.length <= 4) return 'dev_****';
  return `dev_****_${clean.slice(-4).toLowerCase()}`;
}

export function maskPortalToken(token: string | null | undefined): string {
  if (!token) return '';
  const clean = token.trim();
  if (clean.length <= 4) return 'pub_****';
  return `pub_****_${clean.slice(-4).toLowerCase()}`;
}

export function getDeviceToken(): string | null {
  const identity = getCloudIdentity();
  return identity.device_token || null;
}

export function hasDeviceToken(): boolean {
  return !!getDeviceToken();
}

export function setDeviceToken(token: string | null) {
  const db = getDb();
  const current = getCloudIdentity();
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE cloud_installation 
    SET device_token = ?,
        device_token_created_at = COALESCE(device_token_created_at, ?),
        device_token_last_rotated_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(token, now, now, now, current.id);
  
  return getCloudIdentity();
}
