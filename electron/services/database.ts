import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database;

export function initDatabase() {
  try {
    let userDataPath;
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      // Fallback for running outside electron
      userDataPath = path.resolve('.');
    }
    
    const dbPath = path.join(userDataPath, 'database.sqlite');
    db = new Database(dbPath);
    
    // Create schema if it doesn't exist
    const schemaPath = path.join(__dirname, '../../server/db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schema);
    }

    // ── Inline migrations (run safely on every startup) ──────────────────────
    // Configurações
    db.exec(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave        TEXT PRIMARY KEY,
        valor        TEXT NOT NULL,
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO configuracoes VALUES ('nome_estabelecimento', 'Supermercado', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('tempo_destaque_senha', '5', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('volume_audio', '80', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('intervalo_midia_seg', '10', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('reset_diario_automatico', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('fila_normal_ativa', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('fila_preferencial_ativa', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('tipo_som', 'bell', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('som_personalizado', '', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('ocultar_tipo_senha', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('mostrar_rodape', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('texto_rodape', 'ChamaAí - Atendimento de Segunda a Sexta, 8h às 18h', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('rotulo_local', '', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('rotulo_atendimento_geral', 'Atendimento Geral', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('rotulo_atendimento_prioritario', 'Atendimento Prioritário', datetime('now'));
      
      -- Force clear it if it was the old default
      UPDATE configuracoes SET valor = '' WHERE chave = 'rotulo_local' AND valor = 'Guichê';

      -- Configurações da Impressora Térmica
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_interface', '', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_type', 'EPSON', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_width', '48', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_footer', 'Obrigado pela preferência!', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_logoPath', '', datetime('now'));
    `);

    // Balcões
    db.exec(`
      CREATE TABLE IF NOT EXISTS balcoes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        nome                TEXT NOT NULL,
        prefixo_senha       TEXT NOT NULL DEFAULT '',
        preferencial_ativo  INTEGER NOT NULL DEFAULT 0,
        contador_atual      INTEGER NOT NULL DEFAULT 0,
        ativo               INTEGER NOT NULL DEFAULT 1,
        criado_em           TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO balcoes (id, nome, prefixo_senha, preferencial_ativo) VALUES (1, 'Balcão Geral', 'N', 1);
    `);

    // Senhas
    db.exec(`
      CREATE TABLE IF NOT EXISTS senhas (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        balcao_id    INTEGER NOT NULL REFERENCES balcoes(id),
        numero       INTEGER NOT NULL,
        preferencial INTEGER NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'aguardando',
        criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
        chamada_em   TEXT,
        atendida_em  TEXT
      );
    `);

    // Operadores
    db.exec(`
      CREATE TABLE IF NOT EXISTS operadores (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        nome       TEXT NOT NULL,
        login      TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        perfil     TEXT NOT NULL,
        ativo      INTEGER NOT NULL DEFAULT 1,
        criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO operadores (id, nome, login, senha_hash, perfil, ativo) VALUES (1, 'Administrador', 'admin', 'admin', 'admin', 1);
    `);

    // Mídias
    db.exec(`
      CREATE TABLE IF NOT EXISTS midias (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        nome      TEXT NOT NULL,
        caminho   TEXT NOT NULL,
        tipo      TEXT NOT NULL CHECK(tipo IN ('imagem','video')),
        ordem     INTEGER NOT NULL DEFAULT 0,
        ativo     INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Chamadas (registro de cada chamada feita pelo operador)
    db.exec(`
      CREATE TABLE IF NOT EXISTS chamadas (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        senha_id    INTEGER NOT NULL REFERENCES senhas(id),
        operador_id INTEGER NOT NULL REFERENCES operadores(id),
        guiche      TEXT NOT NULL DEFAULT 'Balcão 1',
        tentativa   INTEGER NOT NULL DEFAULT 1,
        criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    console.log('SQLite Database initialized at', dbPath);
    return db;
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados:', err);
    throw err;
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}
