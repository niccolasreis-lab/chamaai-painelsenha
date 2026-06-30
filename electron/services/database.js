"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.getDb = getDb;
exports.closeDatabase = closeDatabase;
exports.backupDatabase = backupDatabase;
exports.restoreDatabase = restoreDatabase;
const recovery_1 = require("./recovery");
const safemode_1 = require("./safemode");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let db;
async function initDatabase({ appVersion }) {
    const userDataPath = 'C:\\ChamaAi';
    const dbPath = path.join(userDataPath, 'database.sqlite');
    const backupPath = path.join(userDataPath, 'Backups', '_update_backup.sqlite');
    const isFreshInstall = !fs.existsSync(dbPath);
    try {
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        const initializeDb = () => {
            db = new better_sqlite3_1.default(dbPath);
            db.pragma('journal_mode = WAL');
            // Create schema if it doesn't exist
            const schemaPath = path.join(__dirname, '../../server/db/schema.sql');
            if (fs.existsSync(schemaPath)) {
                const schema = fs.readFileSync(schemaPath, 'utf8');
                db.exec(schema);
            }
        };
        try {
            initializeDb();
        }
        catch (err) {
            if (err.code === 'SQLITE_NOTADB') {
                console.warn('Banco de dados corrompido detectado (SQLITE_NOTADB). Renomeando e recriando...');
                try {
                    if (db)
                        db.close();
                }
                catch (e) { }
                fs.renameSync(dbPath, dbPath + '.corrompido.' + Date.now());
                initializeDb(); // Retry
            }
            else {
                throw err;
            }
        }
        // Check actual migration needs
        let needsMigration = false;
        if (!isFreshInstall) {
            const sysVerCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='system_version'").get();
            if (sysVerCheck.count === 0)
                needsMigration = true;
            if (!needsMigration) {
                const updHistCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='update_history'").get();
                if (updHistCheck.count === 0)
                    needsMigration = true;
                const recHistCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='recovery_history'").get();
                if (recHistCheck.count === 0)
                    needsMigration = true;
                const midiasCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='midias'").get();
                if (midiasCheck.count > 0) {
                    const midiasCols = db.prepare("PRAGMA table_info(midias)").all();
                    if (!midiasCols.find(c => c.name === 'deleted_at'))
                        needsMigration = true;
                    if (!midiasCols.find(c => c.name === 'file_status'))
                        needsMigration = true;
                }
                const categoriasCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='categorias'").get();
                if (categoriasCheck.count > 0) {
                    const catCols = db.prepare("PRAGMA table_info(categorias)").all();
                    if (!catCols.find(c => c.name === 'deleted_at'))
                        needsMigration = true;
                }
            }
            if (needsMigration) {
                await backupDatabase(dbPath, path.join(userDataPath, 'Backups', `schema_before_${Date.now()}.sqlite`), db);
            }
        }
        // ── System and Recovery Tables ──────────────────────
        db.exec(`
      CREATE TABLE IF NOT EXISTS system_version (
        id INTEGER PRIMARY KEY,
        app_version TEXT,
        db_version TEXT,
        schema_hash TEXT,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );
      
      CREATE TABLE IF NOT EXISTS update_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT,
        status TEXT,
        rollback_reason TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
      
      CREATE TABLE IF NOT EXISTS recovery_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        module TEXT,
        message TEXT,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
    `);
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
      INSERT OR IGNORE INTO configuracoes VALUES ('atualizacao_automatica', '1', datetime('now'));
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
      INSERT OR IGNORE INTO configuracoes VALUES ('habilitar_filas_avancadas', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('acesso_local_exige_auth', '0', datetime('now'));
      
      -- Force clear it if it was the old default
      UPDATE configuracoes SET valor = '' WHERE chave = 'rotulo_local' AND valor = 'Guichê';

      -- Configurações da Impressora Térmica
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_interface', '', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_type', 'EPSON', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_width', '48', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_footer', 'Obrigado pela preferência!', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('impressora_logoPath', '', datetime('now'));

      -- Personalização e Recursos Avançados
      INSERT OR IGNORE INTO configuracoes VALUES ('cor_primaria', '#2563eb', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('totem_screensaver_ativo', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('totem_screensaver_timeout', '120', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('totem_screensaver_intervalo', '10', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('totem_solicita_nome', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_ativo', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_voz', 'Feminina', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_ticker_texto', '', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('sync_pendente_cor_primaria', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('auth_local_obrigatorio', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('totem_screensaver_modo', 'ambos', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_agendamento_ativo', '0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_agendamento_regras', '[]', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_template', 'Senha {senha}, dirija-se ao {guiche}.', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_template_nome', 'Senha {senha}, {nome}, dirija-se ao {guiche}.', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_velocidade', '0.95', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('telao_tts_tom', '1.0', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('painel_habilitar_repetir', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('painel_habilitar_devolver', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('painel_habilitar_nao_compareceu', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('painel_habilitar_concluir', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('midia_indoor_ativa', '1', datetime('now'));
      INSERT OR IGNORE INTO configuracoes VALUES ('midia_indoor_layout', 'lateral', datetime('now'));
    `);
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
      CREATE INDEX IF NOT EXISTS idx_senhas_status ON senhas(status);
      CREATE INDEX IF NOT EXISTS idx_senhas_balcao_id ON senhas(balcao_id);
    `);
        // Operadores
        db.exec(`
      CREATE TABLE IF NOT EXISTS operadores (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        nome            TEXT NOT NULL,
        login           TEXT NOT NULL UNIQUE,
        senha_hash      TEXT NOT NULL,
        perfil          TEXT NOT NULL,
        ativo           INTEGER NOT NULL DEFAULT 1,
        criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
        primeiro_acesso INTEGER DEFAULT 1
      );
      INSERT OR IGNORE INTO operadores (id, nome, login, senha_hash, perfil, ativo) VALUES (1, 'Administrador', 'admin', 'scrypt$6bf314aac0b385bd65ce743adf9d8d84$ff1ac8cc8d26a680a25da61a69f1decd3c0038dcb805a65548181a3c6b77b970bbb924c5d2dcb7a557fb2dc850d901ab9b73db85059b005762bb16887a5e1498', 'admin', 1);
      
      CREATE TABLE IF NOT EXISTS sessoes_operador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        operador_id INTEGER NOT NULL REFERENCES operadores(id),
        criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        expira_em TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cloud_installation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        store_id TEXT,
        installation_id TEXT NOT NULL UNIQUE,
        license_key TEXT,
        cloud_enabled INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        last_checkin_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cloud_installation_installation_id
      ON cloud_installation(installation_id);
    `);
        // Add primeiro_acesso if it doesn't exist
        try {
            db.exec('ALTER TABLE operadores ADD COLUMN primeiro_acesso INTEGER DEFAULT 1;');
            console.log("[DATABASE] Coluna 'primeiro_acesso' adicionada à tabela operadores.");
        }
        catch (e) { }
        // Add deleted_at to midias for soft deletes
        try {
            db.exec('ALTER TABLE midias ADD COLUMN deleted_at TEXT;');
        }
        catch (e) { }
        // Add file_status to midias
        try {
            db.exec("ALTER TABLE midias ADD COLUMN file_status TEXT DEFAULT 'active';");
            console.log("[DATABASE] Coluna 'file_status' adicionada à tabela midias.");
        }
        catch (e) { }
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
        // Mídia Indoor Inteligente (Novas tabelas)
        db.exec(`
      CREATE TABLE IF NOT EXISTS media_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        source_url TEXT,
        local_path TEXT,
        duration_seconds INTEGER DEFAULT 15,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        start_at TEXT,
        end_at TEXT,
        weekdays TEXT,
        campaign_id INTEGER,
        priority INTEGER DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS media_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        starts_at TEXT,
        ends_at TEXT,
        priority INTEGER DEFAULT 0,
        theme_id INTEGER,
        replace_default_schedule INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS media_themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        primary_color TEXT,
        secondary_color TEXT,
        background_image TEXT,
        overlay_image TEXT,
        logo_path TEXT,
        custom_css_json TEXT,
        is_active INTEGER DEFAULT 1,
        starts_at TEXT,
        ends_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS weather_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL,
        longitude REAL,
        data_json TEXT,
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
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
      CREATE INDEX IF NOT EXISTS idx_chamadas_senha_id ON chamadas(senha_id);
      CREATE INDEX IF NOT EXISTS idx_chamadas_operador_id ON chamadas(operador_id);
    `);
        // Toledo — Produtos de balança (preços por KG)
        db.exec(`
      CREATE TABLE IF NOT EXISTS toledo_produtos (
        plu          TEXT PRIMARY KEY,
        descricao    TEXT NOT NULL,
        preco        INTEGER NOT NULL DEFAULT 0,
        categoria    TEXT NOT NULL DEFAULT 'Outros',
        unidade      TEXT NOT NULL DEFAULT 'kg',
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
        // Migration: Adicionar coluna unidade em toledo_produtos caso não exista
        try {
            db.prepare("ALTER TABLE toledo_produtos ADD COLUMN unidade TEXT DEFAULT 'kg'").run();
            console.log("[DATABASE] Coluna 'unidade' adicionada à tabela toledo_produtos.");
        }
        catch (e) {
            // Ignorar se a coluna já existe
        }
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
        }
        catch (e) {
            // Ignorar se a coluna já existe
        }
        // ---------------------------------------------------------
        // FASE 1: MÓDULO DE PRODUTOS E CATEGORIAS (MIGRAÇÃO SEGURA)
        // ---------------------------------------------------------
        try {
            // 1. Tabela de controle de migrações
            db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          executada_em TEXT DEFAULT (datetime('now', 'localtime'))
        );
      `);
            // Verifica se a FASE 1 já rodou
            const migracaoFase1 = db.prepare("SELECT id FROM schema_migrations WHERE id = 'catalogo_produtos_fase_1'").get();
            if (!migracaoFase1) {
                console.log('[FASE 1] Iniciando migração de catálogo de produtos...');
                // 2. Criar backup do banco antes da migração via VACUUM INTO (Síncrono e Seguro para WAL)
                const backupDir = path.join(userDataPath, 'backups');
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                const backupPath = path.join(backupDir, `backup_fase1_${Date.now()}.sqlite`);
                // VACUUM INTO é o jeito seguro e nativo do SQLite de fazer hot backup síncrono
                db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);
                console.log(`[FASE 1] 📦 Backup físico criado com sucesso em: ${backupPath}`);
                // 3. Iniciar Transação (rollback seguro via db.inTransaction)
                db.exec('BEGIN TRANSACTION;');
                // 4. Tabela Audit Logs
                db.exec(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            acao TEXT NOT NULL,
            entidade TEXT NOT NULL,
            entidade_id INTEGER NOT NULL,
            detalhes_json TEXT,
            operador_id INTEGER,
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
          );
        `);
                // 5. Ajustes Seguros na Tabela Categorias
                try {
                    db.prepare("ALTER TABLE categorias ADD COLUMN slug TEXT").run();
                }
                catch (e) {
                    if (!String(e.message).includes('duplicate column name')) {
                        console.warn('[FASE 1] Aviso ao adicionar coluna slug:', e.message);
                    }
                }
                try {
                    db.prepare("ALTER TABLE categorias ADD COLUMN deleted_at TEXT").run();
                }
                catch (e) {
                    if (!String(e.message).includes('duplicate column name')) {
                        console.warn('[FASE 1] Aviso ao adicionar coluna deleted_at:', e.message);
                    }
                }
                // 5.1. Preencher slugs vazios com Normalização NFD
                const categoriasSemSlug = db.prepare("SELECT id, nome FROM categorias WHERE slug IS NULL OR slug = ''").all();
                const updateSlugStmt = db.prepare("UPDATE categorias SET slug = ? WHERE id = ?");
                const checkSlugExists = db.prepare("SELECT id FROM categorias WHERE slug = ?");
                for (const cat of categoriasSemSlug) {
                    let baseSlug = cat.nome
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\\u0300-\\u036f]/g, '') // Remove acentos
                        .replace(/[^a-z0-9]+/g, '-') // Troca não-alfanuméricos por traço
                        .replace(/(^-|-$)+/g, ''); // Remove traços nas bordas
                    if (!baseSlug)
                        baseSlug = `categoria-${cat.id}`;
                    let finalSlug = baseSlug;
                    let counter = 1;
                    while (checkSlugExists.get(finalSlug)) {
                        finalSlug = `${baseSlug}-${counter}`;
                        counter++;
                    }
                    updateSlugStmt.run(finalSlug, cat.id);
                }
                // 5.2. Criar índice único para slug
                db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_slug ON categorias(slug);`);
                // 6. Tabela Produtos
                db.exec(`
          CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plu TEXT UNIQUE,
            nome TEXT NOT NULL,
            slug TEXT,
            descricao TEXT,
            preco REAL NOT NULL DEFAULT 0,
            estoque REAL DEFAULT 0,
            unidade TEXT DEFAULT 'kg',
            categoria_id INTEGER,
            categoria_legada TEXT,
            status INTEGER DEFAULT 1,
            links TEXT,
            imagens TEXT,
            variacoes TEXT,
            ordem INTEGER DEFAULT 0,
            tags TEXT,
            configuracoes_internas TEXT,
            deleted_at TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
          );
          CREATE INDEX IF NOT EXISTS idx_produtos_plu ON produtos(plu);
          CREATE INDEX IF NOT EXISTS idx_produtos_categoria_id ON produtos(categoria_id);
          CREATE INDEX IF NOT EXISTS idx_produtos_status ON produtos(status);
          CREATE INDEX IF NOT EXISTS idx_produtos_deleted_at ON produtos(deleted_at);
          CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);
        `);
                // 7. Migrar Dados Carga Inicial (Rodará Apenas 1x devido ao schema_migrations)
                const toledoProds = db.prepare("SELECT plu, descricao, preco, categoria, unidade, atualizado_em FROM toledo_produtos").all();
                // Busca ignorando maiusculas/minusculas/espaços
                const getCategoriaId = db.prepare(`
          SELECT id FROM categorias 
          WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))
          AND deleted_at IS NULL
          LIMIT 1
        `);
                const getProdutoExistente = db.prepare("SELECT id FROM produtos WHERE plu = ?");
                const insertProduto = db.prepare(`
          INSERT INTO produtos (plu, nome, preco, unidade, categoria_id, categoria_legada, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
                let migrados = 0;
                let ignorados = 0;
                let semVinculo = 0;
                for (const prod of toledoProds) {
                    const existe = getProdutoExistente.get(prod.plu);
                    if (existe) {
                        ignorados++;
                        continue;
                    }
                    const catRecord = getCategoriaId.get(prod.categoria);
                    const catId = catRecord ? catRecord.id : null;
                    if (!catId)
                        semVinculo++;
                    const nomeProduto = (prod.descricao || '').trim() || `Produto ${prod.plu}`;
                    insertProduto.run(prod.plu, nomeProduto, // nome
                    prod.preco, prod.unidade || 'kg', catId, prod.categoria, // categoria_legada
                    prod.atualizado_em || new Date().toISOString());
                    migrados++;
                }
                // 8. Log de Auditoria
                const catCount = db.prepare("SELECT COUNT(*) as count FROM categorias").get();
                const prodTotais = db.prepare("SELECT COUNT(*) as count FROM produtos").get();
                db.prepare(`
          INSERT INTO audit_logs (acao, entidade, entidade_id, detalhes_json, criado_em)
          VALUES (?, ?, ?, ?, ?)
        `).run('MIGRACAO_PRODUTOS_FASE_1', 'SISTEMA', 0, JSON.stringify({
                    totais: {
                        categoriasEncontradas: catCount.count,
                        produtosToledoOriginais: toledoProds.length,
                        produtosInseridos: migrados,
                        produtosIgnoradosJaExistentes: ignorados,
                        produtosSemVinculoCategoria: semVinculo,
                        totalProdutosNaBase: prodTotais.count
                    },
                    backupPath: backupPath
                }), new Date().toISOString());
                // 9. Registrar que a migração foi executada e fechar transação
                db.prepare("INSERT INTO schema_migrations (id) VALUES ('catalogo_produtos_fase_1')").run();
                if (db.inTransaction) {
                    db.exec('COMMIT;');
                }
                console.log(`[FASE 1] ✅ Migração concluída. Inseridos: ${migrados} | Ignorados: ${ignorados} | Sem vínculo de categoria: ${semVinculo}`);
            }
        }
        catch (err) {
            console.error('[FASE 1] ❌ Erro Crítico na Migração:', err.message);
            // Rollback seguro
            if (db.inTransaction) {
                console.log('[FASE 1] Executando ROLLBACK...');
                db.exec('ROLLBACK;');
            }
        }
        // ---------------------------------------------------------
        // Seed das novas categorias oficiais
        try {
            const catCount = db.prepare("SELECT COUNT(*) as count FROM categorias").get();
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
        }
        catch (seedErr) {
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
        // Encarte — Filtros e Renomeação
        db.exec(`
      CREATE TABLE IF NOT EXISTS encarte_filtros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        palavra_chave TEXT NOT NULL,
        ativo INTEGER DEFAULT 1
      );
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS encarte_nomes_customizados (
        codigo_produto TEXT PRIMARY KEY,
        nome_exibicao TEXT NOT NULL,
        ativo INTEGER DEFAULT 1
      );
    `);
        // Encarte — Temas
        db.exec(`
      CREATE TABLE IF NOT EXISTS encarte_temas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        imagem_fundo TEXT NOT NULL,
        data_inicio TEXT,
        data_fim TEXT,
        ativo INTEGER DEFAULT 1
      );
    `);
        // Migration: Adicionar colunas em midias
        try {
            db.prepare("ALTER TABLE midias ADD COLUMN data_expiracao TEXT").run();
            console.log("[DATABASE] Coluna 'data_expiracao' adicionada à tabela midias.");
        }
        catch (e) { }
        try {
            db.prepare("ALTER TABLE midias ADD COLUMN status TEXT DEFAULT 'ativo'").run();
            console.log("[DATABASE] Coluna 'status' adicionada à tabela midias.");
        }
        catch (e) { }
        try {
            db.prepare("ALTER TABLE teloes ADD COLUMN template_layout TEXT DEFAULT 'classic'").run();
            console.log("[DATABASE] Coluna 'template_layout' adicionada à tabela teloes.");
        }
        catch (e) { }
        try {
            db.prepare("ALTER TABLE senhas ADD COLUMN nome_cliente TEXT").run();
            console.log("[DATABASE] Coluna 'nome_cliente' adicionada à tabela senhas.");
        }
        catch (e) { }
        try {
            db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT NOT NULL UNIQUE,
          senha_hash TEXT NOT NULL,
          perfil TEXT NOT NULL DEFAULT 'operador',
          primeiro_acesso INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT DEFAULT (datetime('now'))
        );
      `);
            // Migration: Add primeiro_acesso to usuarios if it doesn't exist
            try {
                db.exec('ALTER TABLE usuarios ADD COLUMN primeiro_acesso INTEGER NOT NULL DEFAULT 1;');
                console.log("[DATABASE] Coluna 'primeiro_acesso' adicionada à tabela usuarios.");
            }
            catch (err) { }
            const userCount = db.prepare('SELECT count(*) as count FROM usuarios').get();
            if (userCount && userCount.count === 0) {
                const bcrypt = require('bcryptjs');
                const hash = bcrypt.hashSync('admin', 10);
                db.prepare('INSERT INTO usuarios (login, senha_hash, perfil, primeiro_acesso) VALUES (?, ?, ?, ?)').run('admin', hash, 'admin', 1);
                console.log("[DATABASE] Tabela 'usuarios' populada com admin/admin.");
            }
            // Migrar operadores legados para a tabela usuarios
            try {
                const operadores = db.prepare('SELECT login, senha_hash, perfil, primeiro_acesso FROM operadores').all();
                const insertStmt = db.prepare('INSERT OR IGNORE INTO usuarios (login, senha_hash, perfil, primeiro_acesso) VALUES (?, ?, ?, ?)');
                for (const op of operadores) {
                    insertStmt.run(op.login, op.senha_hash, op.perfil || 'operador', op.primeiro_acesso !== undefined ? op.primeiro_acesso : 1);
                }
                console.log("[DATABASE] Operadores antigos migrados para a tabela usuarios.");
            }
            catch (err) {
                console.error("[DATABASE] Erro ao migrar operadores antigos:", err);
            }
        }
        catch (e) {
            console.error("[DATABASE] Erro ao inicializar a tabela usuarios:", e);
        }
        // Atualiza a versão se recém migrado ou recém instalado
        if (needsMigration || isFreshInstall) {
            db.prepare("INSERT INTO system_version (id, app_version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET app_version = excluded.app_version").run(appVersion);
        }
        // Reset do Safe Mode após boot do BD com sucesso
        (0, safemode_1.resetSafeModeCounter)(['migration_failed', 'database_restore_failed', 'schema_invalid']);
        console.log('SQLite Database initialized at', dbPath);
        return { status: 'OK', db };
    }
    catch (err) {
        console.error('Erro ao inicializar o banco de dados:', err);
        (0, recovery_1.writeRecoveryLog)('Falha crítica na migração/inicialização do banco', err);
        if (db && db.open) {
            db.close();
            db = null;
        }
        if (!isFreshInstall) {
            const restored = restoreDatabase(backupPath, dbPath);
            if (restored) {
                try {
                    db = new better_sqlite3_1.default(dbPath);
                    db.exec(`
            CREATE TABLE IF NOT EXISTS update_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              version TEXT,
              status TEXT,
              rollback_reason TEXT,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
          `);
                    db.prepare("INSERT INTO update_history (version, status, rollback_reason) VALUES (?, 'rolled_back', ?)").run(appVersion, err.message);
                    db.close();
                }
                catch (logErr) {
                    (0, recovery_1.writeRecoveryLog)('Falha ao logar rollback no banco restaurado', logErr);
                }
                return { status: "RECOVERED", reason: "ROLLBACK_SUCCESSFUL", details: err.message };
            }
        }
        return { status: "ERROR", reason: isFreshInstall ? "FRESH_INSTALL_FAILED" : "ROLLBACK_FAILED", details: err.message };
    }
}
function getDb() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}
function closeDatabase() {
    if (db) {
        try {
            db.close();
            console.log('Banco de dados SQLite fechado com segurança.');
        }
        catch (err) {
            console.error('Erro ao fechar o banco de dados:', err);
        }
    }
}
async function backupDatabase(dbPath, backupPath, dbInstance) {
    try {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        if (dbInstance && dbInstance.open) {
            await dbInstance.backup(backupPath);
            return true;
        }
        // Fallback: abre temporariamente
        if (fs.existsSync(dbPath)) {
            const tempDb = new better_sqlite3_1.default(dbPath);
            await tempDb.backup(backupPath);
            tempDb.close();
            return true;
        }
        return false;
    }
    catch (err) {
        (0, recovery_1.writeRecoveryLog)(`Falha ao realizar backup do banco ${dbPath} para ${backupPath}`, err);
        return false;
    }
}
function restoreDatabase(backupPath, dbPath) {
    try {
        if (!fs.existsSync(backupPath))
            return false;
        // Nunca sobrescrever o banco ativo
        closeDatabase();
        const brokenPath = `${dbPath}.broken_${Date.now()}`;
        if (fs.existsSync(dbPath)) {
            fs.renameSync(dbPath, brokenPath);
        }
        fs.copyFileSync(backupPath, dbPath);
        (0, recovery_1.writeRecoveryLog)(`Restore de banco concluído de ${backupPath}`);
        return true;
    }
    catch (err) {
        (0, recovery_1.writeRecoveryLog)(`Falha ao restaurar banco ${backupPath} para ${dbPath}`, err);
        return false;
    }
}
