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

import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../electron/services/database';
import { parseFileContent, ParsedItem } from './file-parsers';
import { syncProdutos } from './supabase-sync';
import { getCategoryFromDescription } from './categorizador';

// Broadcast function injected by server to avoid circular dependency
let broadcastEvent: (event: string, data: any) => void = () => {};

/** Called by server/index.ts after startup to wire the SSE broadcaster */
export function setBroadcastFn(fn: (event: string, data: any) => void) {
  broadcastEvent = fn;
}

// ── Configuration ──────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000;     // Check every 5 seconds
const DEBOUNCE_MS = 3000;          // Wait 3s after change detected before reading
const RETRY_DELAY_MS = 5000;       // Wait 5s if file is locked
const MAX_RETRIES = 3;

function getWatchedPaths() {
  let dir = '\\\\serverad\\Santa Paula\\08 - LOJA\\TOLEDO'; // fallback
  let format = 'toledo_mgv6';
  
  try {
    const db = getDb();
    const rowPath = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('toledo_caminho_rede') as any;
    if (rowPath && rowPath.valor && rowPath.valor.trim() !== '') {
      dir = rowPath.valor.trim();
    }
    
    const rowFormat = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('toledo_formato_arquivo') as any;
    if (rowFormat && rowFormat.valor && rowFormat.valor.trim() !== '') {
      format = rowFormat.valor.trim();
    }
  } catch (err) {
    // DB might not be ready yet during first call, use fallback
  }
  
  // Set default filenames based on format
  let fileNameTxt = 'ITENSMGV.TXT';
  let fileNameBak = 'ITENSMGV.BAK';
  
  if (format === 'toledo_mgv5') {
    fileNameTxt = 'TXITENS.TXT';
    fileNameBak = 'TXITENS.BAK';
  } else if (format === 'filizola') {
    fileNameTxt = 'CADTXT.TXT';
    fileNameBak = 'CADTXT.BAK';
  } else if (format === 'gertec') {
    fileNameTxt = 'PRICETAB.TXT';
    fileNameBak = 'PRICETAB.BAK';
  } else if (format === 'cads_txt') {
    fileNameTxt = 'SYSPPRO.TXT';
    fileNameBak = 'SYSPPRO.BAK';
  } else if (format === 'isolidus_txt') {
    fileNameTxt = 'IMP.ESTOQUE.TXT';
    fileNameBak = 'IMP.ESTOQUE.BAK';
  } else if (format === 'etiqueta_eletronica') {
    fileNameTxt = 'DATA.I1';
    fileNameBak = 'DATA.BAK';
  } else if (format === 'hiper_csv') {
    fileNameTxt = 'LISTAGEMDEPRODUTO.CSV';
    fileNameBak = 'LISTAGEMDEPRODUTO.BAK';
  } else if (format === 'bedgarline_csv') {
    fileNameTxt = 'RELATORIOPADRAORETRATO.CSV';
    fileNameBak = 'RELATORIOPADRAORETRATO.BAK';
  } else if (format === 'isolidus_csv') {
    fileNameTxt = 'LISTA DE PRODUTOS.CSV';
    fileNameBak = 'LISTA DE PRODUTOS.BAK';
  } else if (format === 'box_csv') {
    fileNameTxt = 'TABELADEPRECOSEMPORIO.CSV';
    fileNameBak = 'TABELADEPRECOSEMPORIO.BAK';
  } else if (format.includes('csv')) {
    fileNameTxt = 'PRODUTOS.CSV';
    fileNameBak = 'PRODUTOS.BAK';
  } else if (format.includes('xlsx')) {
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
let categorias: Record<string, string> = {};
try {
  if (fs.existsSync(PERSISTENT_CAT_PATH)) {
    categorias = JSON.parse(fs.readFileSync(PERSISTENT_CAT_PATH, 'utf-8'));
  } else {
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
} catch (err) {
  console.error('[TOLEDO] Erro ao carregar categorias.json:', err);
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ToledoItem {
  plu: string;
  preco: number;       // price in cents → will be stored as integer (e.g. 5880 = R$ 58.80)
  descricao: string;
  categoria: string;
}

// `parseToledoFile` is now handled by `parseFileContent` from `./file-parsers`

// ── File Reader with Retry ─────────────────────────────────────────────────────
async function readFileWithRetry(filePath: string, retries: number = MAX_RETRIES): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Read with Windows-1252 (latin1) encoding
      const buffer = fs.readFileSync(filePath);
      // Node.js 'latin1' maps to ISO-8859-1 which is a superset compatible with Windows-1252 for text
      const content = buffer.toString('latin1');
      return content;
    } catch (err: any) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        console.warn(`[TOLEDO] Arquivo bloqueado (tentativa ${attempt}/${retries}). Aguardando ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        console.error(`[TOLEDO] Erro ao ler arquivo (tentativa ${attempt}/${retries}):`, err.message);
        if (attempt === retries) return null;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  return null;
}

// ── Database Operations ────────────────────────────────────────────────────────
function processToledoItems(items: ToledoItem[]): number {
  const db = getDb();
  let updatedCount = 0;

  const insertOrUpdate = db.prepare(`
    INSERT INTO toledo_produtos (plu, descricao, preco, categoria, atualizado_em)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(plu) DO UPDATE SET
      preco = excluded.preco,
      categoria = excluded.categoria,
      atualizado_em = datetime('now', 'localtime')
    WHERE toledo_produtos.preco != excluded.preco
  `);

  // For new products, we need a separate insert to also set the descricao
  const insertNew = db.prepare(`
    INSERT OR IGNORE INTO toledo_produtos (plu, descricao, preco, categoria, atualizado_em)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
  `);

  // Check which products are new vs existing
  const existingCheck = db.prepare('SELECT plu, descricao, preco, categoria FROM toledo_produtos WHERE plu = ?');

  const transaction = db.transaction((toledoItems: ToledoItem[]) => {
    for (const item of toledoItems) {
      const existing = existingCheck.get(item.plu) as any;

      if (!existing) {
        // New product — insert with description
        insertNew.run(item.plu, item.descricao, item.preco, item.categoria);
        updatedCount++;
      } else if (
        existing.preco !== item.preco || 
        existing.categoria !== item.categoria || 
        existing.descricao !== item.descricao
      ) {
        // Existing product — update if price, description OR category changed
        db.prepare(`
          UPDATE toledo_produtos 
          SET preco = ?, descricao = ?, categoria = ?, atualizado_em = datetime('now', 'localtime') 
          WHERE plu = ?
        `).run(item.preco, item.descricao, item.categoria, item.plu);
        updatedCount++;
      }
    }
  });

  transaction(items);
  return updatedCount;
}

// ── Watcher Engine ─────────────────────────────────────────────────────────────
let lastMtime: number = 0;
let debounceTimer: NodeJS.Timeout | null = null;
let isProcessing = false;
let watcherActive = false;

async function processFile(filePath: string) {
  if (isProcessing) {
    console.log('[TOLEDO] Processamento já em andamento, ignorando...');
    return;
  }

  isProcessing = true;
  const startTime = Date.now();

  try {
    console.log(`[TOLEDO] ⏳ Iniciando processamento de ${path.basename(filePath)}...`);

    const content = await readFileWithRetry(filePath);
    if (!content) {
      console.error('[TOLEDO] ❌ Não foi possível ler o arquivo após todas as tentativas.');
      return;
    }

    const paths = getWatchedPaths();
    const rawItems = parseFileContent(content, paths.format);
    
    // Map categories (stripping leading zeros from PLU for robust matching)
    const items: ToledoItem[] = rawItems.map(item => {
      const cleanPlu = item.plu.replace(/^0+/, '');
      return {
        ...item,
        categoria: categorias[cleanPlu] || categorias[item.plu] || getCategoryFromDescription(item.descricao)
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
      const db = getDb();
      db.prepare(`
        INSERT INTO toledo_log (itens_processados, precos_atualizados, mensagem, criado_em)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `).run(items.length, updatedCount, `Processamento OK em ${elapsed}ms`);
    } catch (logErr) {
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
      const db = getDb();
      const produtosCloud = db.prepare(
        'SELECT plu, descricao, preco, categoria FROM toledo_produtos WHERE preco > 0'
      ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string }>;
      syncProdutos(produtosCloud);
    }
  } catch (err: any) {
    console.error('[TOLEDO] ❌ Erro no processamento:', err.message);

    // Log error without crashing the service
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO toledo_log (itens_processados, precos_atualizados, mensagem, criado_em)
        VALUES (0, 0, ?, datetime('now', 'localtime'))
      `).run(`ERRO: ${err.message}`);
    } catch (logErr) {
      // Silent — don't crash the service for a logging failure
    }
  } finally {
    isProcessing = false;
  }
}

function onFileChanged(filePath: string) {
  // Debounce: wait 3s to ensure the file is fully written
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processFile(filePath);
  }, DEBOUNCE_MS);
}

/**
 * Start the Toledo file watcher.
 * Uses polling (fs.watchFile) since the target is a network UNC path,
 * which doesn't reliably support fs.watch / FSEvents.
 */
export function startToledoWatcher() {
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
    } else if (fs.existsSync(paths.bak)) {
      const stat = fs.statSync(paths.bak);
      lastMtime = stat.mtimeMs;
      console.log(`[TOLEDO] ✅ Arquivo BAK encontrado. Última modificação: ${new Date(stat.mtimeMs).toLocaleString('pt-BR')}`);
      processFile(paths.bak);
    } else {
      console.warn(`[TOLEDO] ⚠️ Nenhum arquivo encontrado em ${paths.dir}. O watcher ficará ativo aguardando.`);
    }
  } catch (err: any) {
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
    } catch (err: any) {
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
    if (debounceTimer) clearTimeout(debounceTimer);
    watcherActive = false;
    console.log('[TOLEDO] Watcher desativado.');
  };
}

/**
 * Force a manual re-read of the Toledo file.
 * Used by the admin API endpoint.
 */
export async function forceToledoRefresh() {
  const paths = getWatchedPaths();
  if (fs.existsSync(paths.txt)) {
    await processFile(paths.txt);
    return { success: true, message: 'Leitura forçada do TXT concluída.' };
  } else if (fs.existsSync(paths.bak)) {
    await processFile(paths.bak);
    return { success: true, message: 'Leitura forçada do BAK concluída.' };
  } else {
    return { success: false, message: `Nenhum arquivo encontrado na pasta: ${paths.dir}` };
  }
}

/**
 * Reload the categories mapping from disk.
 */
export function reloadCategorias() {
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
  } catch (err) {
    console.error('[TOLEDO] Erro ao recarregar categorias:', err);
  }
}
