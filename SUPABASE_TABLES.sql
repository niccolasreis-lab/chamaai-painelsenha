-- ═══════════════════════════════════════════════════════════════
--  ChamaAí — Tabelas públicas para o Portal do Cliente
--  Execute este SQL no Supabase SQL Editor (Dashboard > SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- 1. Espelho das senhas (apenas id, numero e status — dados públicos)
CREATE TABLE IF NOT EXISTS senhas_publicas (
  id BIGINT PRIMARY KEY,
  numero INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Espelho dos produtos Toledo (catálogo público de preços)
CREATE TABLE IF NOT EXISTS toledo_produtos_publicos (
  plu TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  preco NUMERIC NOT NULL DEFAULT 0,
  categoria TEXT DEFAULT 'Outros',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
--  Row Level Security (RLS)
--  Permite leitura pública (anon) e escrita pelo servidor (anon)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE senhas_publicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE toledo_produtos_publicos ENABLE ROW LEVEL SECURITY;

-- Senhas: leitura e escrita livre (dados não sensíveis)
CREATE POLICY "Permitir SELECT em senhas_publicas" 
  ON senhas_publicas FOR SELECT 
  USING (true);

CREATE POLICY "Permitir INSERT em senhas_publicas" 
  ON senhas_publicas FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Permitir UPDATE em senhas_publicas" 
  ON senhas_publicas FOR UPDATE 
  USING (true);

CREATE POLICY "Permitir DELETE em senhas_publicas" 
  ON senhas_publicas FOR DELETE 
  USING (true);

-- Produtos: leitura e escrita livre (dados públicos de preço)
CREATE POLICY "Permitir SELECT em toledo_produtos_publicos" 
  ON toledo_produtos_publicos FOR SELECT 
  USING (true);

CREATE POLICY "Permitir INSERT em toledo_produtos_publicos" 
  ON toledo_produtos_publicos FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Permitir UPDATE em toledo_produtos_publicos" 
  ON toledo_produtos_publicos FOR UPDATE 
  USING (true);

CREATE POLICY "Permitir DELETE em toledo_produtos_publicos" 
  ON toledo_produtos_publicos FOR DELETE 
  USING (true);

-- ═══════════════════════════════════════════════════════════════
--  Índices para performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_senhas_publicas_status 
  ON senhas_publicas (status);

CREATE INDEX IF NOT EXISTS idx_toledo_produtos_publicos_preco 
  ON toledo_produtos_publicos (preco) 
  WHERE preco > 0;
