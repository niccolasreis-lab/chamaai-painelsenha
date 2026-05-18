-- 1. Adicionar colunas necessárias na tabela existente de senhas para rastrear quem chamou
ALTER TABLE senhas_publicas ADD COLUMN IF NOT EXISTS guiche TEXT;

-- 2. Criar a tabela de Comandos do Operador para comunicação nuvem -> máquina local
CREATE TABLE IF NOT EXISTS comandos_operador (
  id BIGSERIAL PRIMARY KEY,
  comando TEXT NOT NULL,
  payload JSONB,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Permitir que conexões anônimas possam ler/escrever comandos (RLS)
ALTER TABLE comandos_operador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo em comandos_operador anon"
  ON comandos_operador
  FOR ALL
  TO anon
  USING (true);

-- 4. Criar tabela de configurações públicas (ordem de categorias, etc.)
CREATE TABLE IF NOT EXISTS configuracoes_publicas (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracoes_publicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo em configuracoes_publicas anon"
  ON configuracoes_publicas
  FOR ALL
  TO anon
  USING (true);
