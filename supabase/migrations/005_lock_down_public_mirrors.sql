-- Apply only after the Edge Functions and scoped clients are deployed.
-- From this point on, public mirrors are never read or written directly by anon.

ALTER TABLE senhas_publicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE toledo_produtos_publicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_publicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandos_operador ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em comandos_operador anon" ON comandos_operador;
DROP POLICY IF EXISTS "Permitir tudo em configuracoes_publicas anon" ON configuracoes_publicas;

DROP POLICY IF EXISTS "Permitir DELETE em senhas_publicas" ON senhas_publicas;
DROP POLICY IF EXISTS "Permitir INSERT em senhas_publicas" ON senhas_publicas;
DROP POLICY IF EXISTS "Permitir SELECT em senhas_publicas" ON senhas_publicas;
DROP POLICY IF EXISTS "Permitir UPDATE em senhas_publicas" ON senhas_publicas;

DROP POLICY IF EXISTS "Permitir DELETE em toledo_produtos_publicos" ON toledo_produtos_publicos;
DROP POLICY IF EXISTS "Permitir INSERT em toledo_produtos_publicos" ON toledo_produtos_publicos;
DROP POLICY IF EXISTS "Permitir SELECT em toledo_produtos_publicos" ON toledo_produtos_publicos;
DROP POLICY IF EXISTS "Permitir UPDATE em toledo_produtos_publicos" ON toledo_produtos_publicos;

DROP POLICY IF EXISTS "Allow public insert on feedbacks" ON feedbacks;
DROP POLICY IF EXISTS "Allow authenticated select on feedbacks" ON feedbacks;

CREATE POLICY "Scoped administrators read feedbacks"
  ON feedbacks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id::text = auth.jwt() -> 'app_metadata' ->> 'tenant_id'
    AND store_id::text = auth.jwt() -> 'app_metadata' ->> 'store_id'
  );
