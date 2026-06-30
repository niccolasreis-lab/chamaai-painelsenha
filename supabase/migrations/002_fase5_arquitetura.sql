-- ==============================================================================
-- MIGRATION: 002_fase5_arquitetura.sql
-- FASE: 5 - Licenciamento, Autenticação de Dispositivos e Portal do Cliente
-- OBJETIVO: Criar as tabelas para gestão de tokens do portal público e credenciais de devices.
-- 
-- IMPORTANTE:
-- Este script define a estrutura necessária para a Ingestão Segura via Edge Functions.
-- Os comandos estão ativos para a infraestrutura, mas não criam policies inseguras.
-- ==============================================================================

-- ── 1. PORTAIS PÚBLICOS DAS LOJAS ───────────────────────────────────────────
-- Tabela para gerenciar URLs públicas dos portais. Separa o token público
-- da tabela `stores`, permitindo rotação se um QR code/link for exposto indevidamente.

CREATE TABLE IF NOT EXISTS store_public_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  portal_public_token text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  allowed_features jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_public_portals_token ON store_public_portals(portal_public_token);
CREATE INDEX IF NOT EXISTS idx_store_public_portals_tenant_store ON store_public_portals(tenant_id, store_id);

-- ── 2. CREDENCIAIS DE DISPOSITIVOS (CHAMAAÍ LOCAL) ─────────────────────────
-- O "ChamaAí Local" autenticará nas Edge Functions (Cloud Ingestion)
-- usando um token gerado via `activate-license`.
-- Nunca armazenaremos o token em texto claro; apenas o seu hash (bcrypt/sha256).

CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  token_hash text NOT NULL,
  status text DEFAULT 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_installation ON device_tokens(installation_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device ON device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant_store ON device_tokens(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_status ON device_tokens(status);

-- ── 3. EXTENSÃO DA TABELA DE LICENÇAS E LOJAS ───────────
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS modules jsonb DEFAULT '{}'::jsonb;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS last_checkin_at timestamptz;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_devices integer DEFAULT 1;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS db_version text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS hostname text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS local_ip text;

-- ── 4. POLÍTICAS DE RLS DE INFRAESTRUTURA ──────────────────────────────────
-- Somente Service Role e funções em Edge Functions poderão manipular estas tabelas.
-- Desabilitamos explicitamente o acesso público (anon/authenticated).

ALTER TABLE store_public_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública criada. Apenas queries via backend (Edge Function)
-- com bypass RLS (`service_role`) poderão operar nestas tabelas.
