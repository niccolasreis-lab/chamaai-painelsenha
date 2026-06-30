import * as crypto from 'crypto';

/**
 * Cria o hash criptográfico (SHA-256) de um token.
 * Útil para enviar ou validar na Nuvem sem transitar o original.
 * TODO: Mudar para HMAC na nuvem na Fase de Produção final.
 */
export async function sha256(input: string): Promise<string> {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Retorna as variáveis de ambiente necessárias para a Cloud Ingestion.
 */
export function getCloudIngestionConfig() {
  return {
    url: process.env.CHAMAAI_CLOUD_INGEST_URL || null,
    timeoutMs: parseInt(process.env.CHAMAAI_CLOUD_TIMEOUT_MS || '10000', 10),
    allowDirectSupabaseSync: process.env.CHAMAAI_ALLOW_DIRECT_SUPABASE_SYNC === 'true'
  };
}

/**
 * Dispara uma requisição HTTP para a Ingestion API (Edge Function).
 */
export async function sendCloudIngestionBatch(
  tenantId: string,
  storeId: string,
  installationId: string,
  deviceToken: string,
  items: any[]
): Promise<Response> {
  const config = getCloudIngestionConfig();
  if (!config.url) {
    throw new Error('CHAMAAI_CLOUD_INGEST_URL não configurada.');
  }

  // Tenta extrair a versão do app para metadados
  const appVersion = process.env.npm_package_version || '1.0.0';

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'x-store-id': storeId,
        'x-installation-id': installationId,
        'x-device-token': deviceToken,
        'x-chamaai-version': appVersion
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        store_id: storeId,
        installation_id: installationId,
        items
      }),
      signal: abortController.signal as any
    });
    
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
