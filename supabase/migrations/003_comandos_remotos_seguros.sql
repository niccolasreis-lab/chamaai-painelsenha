-- ==============================================================================
-- MIGRATION: 003_comandos_remotos_seguros.sql
-- FASE: 6 - Comandos Remotos Seguros
-- OBJETIVO: Adequar a tabela de comandos_operador para suportar polling multi-tenant
--           seguro a partir do ChamaAí Local.
-- ==============================================================================

ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS device_id uuid;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS installation_id text;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS command_type text;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS result jsonb DEFAULT '{}'::jsonb;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE comandos_operador ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_comandos_operador_tenant_store_status
ON comandos_operador(tenant_id, store_id, status);

CREATE INDEX IF NOT EXISTS idx_comandos_operador_installation_status
ON comandos_operador(installation_id, status);

CREATE INDEX IF NOT EXISTS idx_comandos_operador_created_at
ON comandos_operador(created_at);

-- RLS is activated by 005_lock_down_public_mirrors only after the scoped
-- command Edge Function has been deployed and verified.
