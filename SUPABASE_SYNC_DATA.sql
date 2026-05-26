-- ═══════════════════════════════════════════════════════════════
--  SUPABASE DATA SYNC — COPIE E EXECUTE NO SQL EDITOR
--  Este script limpa os dados antigos em nuvem e sincroniza as
--  10 novas categorias com produtos modelo para ativação do portal.
-- ═══════════════════════════════════════════════════════════════

-- 1. Limpar tabelas existentes para garantir sincronização limpa
TRUNCATE TABLE toledo_produtos_publicos CASCADE;
TRUNCATE TABLE configuracoes_publicas CASCADE;

-- 2. Inserir a ordem correta das 10 categorias no Supabase
INSERT INTO configuracoes_publicas (chave, valor, updated_at)
VALUES (
  'categorias_ordem', 
  '["Queijos e Laticínios", "Embutidos, Frios e Carnes", "Peixes e Frutos do Mar", "Oleaginosas e Castanhas", "Frutas Secas e Desidratadas", "Farinhas, Amidos e Polvilhos", "Grãos, Cereais e Sementes", "Temperos, Especiarias e Conservas", "Suplementos, Chás e Produtos Naturais", "Outros e Utilidades"]',
  NOW()
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW();

-- 3. Inserir nome do estabelecimento
INSERT INTO configuracoes_publicas (chave, valor, updated_at)
VALUES ('nome_estabelecimento', 'Mercantil Santa Paula', NOW())
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW();

-- 4. Inserir produtos modelo para ativar as 10 categorias no portal do cliente
INSERT INTO toledo_produtos_publicos (plu, descricao, preco, categoria, updated_at) VALUES
('1001', 'QUEIJO MUSSARELA KG', 3890, 'Queijos e Laticínios', NOW()),
('1002', 'MANTEIGA COM SAL VIGOR 200G', 990, 'Queijos e Laticínios', NOW()),
('1003', 'PRESUNTO COZIDO SADIA KG', 2490, 'Embutidos, Frios e Carnes', NOW()),
('1004', 'ALCATRA BOVINA RESFRIADA KG', 4200, 'Embutidos, Frios e Carnes', NOW()),
('4763', 'BACALHAU PORTO MOHUA LOMBO KG', 42000, 'Peixes e Frutos do Mar', NOW()),
('4188', 'BACALHAU PORTO MOHUA PECA INTEIRA KG', 21000, 'Peixes e Frutos do Mar', NOW()),
('1005', 'CASTANHA DE CAJU SECA 100G', 1200, 'Oleaginosas e Castanhas', NOW()),
('1006', 'PISTACHE COM CASCA E SAL 100G', 1800, 'Oleaginosas e Castanhas', NOW()),
('1007', 'UVA PASSA PRETA SEM SEMENTE 100G', 580, 'Frutas Secas e Desidratadas', NOW()),
('1008', 'DAMASCO SECO TURCO 100G', 950, 'Frutas Secas e Desidratadas', NOW()),
('1009', 'TAPIOCA GOMA FRESCA 500G', 650, 'Farinhas, Amidos e Polvilhos', NOW()),
('1010', 'FARINHA DE MANDIOCA TORRADA KG', 850, 'Farinhas, Amidos e Polvilhos', NOW()),
('1011', 'FEIJÃO CARIOCA TIPO 1 KG', 750, 'Grãos, Cereais e Sementes', NOW()),
('1012', 'ARROZ AGULHINHA TIPO 1 5KG', 2490, 'Grãos, Cereais e Sementes', NOW()),
('1013', 'OREGANO DESIDRATADO SACHE 50G', 450, 'Temperos, Especiarias e Conservas', NOW()),
('1014', 'PALMITO PUPUNHA INTEIRO VIDRO 300G', 1990, 'Temperos, Especiarias e Conservas', NOW()),
('1015', 'CHÁ VERDE SACHES', 590, 'Suplementos, Chás e Produtos Naturais', NOW()),
('1016', 'MEL SILVESTRE PURO BISNAGA 250G', 1490, 'Suplementos, Chás e Produtos Naturais', NOW()),
('1017', 'SACOLA REUTILIZÁVEL ECOLÓGICA', 350, 'Outros e Utilidades', NOW()),
('1018', 'PÃO FRANCÊS CROCANTE KG', 1490, 'Outros e Utilidades', NOW());
