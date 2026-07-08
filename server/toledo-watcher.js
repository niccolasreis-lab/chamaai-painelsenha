"use strict";
/**
 * Toledo MGV7 File Watcher & Parser
 *
 * Monitors the ITENSMGV.TXT file from Toledo scales for price changes.
 * Parses fixed-width records, filters by subtipo 000 (price per KG),
 * and updates only changed prices in the database.
 *
 * File format (Windows-1252 encoding):
 *   Pos 1-2   (2)  Tipo registro — always "01"
 *   Pos 3-5   (3)  Subtipo — "000" = price/KG, "002" = price/UN (ignored)
 *   Pos 6-9   (4)  PLU code
 *   Pos 10-15 (6)  Price — integer / 100 → R$
 *   Pos 16-18 (3)  Unit code — "014" = KG, "060" = UN
 *   Pos 19-66 (48)  Description — right-padded with spaces
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBroadcastFn = setBroadcastFn;
exports.startToledoWatcher = startToledoWatcher;
exports.forceToledoRefresh = forceToledoRefresh;
exports.reloadCategorias = reloadCategorias;
exports.syncToCatalogoProduto = syncToCatalogoProduto;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const database_1 = require("../electron/services/database");
const file_parsers_1 = require("./file-parsers");
const supabase_sync_1 = require("./supabase-sync");
const categorizador_1 = require("./categorizador");
// Broadcast function injected by server to avoid circular dependency
let broadcastEvent = () => { };
/** Called by server/index.ts after startup to wire the SSE broadcaster */
function setBroadcastFn(fn) {
    broadcastEvent = fn;
}
// ── Configuration ──────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds
const DEBOUNCE_MS = 3000; // Wait 3s after change detected before reading
const RETRY_DELAY_MS = 5000; // Wait 5s if file is locked
const MAX_RETRIES = 3;
function getWatchedPaths() {
    let dir = '\\\\serverad\\Santa Paula\\08 - LOJA\\TOLEDO'; // fallback
    let format = 'toledo_mgv6';
    try {
        const db = (0, database_1.getDb)();
        const rowPath = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('toledo_caminho_rede');
        if (rowPath && rowPath.valor && rowPath.valor.trim() !== '') {
            dir = rowPath.valor.trim();
        }
        const rowFormat = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('toledo_formato_arquivo');
        if (rowFormat && rowFormat.valor && rowFormat.valor.trim() !== '') {
            format = rowFormat.valor.trim();
        }
    }
    catch (err) {
        // DB might not be ready yet during first call, use fallback
    }
    // Set default filenames based on format
    let fileNameTxt = 'ITENSMGV.TXT';
    let fileNameBak = 'ITENSMGV.BAK';
    if (format === 'toledo_mgv5') {
        fileNameTxt = 'TXITENS.TXT';
        fileNameBak = 'TXITENS.BAK';
    }
    else if (format === 'filizola') {
        fileNameTxt = 'CADTXT.TXT';
        fileNameBak = 'CADTXT.BAK';
    }
    else if (format === 'gertec') {
        fileNameTxt = 'PRICETAB.TXT';
        fileNameBak = 'PRICETAB.BAK';
    }
    else if (format === 'cads_txt') {
        fileNameTxt = 'SYSPPRO.TXT';
        fileNameBak = 'SYSPPRO.BAK';
    }
    else if (format === 'isolidus_txt') {
        fileNameTxt = 'IMP.ESTOQUE.TXT';
        fileNameBak = 'IMP.ESTOQUE.BAK';
    }
    else if (format === 'etiqueta_eletronica') {
        fileNameTxt = 'DATA.I1';
        fileNameBak = 'DATA.BAK';
    }
    else if (format === 'hiper_csv') {
        fileNameTxt = 'LISTAGEMDEPRODUTO.CSV';
        fileNameBak = 'LISTAGEMDEPRODUTO.BAK';
    }
    else if (format === 'bedgarline_csv') {
        fileNameTxt = 'RELATORIOPADRAORETRATO.CSV';
        fileNameBak = 'RELATORIOPADRAORETRATO.BAK';
    }
    else if (format === 'isolidus_csv') {
        fileNameTxt = 'LISTA DE PRODUTOS.CSV';
        fileNameBak = 'LISTA DE PRODUTOS.BAK';
    }
    else if (format === 'box_csv') {
        fileNameTxt = 'TABELADEPRECOSEMPORIO.CSV';
        fileNameBak = 'TABELADEPRECOSEMPORIO.BAK';
    }
    else if (format.includes('csv')) {
        fileNameTxt = 'PRODUTOS.CSV';
        fileNameBak = 'PRODUTOS.BAK';
    }
    else if (format.includes('xlsx')) {
        fileNameTxt = 'PRODUTOS.XLSX';
        fileNameBak = 'PRODUTOS.BAK';
    }
    return {
        txt: path.join(dir, fileNameTxt),
        bak: path.join(dir, fileNameBak),
        dir: dir,
        format: format
    };
}
// Persistent paths for configuration
const PERSISTENT_DIR = 'C:\\ChamaAi';
const PERSISTENT_CAT_PATH = path.join(PERSISTENT_DIR, 'categorias.json');
// Ensure persistent directory exists
if (!fs.existsSync(PERSISTENT_DIR)) {
    fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
}
// Load categories mapping with persistent storage and packaged fallback
let categorias = {};
try {
    if (fs.existsSync(PERSISTENT_CAT_PATH)) {
        categorias = JSON.parse(fs.readFileSync(PERSISTENT_CAT_PATH, 'utf-8'));
    }
    else {
        // If persistent file doesn't exist, search packaged fallback paths
        const possiblePaths = [
            path.join(__dirname, '../../server/categorias.json'),
            path.join(__dirname, 'categorias.json'),
            path.join(process.cwd(), 'server', 'categorias.json'),
        ];
        let foundFallback = false;
        for (const catPath of possiblePaths) {
            if (fs.existsSync(catPath)) {
                categorias = JSON.parse(fs.readFileSync(catPath, 'utf-8'));
                // Copy to persistent path so it stays persistent and editable
                fs.writeFileSync(PERSISTENT_CAT_PATH, JSON.stringify(categorias, null, 2), 'utf-8');
                foundFallback = true;
                console.log(`[TOLEDO] Categorias padrão copiadas para pasta persistente de: ${catPath}`);
                break;
            }
        }
        if (!foundFallback) {
            console.warn('[TOLEDO] Nenhum arquivo de categorias padrão encontrado. Iniciando vazio.');
        }
    }
    console.log(`[TOLEDO] Categorias carregadas: ${Object.keys(categorias).length} mapeamentos`);
}
catch (err) {
    console.error('[TOLEDO] Erro ao carregar categorias.json:', err);
}
// `parseToledoFile` is now handled by `parseFileContent` from `./file-parsers`
// ── File Reader with Retry ─────────────────────────────────────────────────────
async function readFileWithRetry(filePath, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Read with Windows-1252 (latin1) encoding
            const buffer = fs.readFileSync(filePath);
            // Node.js 'latin1' maps to ISO-8859-1 which is a superset compatible with Windows-1252 for text
            const content = buffer.toString('latin1');
            return content;
        }
        catch (err) {
            if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
                console.warn(`[TOLEDO] Arquivo bloqueado (tentativa ${attempt}/${retries}). Aguardando ${RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
            else {
                console.error(`[TOLEDO] Erro ao ler arquivo (tentativa ${attempt}/${retries}):`, err.message);
                if (attempt === retries)
                    return null;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }
    return null;
}
// ── Database Operations ────────────────────────────────────────────────────────
function processToledoItems(items) {
    const db = (0, database_1.getDb)();
    let updatedCount = 0;
    const insertOrUpdate = db.prepare(`
    INSERT INTO toledo_produtos (plu, descricao, preco, categoria, unidade, atualizado_em)
    VALUES (?, ?, ?, ?, 'kg', datetime('now', 'localtime'))
    ON CONFLICT(plu) DO UPDATE SET
      preco = excluded.preco,
      categoria = excluded.categoria,
      atualizado_em = datetime('now', 'localtime')
    WHERE toledo_produtos.preco != excluded.preco
  `);
    // For new products, we need a separate insert to also set the descricao
    const insertNew = db.prepare(`
    INSERT OR IGNORE INTO toledo_produtos (plu, descricao, preco, categoria, unidade, atualizado_em)
    VALUES (?, ?, ?, ?, 'kg', datetime('now', 'localtime'))
  `);
    // Check which products are new vs existing
    const existingCheck = db.prepare('SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos WHERE plu = ?');
    const transaction = db.transaction((toledoItems) => {
        const importedPlus = new Set();
        for (const item of toledoItems) {
            importedPlus.add(item.plu);
            const existing = existingCheck.get(item.plu);
            if (!existing) {
                // New product — insert with description
                insertNew.run(item.plu, item.descricao, item.preco, item.categoria);
                syncToCatalogoProduto(db, item);
                updatedCount++;
            }
            else if (existing.preco !== item.preco ||
                existing.categoria !== item.categoria ||
                existing.descricao !== item.descricao) {
                // Existing product — update if price, description OR category changed
                db.prepare(`
          UPDATE toledo_produtos 
          SET preco = ?, descricao = ?, categoria = ?, atualizado_em = datetime('now', 'localtime') 
          WHERE plu = ?
        `).run(item.preco, item.descricao, item.categoria, item.plu);
                syncToCatalogoProduto(db, item);
                updatedCount++;
            }
        }
        // Remove produtos antigos/deletados que não constam na carga atual
        const allExisting = db.prepare('SELECT plu FROM toledo_produtos').all();
        const toDelete = allExisting.filter(row => !importedPlus.has(row.plu));
        if (toDelete.length > 0) {
            const currentCount = allExisting.length;
            // Se a carga importada tiver menos de 10% dos produtos do banco e o banco tiver mais de 20 produtos,
            // recusa a exclusão em massa por segurança (para evitar apagar tudo se for arquivo corrompido/incompleto)
            if (toledoItems.length < currentCount * 0.1 && currentCount > 20) {
                console.warn(`[TOLEDO] ⚠️ Importação suspeita: número de itens recebidos (${toledoItems.length}) é muito menor do que o banco possui (${currentCount}). Pulando deleção em massa dos outros produtos.`);
            }
            else {
                const deleteStmt = db.prepare('DELETE FROM toledo_produtos WHERE plu = ?');
                for (const row of toDelete) {
                    deleteStmt.run(row.plu);
                    updatedCount++; // Conta como atualização para forçar o broadcast e sincronização
                }
                console.log(`[TOLEDO] 🗑️ Removidos ${toDelete.length} produtos da base local que não constavam na última carga.`);
            }
        }
    });
    transaction(items);
    return updatedCount;
}
// ── Watcher Engine ─────────────────────────────────────────────────────────────
let lastMtime = 0;
let debounceTimer = null;
let isProcessing = false;
let watcherActive = false;
async function waitForFileToStabilize(filePath) {
    try {
        let prevSize = -1;
        for (let i = 0; i < 5; i++) {
            if (!fs.existsSync(filePath))
                return false;
            const stats = fs.statSync(filePath);
            if (stats.size > 0 && stats.size === prevSize) {
                return true;
            }
            prevSize = stats.size;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        const finalStats = fs.statSync(filePath);
        if (finalStats.size === 0)
            return true;
    }
    catch (e) { }
    return false;
}
async function processFile(filePath) {
    if (isProcessing) {
        console.log('[TOLEDO] Processamento já em andamento, ignorando...');
        return;
    }
    isProcessing = true;
    const startTime = Date.now();
    try {
        console.log(`[TOLEDO] ⏳ Iniciando processamento de ${path.basename(filePath)}...`);
        const stabilized = await waitForFileToStabilize(filePath);
        if (!stabilized) {
            console.warn('[TOLEDO] ⚠️ Arquivo instável ou sendo gravado muito lentamente. Abortando leitura.');
            return;
        }
        const content = await readFileWithRetry(filePath);
        if (!content) {
            console.error('[TOLEDO] ❌ Não foi possível ler o arquivo após todas as tentativas.');
            return;
        }
        const paths = getWatchedPaths();
        const rawItems = (0, file_parsers_1.parseFileContent)(content, paths.format);
        // Map categories (stripping leading zeros from PLU for robust matching)
        const items = rawItems.map(item => {
            const cleanPlu = item.plu.replace(/^0+/, '');
            return {
                ...item,
                categoria: categorias[cleanPlu] || categorias[item.plu] || (0, categorizador_1.getCategoryFromDescription)(item.descricao)
            };
        });
        console.log(`[TOLEDO] 📊 ${items.length} itens válidos encontrados usando parser: ${paths.format}`);
        if (items.length === 0) {
            console.warn('[TOLEDO] ⚠️ Nenhum item válido no arquivo. Mantendo preços anteriores.');
            return;
        }
        const updatedCount = processToledoItems(items);
        const elapsed = Date.now() - startTime;
        console.log(`[TOLEDO] ✅ Processamento concluído em ${elapsed}ms — ${updatedCount} preço(s) atualizado(s)`);
        // Log to toledo_log table
        try {
            const db = (0, database_1.getDb)();
            db.prepare(`
        INSERT INTO toledo_log (itens_processados, precos_atualizados, mensagem, criado_em)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `).run(items.length, updatedCount, `Processamento OK em ${elapsed}ms`);
        }
        catch (logErr) {
            console.error('[TOLEDO] Erro ao gravar log:', logErr);
        }
        // Broadcast update event so the Telão refreshes the encarte
        if (updatedCount > 0) {
            broadcastEvent('TOLEDO_PRECOS_ATUALIZADOS', {
                total: items.length,
                atualizados: updatedCount,
                timestamp: new Date().toISOString(),
            });
            // Sync: envia todos os produtos atualizados para a nuvem (Portal do Cliente)
            const db = (0, database_1.getDb)();
            const produtosCloud = db.prepare('SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos').all();
            (0, supabase_sync_1.syncProdutos)(produtosCloud);
        }
    }
    catch (err) {
        console.error('[TOLEDO] ❌ Erro no processamento:', err.message);
        // Log error without crashing the service
        try {
            const db = (0, database_1.getDb)();
            db.prepare(`
        INSERT INTO toledo_log (itens_processados, precos_atualizados, mensagem, criado_em)
        VALUES (0, 0, ?, datetime('now', 'localtime'))
      `).run(`ERRO: ${err.message}`);
        }
        catch (logErr) {
            // Silent — don't crash the service for a logging failure
        }
    }
    finally {
        isProcessing = false;
    }
}
function onFileChanged(filePath) {
    // Debounce: wait 3s to ensure the file is fully written
    if (debounceTimer)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processFile(filePath);
    }, DEBOUNCE_MS);
}
/**
 * Start the Toledo file watcher.
 * Uses polling (fs.watchFile) since the target is a network UNC path,
 * which doesn't reliably support fs.watch / FSEvents.
 */
function startToledoWatcher() {
    if (watcherActive) {
        console.log('[TOLEDO] Watcher já está ativo.');
        return;
    }
    const paths = getWatchedPaths();
    console.log('[TOLEDO] ═══════════════════════════════════════════');
    console.log('[TOLEDO]  Iniciando monitoramento dos arquivos Toledo');
    console.log(`[TOLEDO]  Pasta: ${paths.dir}`);
    console.log(`[TOLEDO]  Intervalo de poll: ${POLL_INTERVAL_MS}ms`);
    console.log('[TOLEDO] ═══════════════════════════════════════════');
    // Check if the file/path is accessible
    try {
        if (fs.existsSync(paths.txt)) {
            const stat = fs.statSync(paths.txt);
            lastMtime = stat.mtimeMs;
            console.log(`[TOLEDO] ✅ Arquivo TXT encontrado. Última modificação: ${new Date(stat.mtimeMs).toLocaleString('pt-BR')}`);
            processFile(paths.txt);
        }
        else if (fs.existsSync(paths.bak)) {
            const stat = fs.statSync(paths.bak);
            lastMtime = stat.mtimeMs;
            console.log(`[TOLEDO] ✅ Arquivo BAK encontrado. Última modificação: ${new Date(stat.mtimeMs).toLocaleString('pt-BR')}`);
            processFile(paths.bak);
        }
        else {
            console.warn(`[TOLEDO] ⚠️ Nenhum arquivo encontrado em ${paths.dir}. O watcher ficará ativo aguardando.`);
        }
    }
    catch (err) {
        console.warn(`[TOLEDO] ⚠️ Caminho de rede não acessível: ${err.message}. O watcher ficará tentando...`);
    }
    // Use polling for UNC network paths (fs.watch is unreliable on network shares)
    const pollTimer = setInterval(() => {
        try {
            const currentPaths = getWatchedPaths(); // Check dynamically in case it changed
            // Check TXT first
            if (fs.existsSync(currentPaths.txt)) {
                const stat = fs.statSync(currentPaths.txt);
                if (stat.mtimeMs > lastMtime) {
                    lastMtime = stat.mtimeMs;
                    console.log(`[TOLEDO] 📁 Modificação detectada em TXT: ${new Date(stat.mtimeMs).toLocaleString('pt-BR')}`);
                    onFileChanged(currentPaths.txt);
                    return;
                }
            }
            // Check BAK if TXT hasn't changed or doesn't exist
            if (fs.existsSync(currentPaths.bak)) {
                const stat = fs.statSync(currentPaths.bak);
                if (stat.mtimeMs > lastMtime) {
                    lastMtime = stat.mtimeMs;
                    console.log(`[TOLEDO] 📁 Modificação detectada em BAK: ${new Date(stat.mtimeMs).toLocaleString('pt-BR')}`);
                    onFileChanged(currentPaths.bak);
                }
            }
        }
        catch (err) {
            // Network path temporarily unavailable — silent retry
            if (err.code !== 'ENOENT') {
                console.warn(`[TOLEDO] ⚠️ Erro ao verificar arquivo: ${err.message}`);
            }
        }
    }, POLL_INTERVAL_MS);
    watcherActive = true;
    // Return cleanup function
    return () => {
        clearInterval(pollTimer);
        if (debounceTimer)
            clearTimeout(debounceTimer);
        watcherActive = false;
        console.log('[TOLEDO] Watcher desativado.');
    };
}
/**
 * Force a manual re-read of the Toledo file.
 * Used by the admin API endpoint.
 */
async function forceToledoRefresh() {
    const paths = getWatchedPaths();
    if (fs.existsSync(paths.txt)) {
        await processFile(paths.txt);
        return { success: true, message: 'Leitura forçada do TXT concluída.' };
    }
    else if (fs.existsSync(paths.bak)) {
        await processFile(paths.bak);
        return { success: true, message: 'Leitura forçada do BAK concluída.' };
    }
    else {
        return { success: false, message: `Nenhum arquivo encontrado na pasta: ${paths.dir}` };
    }
}
/**
 * Reload the categories mapping from disk.
 */
function reloadCategorias() {
    try {
        if (fs.existsSync(PERSISTENT_CAT_PATH)) {
            categorias = JSON.parse(fs.readFileSync(PERSISTENT_CAT_PATH, 'utf-8'));
            console.log(`[TOLEDO] Categorias recarregadas da pasta persistente: ${Object.keys(categorias).length} mapeamentos`);
            return;
        }
        const possiblePaths = [
            path.join(__dirname, '../../server/categorias.json'),
            path.join(__dirname, 'categorias.json'),
            path.join(process.cwd(), 'server', 'categorias.json'),
        ];
        for (const catPath of possiblePaths) {
            if (fs.existsSync(catPath)) {
                categorias = JSON.parse(fs.readFileSync(catPath, 'utf-8'));
                console.log(`[TOLEDO] Categorias recarregadas da pasta padrão: ${Object.keys(categorias).length} mapeamentos`);
                return;
            }
        }
        console.warn('[TOLEDO] categorias.json não encontrado em nenhum caminho.');
    }
    catch (err) {
        console.error('[TOLEDO] Erro ao recarregar categorias:', err);
    }
}
// ── Sincronização com Catálogo ──────────────────────────────────────────────────
function syncToCatalogoProduto(db, item) {
    try {
        // 1. Achar categoria_id
        let categoria_id = null;
        if (item.categoria) {
            const cat = db.prepare("SELECT id FROM categorias WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)) AND deleted_at IS NULL LIMIT 1").get(item.categoria);
            if (cat)
                categoria_id = cat.id;
        }
        const existing = db.prepare("SELECT id, preco, nome, categoria_id FROM produtos WHERE plu = ?").get(item.plu);
        if (!existing) {
            // Criação via Toledo -> gerar slug simples
            let baseSlug = item.descricao.toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            if (!baseSlug)
                baseSlug = 'produto-' + item.plu;
            let slug = baseSlug;
            let counter = 1;
            while (db.prepare("SELECT id FROM produtos WHERE slug = ?").get(slug)) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
            db.prepare(`
        INSERT INTO produtos (plu, nome, slug, preco, categoria_id, categoria_legada, unidade, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(item.plu, item.descricao, slug, item.preco, categoria_id, item.categoria, item.unidade || 'kg');
            const newProd = db.prepare("SELECT last_insert_rowid() as id").get();
            db.prepare(`
        INSERT INTO audit_logs (entidade, entidade_id, acao, usuario_id, detalhes_json)
        VALUES ('produtos', ?, 'SYNC_TOLEDO_INSERT', 'sistema', ?)
      `).run(newProd.id, JSON.stringify({
                plu: item.plu,
                nome: item.descricao,
                preco: item.preco,
                categoria_legada: item.categoria,
                categoria_id
            }));
        }
        else {
            // Atualização via Toledo
            const diff = {};
            const updates = [];
            const params = [];
            if (existing.preco !== item.preco) {
                diff.preco_antes = existing.preco;
                diff.preco_depois = item.preco;
                updates.push("preco = ?");
                params.push(item.preco);
            }
            if (existing.nome !== item.descricao) {
                diff.nome_antes = existing.nome;
                diff.nome_depois = item.descricao;
                updates.push("nome = ?");
                params.push(item.descricao);
            }
            // Atualiza categoria APENAS se estiver vazio
            if (existing.categoria_id === null && categoria_id !== null) {
                diff.categoria_id_antes = existing.categoria_id;
                diff.categoria_id_depois = categoria_id;
                updates.push("categoria_id = ?");
                params.push(categoria_id);
            }
            // Sempre atualiza legacy cat e unidade, mas não gera log de diff a não ser que importante
            updates.push("categoria_legada = ?");
            params.push(item.categoria);
            updates.push("unidade = ?");
            params.push(item.unidade || 'kg');
            if (updates.length > 0) {
                updates.push("updated_at = datetime('now', 'localtime')");
                params.push(existing.id);
                db.prepare(`UPDATE produtos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
                if (Object.keys(diff).length > 0) {
                    db.prepare(`
            INSERT INTO audit_logs (entidade, entidade_id, acao, usuario_id, detalhes_json)
            VALUES ('produtos', ?, 'SYNC_TOLEDO_UPDATE', 'sistema', ?)
          `).run(existing.id, JSON.stringify({ diff }));
                }
            }
        }
    }
    catch (err) {
        console.error("[SYNC CATÁLOGO] Erro ao sincronizar produto:", err);
    }
}
