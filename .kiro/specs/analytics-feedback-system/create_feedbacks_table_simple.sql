-- Script Simplificado - Criação da Tabela Feedbacks
-- Execute este script no Supabase SQL Editor

-- Criar tabela
CREATE TABLE feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ticket_id INTEGER REFERENCES senhas_publicas(id),
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('analytics', 'feedback')),
  evento TEXT NOT NULL,
  valor TEXT,
  metadata JSONB
);

-- Criar índices
CREATE INDEX idx_feedbacks_ticket_id ON feedbacks(ticket_id);
CREATE INDEX idx_feedbacks_tipo_evento ON feedbacks(tipo_evento);
CREATE INDEX idx_feedbacks_created_at ON feedbacks(created_at DESC);

-- Habilitar RLS
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Allow public insert on feedbacks"
ON feedbacks FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated select on feedbacks"
ON feedbacks FOR SELECT TO authenticated USING (true);
