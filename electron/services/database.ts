import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database;

export function initDatabase() {
  try {
    const userDataPath = 'C:\\ChamaAi';
  
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
  
    const dbPath = path.join(userDataPath, 'database.sqlite');

    const initializeDb = () => {
      db = new Database(dbPath);
      // Create schema if it doesn't exist
      const schemaPath = path.join(__dirname, '../../server/db/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
      }
    };

    try {
      initializeDb();
    } catch (err: any) {
      if (err.code === 'SQLITE_NOTADB') {
        console.warn('Banco de dados corrompido detectado (SQLITE_NOTADB). Renomeando e recriando...');
        try { if (db) db.close(); } catch(e) {}
        fs.renameSync(dbPath, dbPath + '.corrompido.' + Date.now());
        initializeDb(); // Retry
      } else {
        throw err;
      }
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
      INSERT OR IGNORE INTO configuracoes VALUES ('texto_rodape', 'ChamaAi - Atendimento de Segunda a Sexta, 8h às 18h', datetime('now'));
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

    // Toledo — Produtos de balança (preços por KG)
    db.exec(`
      CREATE TABLE IF NOT EXISTS toledo_produtos (
        plu          TEXT PRIMARY KEY,
        descricao    TEXT NOT NULL,
        preco        INTEGER NOT NULL DEFAULT 0,
        categoria    TEXT NOT NULL DEFAULT 'Outros',
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Toledo — Categorias dinâmicas
    db.exec(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        emoji TEXT,
        descricao TEXT,
        ordem INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        setor TEXT DEFAULT 'Mercearia',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);

    // Migration: Adicionar coluna setor em categorias caso não exista
    try {
      db.prepare("ALTER TABLE categorias ADD COLUMN setor TEXT DEFAULT 'Mercearia'").run();
      console.log("[DATABASE] Coluna 'setor' adicionada à tabela categorias.");
    } catch (e) {
      // Ignorar se a coluna já existe
    }

    // Seed das novas categorias oficiais
    try {
      const catCount = db.prepare("SELECT COUNT(*) as count FROM categorias").get() as any;
      if (catCount && catCount.count === 0) {
        const insertStmt = db.prepare(`
          INSERT INTO categorias (nome, emoji, descricao, ordem, ativo, setor)
          VALUES (?, ?, ?, ?, 1, ?)
        `);
        insertStmt.run('Mesa de Frios, Queijos e Antepastos', '🧀🍷', 'Seleção premium de frios especiais, queijos nobres e antepastos para momentos especiais.', 1, 'QUEIJOS');
        insertStmt.run('Ingredientes para Feijoada e Churrasco', '🥓🥘', 'Tudo de melhor para sua feijoada tradicional ou churrasco em família.', 2, 'Outros');
        insertStmt.run('Pescados e Empório Tradicional Ibérico', '🐟🇵🇹', 'Seleção especial de pescados frescos, frutos do mar e produtos tradicionais ibéricos.', 3, 'Outros');
        insertStmt.run('Hora do Lanche e Snacks', '🥜🥨', 'Biscoitos, petiscos, oleaginosas, snacks deliciosos para qualquer hora do dia.', 4, 'CASTANHAS');
        insertStmt.run('Confeitaria e Sobremesas', '🍰🥥', 'Doces finos, confeitos, bolos, tortas e sobremesas prontas para adoçar sua vida.', 5, 'Outros');
        insertStmt.run('Mundo Fitness e Suplementação', '💪⚡', 'Tudo para sua suplementação física, whey, creatina e produtos voltados à saúde.', 6, 'Outros');
        insertStmt.run('Empório Natural, Grãos e Farinhas Naturais', '🌾🌿', 'Grãos, cereais, sementes selecionadas e farinhas especiais de alta qualidade.', 7, 'CASTANHAS');
        insertStmt.run('Cantinho Árabe, Especiarias e Ervas', '🌶️👳', 'Ervas aromáticas, especiarias do oriente e iguarias da culinária árabe tradicional.', 8, 'TEMPEROS');
        insertStmt.run('Despensa e Utilidades Básicas', '🛒🥫', 'Produtos básicos de mercearia, enlatados e utilidades essenciais da despensa.', 9, 'Outros');
      }
      
      // Update existing database categories to new sector categories:
      db.prepare("UPDATE categorias SET setor = 'QUEIJOS' WHERE nome = 'Mesa de Frios, Queijos e Antepastos'").run();
      db.prepare("UPDATE categorias SET setor = 'TEMPEROS' WHERE nome = 'Cantinho Árabe, Especiarias e Ervas'").run();
      db.prepare("UPDATE categorias SET setor = 'CASTANHAS' WHERE nome IN ('Hora do Lanche e Snacks', 'Empório Natural, Grãos e Farinhas Naturais')").run();
      db.prepare("UPDATE categorias SET setor = 'Outros' WHERE nome NOT IN ('Mesa de Frios, Queijos e Antepastos', 'Cantinho Árabe, Especiarias e Ervas', 'Hora do Lanche e Snacks', 'Empório Natural, Grãos e Farinhas Naturais')").run();
    } catch (seedErr) {
      console.error('[DATABASE] Erro ao realizar seed de categorias:', seedErr);
    }

    // Toledo — Log de processamento
    db.exec(`
      CREATE TABLE IF NOT EXISTS toledo_log (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        itens_processados   INTEGER NOT NULL DEFAULT 0,
        precos_atualizados  INTEGER NOT NULL DEFAULT 0,
        mensagem            TEXT,
        criado_em           TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Configurações padrão do Toledo / Encarte
    db.exec(`
      INSERT OR IGNORE INTO configuracoes VALUES ('toledo_encarte_ativo',     '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('toledo_encarte_duracao',   '15', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('toledo_encarte_posicao',   '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('toledo_itens_por_slide',   '12', datetime('now'));
    `);

    // Fila de sincronização local → Supabase (Outbox Pattern)
    db.exec(`
      CREATE TABLE IF NOT EXISTS supabase_sync_queue (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        tabela         TEXT NOT NULL,
        acao           TEXT NOT NULL,
        payload        TEXT NOT NULL,
        tentativas     INTEGER DEFAULT 0,
        max_tentativas INTEGER DEFAULT 10,
        criado_em      TEXT DEFAULT (datetime('now'))
      );
    `);

    // Telões vinculados por código (Musardos)
    db.exec(`
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

export function closeDatabase() {
  if (db) {
    try {
      db.close();
      console.log('Banco de dados SQLite fechado com segurança.');
    } catch (err) {
      console.error('Erro ao fechar o banco de dados:', err);
    }
  }
}
