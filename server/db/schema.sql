-- Operadores do sistema (admin e operador de balcão)
CREATE TABLE IF NOT EXISTS operadores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  login      TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil     TEXT NOT NULL CHECK(perfil IN ('admin', 'operador')),
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Balcões de atendimento (ex: Frutas Secas)
CREATE TABLE IF NOT EXISTS balcoes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                TEXT NOT NULL,
  prefixo_senha       TEXT NOT NULL DEFAULT '',
  preferencial_ativo  INTEGER NOT NULL DEFAULT 0,
  contador_atual      INTEGER NOT NULL DEFAULT 0,
  ativo               INTEGER NOT NULL DEFAULT 1,
  criado_em           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Senhas emitidas pelo totem
CREATE TABLE IF NOT EXISTS senhas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  balcao_id    INTEGER NOT NULL REFERENCES balcoes(id),
  numero       INTEGER NOT NULL,
  preferencial INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'aguardando'
                 CHECK(status IN ('aguardando','chamada','atendida','cancelada')),
  criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  chamada_em   TEXT,
  atendida_em  TEXT
);

-- Registro de cada chamada feita pelo operador
CREATE TABLE IF NOT EXISTS chamadas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  senha_id    INTEGER NOT NULL REFERENCES senhas(id),
  operador_id INTEGER NOT NULL REFERENCES operadores(id),
  guiche      TEXT NOT NULL DEFAULT 'Balcão 1',
  tentativa   INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mídias do telão (imagens e vídeos locais)
CREATE TABLE IF NOT EXISTS midias (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  caminho   TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK(tipo IN ('imagem','video')),
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configurações gerais do sistema (chave/valor)
CREATE TABLE IF NOT EXISTS configuracoes (
  chave        TEXT PRIMARY KEY,
  valor        TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Valores padrão de configuração
INSERT OR IGNORE INTO configuracoes VALUES ('nome_estabelecimento', 'Supermercado', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('tempo_destaque_senha', '5', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('volume_audio', '80', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('intervalo_midia_seg', '10', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('reset_diario_automatico', '1', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('hora_reset', '06:00', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('fila_normal_ativa', '1', datetime('now'));
INSERT OR IGNORE INTO configuracoes VALUES ('fila_preferencial_ativa', '1', datetime('now'));

-- Balcão Padrão Inicial
INSERT OR IGNORE INTO balcoes (id, nome, prefixo_senha, preferencial_ativo) VALUES (1, 'Balcão Geral', 'N', 1);

-- Admin Padrão (senha: admin)
INSERT OR IGNORE INTO operadores (id, nome, login, senha_hash, perfil) VALUES (1, 'Administrador', 'admin', 'admin', 'admin');

-- Telões configurados por código (Musardos)
CREATE TABLE IF NOT EXISTS teloes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  nome TEXT,
  status TEXT DEFAULT 'pendente',
  modulo_painel INTEGER DEFAULT 0,
  modulo_encarte INTEGER DEFAULT 0,
  modulo_midia INTEGER DEFAULT 0,
  encarte_categorias TEXT DEFAULT '',
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  vinculado_em DATETIME
);

