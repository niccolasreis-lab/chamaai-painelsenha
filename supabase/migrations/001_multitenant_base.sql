-- ═══════════════════════════════════════════════════════════════
-- CHAMA AÍ — FASE 2: ESTRUTURA CLOUD MULTI-TENANT BASE
-- Executar este script no Supabase SQL Editor para inicializar as 
-- tabelas do ChamaAí Cloud Control.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. TABELAS BASE CLOUD CONTROL ─────────────────────────────

-- Tabela de Inquilinos (Tenants/Clientes corporativos)
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text,
  plan text DEFAULT 'basic',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Lojas (Filiais vinculadas a um Tenant)
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  state text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Licenças (Controla limites e vigência de cada filial)
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  license_key text NOT NULL UNIQUE,
  status text DEFAULT 'active',
  plan text DEFAULT 'basic',
  max_teloes integer DEFAULT 1,
  max_totens integer DEFAULT 1,
  max_operadores integer DEFAULT 3,
  modules jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de Dispositivos/Máquinas locais registradas
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  installation_id text,
  device_code text,
  name text,
  type text,
  status text DEFAULT 'offline',
  app_version text,
  db_version text,
  hostname text,
  local_ip text,
  last_seen_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 2. ÍNDICES DAS TABELAS BASE CLOUD ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_stores_tenant_id
ON stores(tenant_id);

CREATE INDEX IF NOT EXISTS idx_licenses_tenant_store
ON licenses(tenant_id, store_id);

CREATE INDEX IF NOT EXISTS idx_licenses_license_key
ON licenses(license_key);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_store
ON devices(tenant_id, store_id);

CREATE INDEX IF NOT EXISTS idx_devices_installation_id
ON devices(installation_id);


-- ── 3. EXTENSÃO E AJUSTE DAS TABELAS PÚBLICAS EXISTENTES ──────
-- Nota: Para não quebrar instalações legadas ou dados históricos,
-- NÃO alteramos as chaves primárias existentes para chaves compostas.
-- Apenas adicionamos colunas opcionais de controle (tenant_id, store_id).

ALTER TABLE senhas_publicas
ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE senhas_publicas
ADD COLUMN IF NOT EXISTS store_id uuid;

ALTER TABLE toledo_produtos_publicos
ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE toledo_produtos_publicos
ADD COLUMN IF NOT EXISTS store_id uuid;

ALTER TABLE configuracoes_publicas
ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE configuracoes_publicas
ADD COLUMN IF NOT EXISTS store_id uuid;

ALTER TABLE comandos_operador
ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE comandos_operador
ADD COLUMN IF NOT EXISTS store_id uuid;

-- ── 4. ÍNDICES NAS TABELAS PÚBLICAS EXISTENTES ────────────────

CREATE INDEX IF NOT EXISTS idx_senhas_publicas_tenant_store
ON senhas_publicas(tenant_id, store_id);

CREATE INDEX IF NOT EXISTS idx_toledo_produtos_publicos_tenant_store
ON toledo_produtos_publicos(tenant_id, store_id);

CREATE INDEX IF NOT EXISTS idx_configuracoes_publicas_tenant_store
ON configuracoes_publicas(tenant_id, store_id);

CREATE INDEX IF NOT EXISTS idx_comandos_operador_tenant_store
ON comandos_operador(tenant_id, store_id);


-- ── 5. SEGURANÇA E ROW LEVEL SECURITY (RLS) ───────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE senhas_publicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE toledo_produtos_publicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_publicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandos_operador ENABLE ROW LEVEL SECURITY;

-- ⚠️ IMPORTANTE CONTEXTO DE SEGURANÇA:
-- 1. A chave 'SUPABASE_SERVICE_ROLE_KEY' (bypass de RLS) NUNCA deve ser incluída no app Electron distribuído ao cliente.
-- 2. Qualquer escrita ou consulta administrativa privilegiada deve passar por uma Cloud API segura (ex: Edge Functions, serverless handlers controlados),
--    onde as credenciais administrativas são mantidas em ambiente de nuvem seguro.
-- 3. O aplicativo do cliente (Vercel) e os totens/painéis lerão os dados usando chaves anônimas (anon), filtradas restritamente.

-- ── 6. POLÍTICAS DE RLS (COMENTADAS PARA SEGURANÇA) ────────────

-- As políticas abaixo demonstram como estruturar as regras de acesso, porém
-- foram comentadas porque verificar apenas "IS NOT NULL" permitiria que
-- usuários anônimos ou mal-intencionados varressem dados de múltiplas lojas.
--
-- ESTRATÉGIA SEGURA (Portal do Cliente):
-- Na próxima fase, a leitura pública do Portal deve ser protegida por:
-- 1. Uma RPC segura (Edge Function) que recebe o 'store_id' e retorna os dados
-- 2. Ou JWT com custom claims (`tenant_id` e `store_id`) gerado no login corporativo.
-- 3. Ou uma tabela `portal_public_token` que valide a origem.

/*
-- Políticas para senhas_publicas:
CREATE POLICY "Leitura pública de senhas por loja no portal"
  ON senhas_publicas FOR SELECT
  USING (
    tenant_id IS NOT NULL AND store_id IS NOT NULL
  );

-- Políticas para toledo_produtos_publicos:
CREATE POLICY "Leitura pública de produtos por loja"
  ON toledo_produtos_publicos FOR SELECT
  USING (
    tenant_id IS NOT NULL AND store_id IS NOT NULL
  );

-- Políticas para configuracoes_publicas:
CREATE POLICY "Leitura pública de configurações por loja"
  ON configuracoes_publicas FOR SELECT
  USING (
    tenant_id IS NOT NULL AND store_id IS NOT NULL
  );
*/

-- Nota: Para operações de INSERT, UPDATE e DELETE administrativas, as políticas estão intencionalmente bloqueadas para conexões anônimas, 
-- devendo ser operadas pela service role no backend ou via regras específicas com JWT de usuários logados a serem implementadas nas próximas fases.
