import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { getCloudIdentity } from './cloud-identity.service';

// Load default .env from current working directory
dotenv.config();

// Try loading from the persistent data directory C:\ChamaAi\.env
const prodEnvPath = 'C:\\ChamaAi\\.env';
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath });
}

let supabaseClient: SupabaseClient | null = null;

/**
 * Obtém a configuração do Supabase de forma segura, sem literais de URL ou chaves vazadas.
 */
export function getSupabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
  };
}

/**
 * Checa se as variáveis de ambiente necessárias existem.
 */
export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return !!url && !!key;
}

/**
 * Retorna o motivo pelo qual a sincronização não deve iniciar, caso não seja possível.
 */
export function getSupabaseDisabledReason(): string | null {
  if (!isSupabaseConfigured()) {
    return 'Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY não encontradas no .env.';
  }

  const identity = getCloudIdentity();
  if (!identity) {
    return 'Identidade local não está inicializada (identity null).';
  }
  if (!identity.installation_id) {
    return 'Faltando installation_id na identidade local.';
  }
  if (!identity.cloud_enabled) {
    return 'Nuvem não ativada (cloud_enabled = 0).';
  }
  if (!identity.tenant_id || !identity.store_id) {
    return 'Faltando tenant_id ou store_id na ativação local.';
  }

  return null;
}

/**
 * Cria ou retorna o singleton do cliente Supabase.
 * Retorna null se não houver variáveis ou se houver erro.
 */
export function createSupabaseAnonClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      supabaseClient = createClient(url, key);
      return supabaseClient;
    } catch (err) {
      console.error('[SUPABASE CONFIG] Erro interno ao criar client Supabase.', err);
      return null;
    }
  }

  return null;
}
