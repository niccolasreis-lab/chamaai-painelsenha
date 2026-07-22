-- Bootstrap the existing legacy CRM licenses into the multi-tenant ChamaAI
-- cloud model without exposing or duplicating license keys outside Postgres.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legacy_client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_legacy_client
  ON tenants (legacy_client_id)
  WHERE legacy_client_id IS NOT NULL;

INSERT INTO tenants (name, document, status, legacy_client_id)
SELECT c.company_name, c.cnpj, 'active', c.id
FROM clients c
WHERE upper(c.company_name) = 'MERCANTIL SANTA PAULA'
  AND EXISTS (
  SELECT 1
  FROM serials s
  JOIN products p ON p.id = s.product_id
  WHERE s.client_id = c.id
    AND s.status = 'Active'
    AND s.expiration_date > now()
    AND (p.name = 'ChamaAí' OR p.prefix = 'CA')
)
ON CONFLICT (legacy_client_id) WHERE legacy_client_id IS NOT NULL
DO UPDATE SET
  name = EXCLUDED.name,
  document = EXCLUDED.document,
  updated_at = now();

INSERT INTO stores (tenant_id, name, status)
SELECT t.id, t.name, 'active'
FROM tenants t
WHERE t.legacy_client_id IS NOT NULL
  AND upper(t.name) = 'MERCANTIL SANTA PAULA'
  AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.tenant_id = t.id);

INSERT INTO licenses (
  tenant_id,
  store_id,
  license_key,
  status,
  plan,
  modules,
  expires_at
)
SELECT
  t.id,
  st.id,
  s.code,
  'active',
  'professional',
  '{"queue": true, "portal": true, "products": true}'::jsonb,
  s.expiration_date
FROM serials s
JOIN products p ON p.id = s.product_id
JOIN tenants t ON t.legacy_client_id = s.client_id
JOIN LATERAL (
  SELECT id FROM stores WHERE tenant_id = t.id ORDER BY created_at ASC LIMIT 1
) st ON true
WHERE s.status = 'Active'
  AND s.expiration_date > now()
  AND (p.name = 'ChamaAí' OR p.prefix = 'CA')
  AND upper(t.name) = 'MERCANTIL SANTA PAULA'
ON CONFLICT (license_key) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  store_id = EXCLUDED.store_id,
  status = EXCLUDED.status,
  modules = EXCLUDED.modules,
  expires_at = EXCLUDED.expires_at,
  updated_at = now();

INSERT INTO store_public_portals (
  tenant_id,
  store_id,
  portal_public_token,
  enabled,
  allowed_features
)
SELECT
  s.tenant_id,
  s.id,
  encode(gen_random_bytes(32), 'hex'),
  true,
  '{"products": true}'::jsonb
FROM stores s
JOIN tenants t ON t.id = s.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM store_public_portals p WHERE p.store_id = s.id AND p.enabled = true
)
  AND upper(t.name) = 'MERCANTIL SANTA PAULA';

-- Existing unscoped mirror rows are not reassigned here. The authenticated
-- first sync claims only matching legacy primary keys, while the ingest Edge
-- Function rejects any row already owned by another tenant or store.
