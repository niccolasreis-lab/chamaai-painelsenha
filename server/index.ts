import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dgram from 'dgram';
import cron from 'node-cron';
import { getDb } from '../electron/services/database';
import { startToledoWatcher, forceToledoRefresh, reloadCategorias, setBroadcastFn, syncToCatalogoProduto } from './toledo-watcher';
import { syncNovaSenha, syncStatusSenha, syncLimparSenhas, syncProdutos, startSupabaseCommandListener, stopSupabaseCommandListener, syncConfiguracaoPublica, startSyncWorker, stopSyncWorker, isSupabaseConfigured, setLoopbackToken, syncCatalogoCategorias, syncCatalogoProdutos, syncDeleteCatalogoItem } from './supabase-sync';
import { startCloudCheckinCron } from './services/cloud-license.service';
import { startCloudCommandsCron, stopCloudCommandsCron } from './services/cloud-commands.service';
import { createSupabaseAnonClient } from './services/supabase-config.service';
import { migrateDatabaseAndConfigs } from './categorizador';
import { planMediaFileReconciliation, resolveUploadPath } from './media-files';
import { isPublicDisplayReadRequest } from './public-display-routes';
import { isPublicOperatorRequest } from './public-operator-routes';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { setupMediaIndoorRoutes } from './media-indoor';
import {
  setupVignetteRoutes,
  startVignetteScheduler,
  stopVignetteScheduler,
} from './services/vignette-scheduler.service';
import { isTelaoTtsMode, TELAO_TTS_MODES } from '../src/shared/ttsMode';
import { normalizePortalBaseUrl } from '../electron/services/portal-url';
import { resolveRequestedQueue } from './ticket-queue-policy';
import {
  CHAMAAI_DATA_DIR,
  TTS_DIR,
  UPLOADS_DIR,
  ensureStorageDirectories,
  resolveManagedAssetPath,
  unlinkManagedAsset,
} from './storage';
import { setupTelaoAssetRoutes } from './telao-assets';

const app = express();
app.set('trust proxy', true);

export const loopbackToken = crypto.randomBytes(32).toString('hex');
setLoopbackToken(loopbackToken);

// --- MASTER REMOTO: Rate Limiting (Anti-Brute Force) ---
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(32).toString('hex');
  const derivedKey = crypto.scryptSync(password, usedSalt, 64);
  return { hash: derivedKey.toString('hex'), salt: usedSalt };
}

function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const { hash } = hashPassword(password, storedSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function hashOperatorPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

function verifyOperatorPassword(password: string, storedValue: string): boolean {
  if (!storedValue) return false;
  if (!storedValue.startsWith('scrypt$')) {
    return password === storedValue;
  }
  const parts = storedValue.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const storedHash = parts[2];
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedKey, storedBuffer);
}

function verifyUserPassword(password: string, storedValue: string): boolean {
  try {
    if (!storedValue) return false;
    // If it's scrypt (used by legacy operators)
    if (storedValue.startsWith('scrypt$')) {
      const parts = storedValue.split('$');
      if (parts.length !== 3) return false;
      const salt = parts[1];
      const storedHash = parts[2];
      const derivedKey = crypto.scryptSync(password, salt, 64);
      const storedBuffer = Buffer.from(storedHash, 'hex');
      if (derivedKey.length !== storedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(derivedKey, storedBuffer);
    }
    // If it's plaintext (some legacy setups)
    if (!storedValue.startsWith('$2b$') && !storedValue.startsWith('$2a$')) {
      const aBuf = Buffer.from(password);
      const bBuf = Buffer.from(storedValue);
      if (aBuf.length !== bBuf.length) {
        crypto.timingSafeEqual(aBuf, aBuf);
        return false;
      }
      return crypto.timingSafeEqual(aBuf, bBuf);
    }
    // Otherwise, it's bcrypt
    return bcrypt.compareSync(password, storedValue);
  } catch (e) {
    return false;
  }
}

function isRateLimited(ip: string): boolean {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() < record.blockedUntil) return true;
  if (Date.now() >= record.blockedUntil && record.count >= MAX_LOGIN_ATTEMPTS) {
    loginAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(ip: string): void {
  const record = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  record.count++;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
  loginAttempts.set(ip, record);
}

function clearFailedAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// --- MASTER SERVER DETECTION (cache com TTL de 30s) ---
let cachedLocalIPs: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 segundos

function getLocalIPs(): Set<string> {
  const now = Date.now();
  if (cachedLocalIPs && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedLocalIPs;
  }
  const ips = new Set<string>(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Adiciona tanto IPv4 quanto IPv6 e suas formas mapeadas
      ips.add(iface.address);
      if (iface.family === 'IPv4') {
        ips.add(`::ffff:${iface.address}`);
      }
    }
  }
  cachedLocalIPs = ips;
  cacheTimestamp = now;
  return ips;
}

function isRequestLocal(req: express.Request): boolean {
  const localIPs = getLocalIPs();
  const clientIP = req.ip || req.socket.remoteAddress || '';
  return localIPs.has(clientIP);
}

function isLoopback(req: express.Request): boolean {
  const clientIP = req.ip || req.socket.remoteAddress || '';
  return clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
}

// Middleware: injeta header X-Is-Master em todas as respostas
function injectMasterHeader(req: express.Request, res: express.Response, next: express.NextFunction) {
  let isMaster = isRequestLocal(req);
  
  // Also check remote token
  if (!isMaster) {
    const token = req.headers['x-master-token'] as string;
    if (token) {
      try {
        const db = getDb();
        const session = db.prepare(
          "SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')"
        ).get(token) as any;
        if (session) isMaster = true;
      } catch (err) {}
    }
  }
  
  // Check if master password exists
  let hasMasterPassword = false;
  try {
    const db = getDb();
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get() as any;
    hasMasterPassword = !!(row && row.valor);
  } catch (err) {}
  
  res.setHeader('X-Is-Master', isMaster ? 'true' : 'false');
  res.setHeader('X-Has-Master-Password', hasMasterPassword ? 'true' : 'false');
  next();
}

// Middleware guard: bloqueia escrita administrativa de clientes remotos
function requireMaster(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Acesso local sempre permitido
  if (isRequestLocal(req)) return next();
  
  // Verifica token remoto
  const token = req.headers['x-master-token'] as string;
  if (token) {
    try {
      const db = getDb();
      const session = db.prepare(
        "SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')"
      ).get(token) as any;
      if (session) return next();
    } catch (err) {
      console.error('[MASTER REMOTO] Erro ao validar token:', err);
    }
  }
  
  console.warn(`[SECURITY] ⛔ Tentativa de escrita admin bloqueada do IP: ${req.ip}`);
  return res.status(403).json({ 
    error: 'Acesso negado. Alterações administrativas só podem ser feitas no Servidor Master.',
    isMaster: false 
  });
}

// Middleware guard: valida token de operador
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Se já foi autenticado pelo JWT no remoteAuthMiddleware, permite e define o operador_id
  if ((req as any).user) {
    (req as any).operador_id = (req as any).user.id;
    return next();
  }

  // Loopback authentication bypass using unique token
  const loopbackHeader = req.headers['x-loopback-token'] as string;
  if (loopbackHeader && loopbackHeader === loopbackToken) {
    (req as any).operador_id = 1; // default to admin id
    return next();
  }

  // Se for master local e não exigir auth, permite
  if (isRequestLocal(req)) {
    try {
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'acesso_local_exige_auth'").get() as any;
      if (!row || row.valor !== '1') {
        return next();
      }
    } catch (err) {}
  }

  const token = req.headers['x-operator-token'] as string;
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const db = getDb();
    const session = db.prepare(
      "SELECT * FROM sessoes_operador WHERE token = ? AND expira_em > datetime('now', 'localtime')"
    ).get(token) as any;

    if (!session) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    }

    // Opcional: estender o TTL da sessão aqui
    (req as any).operador_id = session.operador_id;
    return next();
  } catch (err) {
    console.error('[AUTH] Erro ao validar token de operador:', err);
    return res.status(500).json({ error: 'Erro interno ao validar autenticação.' });
  }
}

let memoryFallbackSecret: string | null = null;
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  const db = getDb();
  try {
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'jwt_secret'").get() as any;
    if (row && row.valor) {
      return row.valor;
    } else {
      const newSecret = crypto.randomBytes(32).toString('hex');
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('jwt_secret', ?)").run(newSecret);
      return newSecret;
    }
  } catch (err) {
    console.error('[AUTH] Erro ao obter JWT_SECRET do banco:', err);
    if (!memoryFallbackSecret) {
      memoryFallbackSecret = crypto.randomBytes(32).toString('hex');
    }
    return memoryFallbackSecret;
  }
}

function remoteAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const localNoLoginEnabled = process.env.LOCAL_APP_NO_LOGIN === 'true';
  const isLocal = isLoopback(req);
  const isElectron = typeof process !== 'undefined' && !!process.versions.electron;

  if (localNoLoginEnabled && isLocal && isElectron) {
    (req as any).user = {
      id: 1,
      login: 'local_admin',
      perfil: 'admin',
      origem: 'electron_local'
    };
    return next();
  }

  // 1. Verificar se req.ip é loopback
  const clientIP = req.ip || req.socket.remoteAddress || '';
  const localIPs = getLocalIPs();
  const isLoopbackVal = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1' || localIPs.has(clientIP);

  // Obter a configuração auth_local_obrigatorio
  let authLocalObrigatorio = false;
  try {
    const db = getDb();
    const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'auth_local_obrigatorio'").get() as any;
    if (row && row.valor === '1') {
      authLocalObrigatorio = true;
    }
  } catch (e) {}

  if (isLoopbackVal && !authLocalObrigatorio) {
    return next();
  }

  // 2. Verificar se a rota é pública
  const reqPath = req.baseUrl ? req.baseUrl + req.path : req.path;
  const method = req.method;

  // Lista de rotas sempre públicas:
  if (
    reqPath === '/api/login' ||
    reqPath === '/api/logout' ||
    reqPath.startsWith('/api/telao/sse') ||
    reqPath.startsWith('/api/portal')
  ) {
    return next();
  }

  // O APK Operador é um appliance de LAN sem login. Libere somente seu
  // snapshot e as três ações dedicadas; rotas administrativas continuam
  // protegidas pelo mesmo middleware.
  if (isPublicOperatorRequest(method, reqPath)) {
    return next();
  }

  // Ler dados do telão, fila, mídias e chamadas recentes, e criar senha (totem)
  if (isPublicDisplayReadRequest(method, reqPath)) {
    return next();
  }

  // Emissão de senha do Totem (POST)
  if (method === 'POST' && reqPath === '/api/senhas') {
    return next();
  }

  // 3. Caso contrário, verificar token
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  const token = authHeader.substring(7);
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as any;
    (req as any).user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }
}

app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['X-Is-Master', 'X-Has-Master-Password']
}));
app.use(injectMasterHeader);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use('/api', remoteAuthMiddleware);

let sseClients: express.Response[] = [];
const telaoSseClients: Record<string, express.Response[]> = {};
let heartbeatInterval: NodeJS.Timeout | null = null;


export function startServer() {
  const PORT = 3001;
  ensureStorageDirectories();

  // Configure Multer for local storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage });

  function reconcileMidias() {
    try {
      const db = getDb();
      // Only process media that aren't marked as deleted or failed
      const activeMidias = db.prepare("SELECT id, caminho, file_status FROM midias WHERE deleted_at IS NULL AND file_status != 'failed'").all() as any[];
      const changes = planMediaFileReconciliation(activeMidias, UPLOADS_DIR);
      let missingCount = 0;
      let recoveredCount = 0;

      for (const change of changes) {
        db.prepare('UPDATE midias SET file_status = ? WHERE id = ?').run(change.status, change.id);
        if (change.status === 'missing') missingCount++;
        else recoveredCount++;
      }
      
      // Checking for orphan files in UPLOADS_DIR (that are not in DB)
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
          const expectedPath = `/uploads/${file}`;
          const dbEntry = db.prepare("SELECT id FROM midias WHERE caminho = ?").get(expectedPath);
          const configEntry = db.prepare("SELECT chave FROM configuracoes WHERE valor = ?").get(expectedPath);
          if (!dbEntry && !configEntry && file !== 'desktop.ini') {
            console.warn(`[RECONCILE] Arquivo órfão detectado: ${file}`);
          }
        }
      }
      
      if (missingCount > 0) {
        console.warn(`[RECONCILE] ${missingCount} mídias marcadas como 'missing' (arquivo não encontrado).`);
      }
      if (recoveredCount > 0) {
        console.log(`[RECONCILE] ${recoveredCount} mídias recuperadas na pasta persistente.`);
      }
    } catch (err) {
      console.error('[RECONCILE] Erro ao reconciliar mídias:', err);
    }
  }

  // Execute reconciliation on startup
  reconcileMidias();

  // Upload configurado especificamente para arquivos de backup grandes
  const backupUpload = multer({ 
    dest: path.join(process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi', 'Backups', '_temp'),
    limits: { fileSize: 500 * 1024 * 1024 } // Limite rígido de 500MB
  });

  // O cache persistente é controlado pelo telão; evite o cache HTTP ilimitado do WebView.
  app.use('/uploads', express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));

  // Serve static files from tts folder

  // Migração única: depois de concluída, uma limpeza intencional no Admin não
  // pode ser revertida por uma cópia silenciosa no próximo boot.
  const rootTtsDir = path.join(process.cwd(), 'tts');
  const ttsMigrationMarker = path.join(TTS_DIR, '.legacy-migration-v1-complete');
  if (fs.existsSync(rootTtsDir) && !fs.existsSync(ttsMigrationMarker)) {
    try {
      let copiedLegacyTts = false;
      const p1 = path.join(rootTtsDir, 'senha_1_100');
      const p2 = path.join(rootTtsDir, 'senha_1_100_2_chamada');
      const t1 = path.join(TTS_DIR, 'tipo1');
      const t2 = path.join(TTS_DIR, 'tipo2');

      if (fs.existsSync(p1)) {
        const files = fs.readdirSync(p1);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.mp3')) {
            const dest = path.join(t1, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(p1, file), dest);
              copiedLegacyTts = true;
            }
          }
        }
      }
      if (fs.existsSync(p2)) {
        const files = fs.readdirSync(p2);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.mp3')) {
            const dest = path.join(t2, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(p2, file), dest);
              copiedLegacyTts = true;
            }
          }
        }
      }
      if (copiedLegacyTts) {
        getDb().prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('telao_tts_revision', ?, datetime('now'))").run(crypto.randomUUID());
      }
      fs.writeFileSync(ttsMigrationMarker, new Date().toISOString(), 'utf8');
      console.log('[TTS MIGRATION] Migração automática de áudios TTS concluída.');
    } catch (migErr) {
      console.error('[TTS MIGRATION] Erro ao migrar pastas antigas:', migErr);
    }
  }

  app.use('/tts', express.static(TTS_DIR, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));

  // Resolve o diretório de atualizações locais de forma dinâmica
  function getLocalUpdatesDir(): string {
    try {
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'update_path'").get() as any;
      if (row && row.valor) {
        return row.valor;
      }
    } catch (e) {}
    return 'C:\\ChamaAi_Atualizacoes';
  }

  // Serve compiled offline updates locally over HTTP to bypass file:// protocol download errors
  app.use('/local-updates', (req, res, next) => {
    const localUpdatesDir = getLocalUpdatesDir();
    if (req.path.endsWith('.exe') && req.path.includes('-')) {
      const spacePath = req.path.replace(/-/g, ' ');
      const fullPath = path.join(localUpdatesDir, spacePath.substring(1));
      if (fs.existsSync(fullPath)) {
        req.url = spacePath;
      }
    }
    next();
  });
  app.use('/local-updates', (req, res, next) => {
    const localUpdatesDir = getLocalUpdatesDir();
    if (!fs.existsSync(localUpdatesDir)) {
      try { fs.mkdirSync(localUpdatesDir, { recursive: true }); } catch (e) {}
    }
    express.static(localUpdatesDir, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      }
    })(req, res, next);
  });

  // Serve frontend static files from dist folder
  const DIST_DIR = path.join(__dirname, '../../dist');
  if (fs.existsSync(DIST_DIR)) {
    console.log('[SERVER] Serving frontend from:', DIST_DIR);
    app.use(express.static(DIST_DIR));
  }

  // --- CRON JOBS ---
  // Roda todos os dias à meia-noite
  cron.schedule('0 0 * * *', () => {
    try {
      const db = getDb();
      const config = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'reset_diario_automatico'").get() as any;
      if (config && config.valor === '1') {
        console.log('[CRON] Iniciando reset diário automático das senhas...');
        db.prepare("UPDATE balcoes SET contador_atual = 0").run();
        
        // Limpa a fila de espera para o novo dia
        db.prepare("DELETE FROM senhas WHERE status = 'aguardando'").run();

        const hoje = new Date().toISOString().split('T')[0];
        db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('ultimo_reset', ?, datetime('now'))").run(hoje);

        // Sync: limpa senhas na nuvem também
        syncLimparSenhas();
        
        // Otimização do banco de dados
        console.log('[CRON] Otimizando banco de dados (VACUUM)...');
        db.exec("VACUUM");
        
        // Emitir evento SSE de reset ao virar o dia
        const eventoReset = {
          tipo: 'DIA_RESETADO',
          timestamp: new Date().toISOString(),
          mensagem: 'Novo dia iniciado. Recarregando estado.'
        };
        broadcastEvent('DIA_RESETADO', eventoReset);

        // Notifica todos os terminais para recarregarem a página e limparem memória
        broadcastEvent('RECARREGAR_PAGINA', { reason: 'daily_maintenance' });
        
        console.log('[CRON] Manutenção diária concluída com sucesso.');
      }
    } catch (err) {
      console.error('[CRON] Erro ao resetar senhas:', err);
    }

    // --- BACKUP INTELIGENTE (Agendado com opt-in) ---
    try {
      executarBackupAgendado();
    } catch (err) {
      console.error('[CRON] ❌ Erro ao executar backup agendado:', err);
    }
    // ----------------------------------

    // --- EXPIRAÇÃO DE MÍDIAS ---
    try {
      const db = getDb();
      const info = db.prepare(`
        UPDATE midias 
        SET status = 'expirado' 
        WHERE data_expiracao IS NOT NULL AND status = 'ativo' AND data_expiracao < date('now')
      `).run();
      if (info.changes > 0) {
        console.log(`[CRON] ${info.changes} mídia(s) expiraram hoje.`);
        broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'expire' });
      }
    } catch (err) {
      console.error('[CRON] Erro ao expirar mídias:', err);
    }
    // ----------------------------------

  });
  // -----------------


  // --- Admin Status Endpoint ---
  app.get('/api/admin/status', (req, res) => {
    const isMasterLocal = isRequestLocal(req);
    let isMasterRemote = false;
    let hasMasterPassword = false;
    
    // Check if remote token is valid
    const token = req.headers['x-master-token'] as string;
    if (token) {
      try {
        const db = getDb();
        const session = db.prepare(
          "SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')"
        ).get(token) as any;
        if (session) isMasterRemote = true;
      } catch (err) {}
    }
    
    // Check if master password has been configured
    try {
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get() as any;
      hasMasterPassword = !!(row && row.valor);
    } catch (err) {}
    
    let acessoLocalExigeAuth = false;
    try {
      const db = getDb();
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'acesso_local_exige_auth'").get() as any;
      acessoLocalExigeAuth = row ? row.valor === '1' : false;
    } catch (err) {}

    let isNewInstall = false;
    try {
      const db = getDb();
      const adminUser = db.prepare("SELECT senha_hash, primeiro_acesso FROM operadores WHERE login = 'admin'").get() as any;
      if (adminUser) {
        isNewInstall = adminUser.senha_hash === 'admin' || adminUser.primeiro_acesso === 1;
      }
    } catch (err) {}
    
    res.json({ 
      isMaster: isMasterLocal || isMasterRemote, 
      isMasterLocal,
      isMasterRemote,
      hasMasterPassword,
      acessoLocalExigeAuth,
      isNewInstall,
      clientIP: req.ip 
    });
  });

  // --- DEBUG SYNC ENDPOINT (Inspeção Completa da Fila Supabase) ---
  app.get('/api/debug-sync', (req, res) => {
    try {
      const db = getDb();

      // 1. Estatísticas gerais da fila
      const totalItems = db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get() as any;
      
      // 2. Contagem por tabela
      const byTable = db.prepare(
        'SELECT tabela, COUNT(*) as count FROM supabase_sync_queue GROUP BY tabela ORDER BY count DESC'
      ).all();

      // 3. Contagem por ação
      const byAction = db.prepare(
        'SELECT acao, COUNT(*) as count FROM supabase_sync_queue GROUP BY acao ORDER BY count DESC'
      ).all();

      // 4. Itens que falharam (excederam max_tentativas)
      const failedItems = db.prepare(
        'SELECT * FROM supabase_sync_queue WHERE tentativas >= max_tentativas ORDER BY id DESC LIMIT 10'
      ).all();

      // 5. Itens pendentes com tentativas (risco de falha)
      const retryItems = db.prepare(
        'SELECT * FROM supabase_sync_queue WHERE tentativas > 0 AND tentativas < max_tentativas ORDER BY tentativas DESC LIMIT 10'
      ).all();

      // 6. Últimos 10 itens enfileirados (_fifo)
      const recentItems = db.prepare(
        'SELECT * FROM supabase_sync_queue ORDER BY id DESC LIMIT 10'
      ).all();

      // 7. Idade do item mais antigo
      const oldestItem = db.prepare(
        'SELECT id, tabela, acao, tentativas, criado_em FROM supabase_sync_queue ORDER BY id ASC LIMIT 1'
      ).get();

      // 8. Status de tentativas
      const attemptStats = db.prepare(
        'SELECT tentativas, COUNT(*) as count FROM supabase_sync_queue GROUP BY tentativas ORDER BY tentativas ASC'
      ).all();

      res.json({
        isSupabaseConfigured,
        envUrl: process.env.VITE_SUPABASE_URL ? 'set' : 'not set',
        envKey: process.env.VITE_SUPABASE_KEY ? 'set' : 'not set',
        queue: {
          total: totalItems?.count || 0,
          byTable,
          byAction,
          attemptStats,
          oldestItem: oldestItem || null,
          failedItems,
          retryItems,
          recentItems
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- DEBUG SYNC: Retry manual de itens falhos ---
  app.post('/api/debug-sync/retry', (req, res) => {
    try {
      const db = getDb();
      const result = db.prepare(
        'UPDATE supabase_sync_queue SET tentativas = 0 WHERE tentativas >= max_tentativas'
      ).run();
      res.json({ 
        message: `${result.changes} itens resetados para retry`,
        retriedCount: result.changes 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- DEBUG SYNC: Limpar fila inteira ---
  app.post('/api/debug-sync/clear', (req, res) => {
    try {
      const db = getDb();
      const count = db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get() as any;
      db.prepare('DELETE FROM supabase_sync_queue').run();
      res.json({ 
        message: `${count?.count || 0} itens removidos da fila`,
        clearedCount: count?.count || 0 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- DEBUG SYNC: Deletar item específico por ID ---
  app.delete('/api/debug-sync/:id', (req, res) => {
    try {
      const db = getDb();
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido' });
      }
      const item = db.prepare('SELECT * FROM supabase_sync_queue WHERE id = ?').get(id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      db.prepare('DELETE FROM supabase_sync_queue WHERE id = ?').run(id);
      res.json({ message: `Item ${id} removido`, deletedItem: item });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Endpoint for Dashboard Charts ---
  app.get('/api/dashboard/metricas', requireMaster, (req, res) => {
    try {
      const db = getDb();
      
      // Senhas por hora (hoje)
      const porHora = db.prepare(`
        SELECT strftime('%H', criado_em) as hora, COUNT(*) as quantidade
        FROM senhas
        WHERE date(criado_em) = date('now', 'localtime')
        GROUP BY strftime('%H', criado_em)
        ORDER BY hora ASC
      `).all();

      // Senhas por balcão
      const porBalcao = db.prepare(`
        SELECT b.nome, COUNT(s.id) as quantidade
        FROM senhas s
        JOIN balcoes b ON s.balcao_id = b.id
        WHERE date(s.criado_em) = date('now', 'localtime')
        GROUP BY b.id
      `).all();

      res.json({
        porHora,
        porBalcao
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- MASTER REMOTO: Autenticação ---
  app.post('/api/admin/auth-master', (req, res) => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Rate limiting check
    const isLocal = isLoopback(req);
    const isElectron = typeof process !== 'undefined' && !!process.versions.electron;
    const bypassRateLimit = process.env.LOCAL_APP_NO_LOGIN === 'true' && isLocal && isElectron;

    if (isRateLimited(clientIP) && !bypassRateLimit) {
      return res.status(429).json({ 
        error: 'Muitas tentativas. Tente novamente em 15 minutos.',
        blockedUntil: loginAttempts.get(clientIP)?.blockedUntil 
      });
    }
    
    const { senha } = req.body;
    if (!senha || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Senha não informada.' });
    }
    
    try {
      const db = getDb();
      const hashRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get() as any;
      const saltRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_salt'").get() as any;
      
      if (!hashRow || !saltRow || !hashRow.valor || !saltRow.valor) {
        return res.status(403).json({ error: 'Senha de acesso remoto não configurada. Configure no Servidor Master.' });
      }
      
      const valido = verifyPassword(senha, hashRow.valor, saltRow.valor);
      if (!valido) {
        recordFailedAttempt(clientIP);
        const record = loginAttempts.get(clientIP);
        const remaining = MAX_LOGIN_ATTEMPTS - (record?.count || 0);
        return res.status(401).json({ 
          error: `Senha incorreta. ${remaining > 0 ? `${remaining} tentativa(s) restante(s).` : 'IP bloqueado por 15 minutos.'}` 
        });
      }
      
      // Gera token de sessão
      clearFailedAttempts(clientIP);
      const token = crypto.randomBytes(48).toString('hex');
      const TTL_HOURS = 12;
      
      // Cria tabela se não existir
      db.exec(`CREATE TABLE IF NOT EXISTS tokens_remotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        ip_origem TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        expira_em TEXT NOT NULL
      )`);
      
      // Limpa tokens expirados
      db.prepare("DELETE FROM tokens_remotos WHERE expira_em <= datetime('now', 'localtime')").run();
      
      // Insere novo token
      db.prepare(
        "INSERT INTO tokens_remotos (token, ip_origem, expira_em) VALUES (?, ?, datetime('now', 'localtime', '+' || ? || ' hours'))"
      ).run(token, clientIP, TTL_HOURS);
      
      console.log(`[MASTER REMOTO] ✅ Sessão criada para IP: ${clientIP}`);
      res.json({ token, expiresInHours: TTL_HOURS });
    } catch (err: any) {
      console.error('[MASTER REMOTO] Erro na autenticação:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- MASTER REMOTO: Logout (Revogar Token) ---
  app.post('/api/admin/logout-master', (req, res) => {
    const token = req.headers['x-master-token'] as string;
    if (!token) return res.status(400).json({ error: 'Token não informado.' });
    
    try {
      const db = getDb();
      db.prepare("DELETE FROM tokens_remotos WHERE token = ?").run(token);
      console.log(`[MASTER REMOTO] 🔒 Token revogado pelo IP: ${req.ip}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- MASTER REMOTO: Definir/Alterar Senha ---
  app.post('/api/admin/set-master-password', (req, res) => {
    // Apenas localhost OU portador de token válido pode definir/alterar senha
    const isLocal = isRequestLocal(req);
    const token = req.headers['x-master-token'] as string;
    let isRemoteAuth = false;
    
    if (token) {
      try {
        const db = getDb();
        const session = db.prepare(
          "SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')"
        ).get(token) as any;
        if (session) isRemoteAuth = true;
      } catch (err) {}
    }
    
    if (!isLocal && !isRemoteAuth) {
      return res.status(403).json({ error: 'Apenas o servidor master ou uma sessão autenticada pode alterar a senha.' });
    }
    
    const { senha } = req.body;
    if (!senha || typeof senha !== 'string' || senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    
    try {
      const db = getDb();
      const { hash, salt } = hashPassword(senha);
      
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('master_remoto_hash', ?, datetime('now'))").run(hash);
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('master_remoto_salt', ?, datetime('now'))").run(salt);
      
      console.log(`[MASTER REMOTO] 🔐 Senha de acesso remoto ${isLocal ? 'definida' : 'alterada'} com sucesso.`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/network-info', (req, res) => {
    const nets = os.networkInterfaces();
    const results: string[] = [];

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === 'IPv4' && !net.internal) {
          results.push(net.address);
        }
      }
    }
    res.json({ ips: results });
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  // --- TELÕES (Musardos) ---
  app.get('/api/telao/sse/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (!telaoSseClients[code]) {
      telaoSseClients[code] = [];
    }
    telaoSseClients[code].push(res);

    req.on('close', () => {
      telaoSseClients[code] = telaoSseClients[code].filter(client => client !== res);
      if (telaoSseClients[code].length === 0) {
        delete telaoSseClients[code];
      }
    });
  });

  function broadcastToTelao(code: string, event: string, data: any) {
    const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
    if (telaoSseClients[code]) {
      telaoSseClients[code].forEach(client => client.write(payload));
    }
  }

  app.get('/api/telao/init', (req, res) => {
    try {
      const db = getDb();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      db.prepare("INSERT INTO teloes (code, status) VALUES (?, 'pendente')").run(code);
      res.json({ code });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/telao/profile/:code', (req, res) => {
    try {
      const db = getDb();
      const code = (req.params.code as string).toUpperCase();
      const telao = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code) as any;
      if (!telao) return res.status(404).json({ error: 'Telão não encontrado' });
      res.json(telao);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/telao/list', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const teloes = db.prepare('SELECT * FROM teloes ORDER BY criado_em DESC').all();
      res.json(teloes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const normalizeTelaoLayout = (value: unknown): 'classic' | 'sidebar' | 'l-shape' | null => {
    if (value === undefined || value === null || value === '') return 'classic';
    return value === 'classic' || value === 'sidebar' || value === 'l-shape' ? value : null;
  };

  app.post('/api/telao/vincular', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const { code, nome, modulo_painel, modulo_encarte, modulo_midia, encarte_categorias, template_layout } = req.body;
      const templateLayout = normalizeTelaoLayout(template_layout);
      if (!templateLayout) {
        return res.status(400).json({ error: 'Layout inválido. Use classic, sidebar ou l-shape.' });
      }
      const stmt = db.prepare(`
        UPDATE teloes 
        SET nome = ?, status = 'vinculado', modulo_painel = ?, modulo_encarte = ?, modulo_midia = ?, encarte_categorias = ?, template_layout = ?, vinculado_em = datetime('now')
        WHERE code = ?
      `);
      stmt.run(nome, modulo_painel ? 1 : 0, modulo_encarte ? 1 : 0, modulo_midia ? 1 : 0, encarte_categorias || '', templateLayout, code.toUpperCase());
      
      const perfil = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code.toUpperCase());
      broadcastToTelao(code.toUpperCase(), 'TELAO_VINCULADO', perfil);
      res.json({ success: true, perfil });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/telao/:code', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const code = (req.params.code as string).toUpperCase();
      const { nome, modulo_painel, modulo_encarte, modulo_midia, encarte_categorias, template_layout } = req.body;
      const templateLayout = normalizeTelaoLayout(template_layout);
      if (!templateLayout) {
        return res.status(400).json({ error: 'Layout inválido. Use classic, sidebar ou l-shape.' });
      }
      const stmt = db.prepare(`
        UPDATE teloes 
        SET nome = ?, modulo_painel = ?, modulo_encarte = ?, modulo_midia = ?, encarte_categorias = ?, template_layout = ?
        WHERE code = ?
      `);
      stmt.run(nome, modulo_painel ? 1 : 0, modulo_encarte ? 1 : 0, modulo_midia ? 1 : 0, encarte_categorias || '', templateLayout, code);
      
      const perfil = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code);
      broadcastToTelao(code, 'TELAO_ATUALIZADO', perfil);
      res.json({ success: true, perfil });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/telao/:code', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const code = (req.params.code as string).toUpperCase();
      // Remove from DB so it's a completely clean state (the telao will request /init again if it reloads, or we just tell it to DESVINCULADO)
      db.prepare('DELETE FROM teloes WHERE code = ?').run(code);
      broadcastToTelao(code, 'TELAO_DESVINCULADO', { code });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/telao/:code/reiniciar', requireMaster, (req, res) => {
    const code = (req.params.code as string).toUpperCase();
    broadcastToTelao(code, 'RECARREGAR_PAGINA', { reason: 'admin_command' });
    res.json({ success: true });
  });
  // -------------------------

  app.get('/api/senhas', (req, res) => {
    try {
      const db = getDb();
      const senhas = db.prepare(`
        SELECT s.*, c.guiche 
        FROM senhas s
        LEFT JOIN (
          SELECT senha_id, guiche, MAX(id) as max_id 
          FROM chamadas 
          GROUP BY senha_id
        ) latest_c ON s.id = latest_c.senha_id
        LEFT JOIN chamadas c ON latest_c.max_id = c.id
        ORDER BY s.id DESC 
        LIMIT 50
      `).all();
      res.json(senhas);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chamadas/recentes', (req, res) => {
    try {
      const db = getDb();
      const recent = db.prepare(`
        SELECT s.id, s.numero, s.preferencial, s.status, c.guiche, b.nome as balcao_nome, s.chamada_em
        FROM (
          SELECT senha_id, MAX(id) as max_id
          FROM chamadas
          GROUP BY senha_id
        ) latest
        JOIN chamadas c ON c.id = latest.max_id
        JOIN senhas s ON c.senha_id = s.id
        JOIN balcoes b ON s.balcao_id = b.id
        ORDER BY c.id DESC
        LIMIT 5
      `).all();
      res.json(recent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fila de espera (apenas senhas aguardando, ordenadas por prioridade)
  app.get('/api/fila', (req, res) => {
    try {
      const db = getDb();
      const fila = db.prepare(
        `SELECT * FROM senhas WHERE status = 'aguardando' ORDER BY preferencial DESC, id ASC`
      ).all();
      res.json(fila);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/senhas/:id/status', (req, res) => {
    try {
      const db = getDb();
      const senha = db.prepare('SELECT id, status, numero, preferencial FROM senhas WHERE id = ?').get(req.params.id) as any;
      if (!senha) {
        return res.status(404).json({ error: 'Senha não encontrada' });
      }

      let posicao: number | null = null;
      if (senha.status === 'aguardando') {
        const ahead = db.prepare(
          `SELECT COUNT(*) as count FROM senhas 
           WHERE status = 'aguardando' 
             AND (
               (preferencial > ?) 
               OR 
               (preferencial = ? AND id < ?)
             )`
        ).get(senha.preferencial, senha.preferencial, senha.id) as any;
        posicao = (ahead?.count ?? 0) + 1;
      }

      res.json({ status: senha.status, numero: senha.numero, aguardando: senha.status === 'aguardando', posicao });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/senhas', (req: express.Request, res: express.Response) => {
    try {
      const { balcao_id, preferencial, nome_cliente } = req.body;
      const db = getDb();
      let queueSelection: { preferential: boolean };
      try {
        queueSelection = resolveRequestedQueue(db, preferencial);
      } catch (queueError: any) {
        return res.status(409).json({ error: queueError.message, code: 'QUEUE_DISABLED' });
      }
      console.log('Emitindo senha para balcão:', balcao_id, 'Preferencial:', preferencial, 'Nome:', nome_cliente);
      
      const balcaoIdNum = Number(balcao_id);
      
      const emitirSenhaTx = db.transaction((balcaoId: number, isPreferencial: number, nomeCliente: string | null) => {
        // Increment counter with reset at 999
        db.prepare(`
          UPDATE balcoes 
          SET contador_atual = CASE 
            WHEN contador_atual >= 999 THEN 0 
            ELSE contador_atual + 1 
          END 
          WHERE id = ?
        `).run(balcaoId);
        
        const balcao = db.prepare('SELECT contador_atual FROM balcoes WHERE id = ?').get(balcaoId) as any;
        if (!balcao) throw new Error('Balcão não encontrado');
        
        const numero = (balcao.contador_atual !== undefined ? balcao.contador_atual : balcao.CONTADOR_ATUAL) ?? 0;
        
        const result = db.prepare('INSERT INTO senhas (balcao_id, numero, preferencial, status, nome_cliente) VALUES (?, ?, ?, ?, ?)')
                         .run(balcaoId, numero, isPreferencial, 'aguardando', nomeCliente);
        
        const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get() as any;
        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          id: result.lastInsertRowid,
          numero,
          aguardando_count: aguardandoCount.count,
          geral: countGeral.count,
          preferencial: countPref.count
        };
      });

      const txResult = emitirSenhaTx(balcaoIdNum, queueSelection.preferential ? 1 : 0, nome_cliente || null);

      const novaSenha = {
        id: txResult.id,
        balcao_id: balcaoIdNum,
        numero: txResult.numero,
        preferencial: queueSelection.preferential ? 1 : 0,
        status: 'aguardando',
        aguardando_count: txResult.aguardando_count,
        nome_cliente: nome_cliente || null
      };

      broadcastEvent('NOVA_SENHA_EMITIDA', novaSenha);

      // Notifica os contadores de fila dos operadores touch
      try {
        broadcastEvent('queue-update', {
          geral: txResult.geral,
          preferencial: txResult.preferencial
        });
      } catch (errQueue) {
        console.error('Erro ao emitir queue-update:', errQueue);
      }

      // Sync: espelha a nova senha na nuvem para o Portal do Cliente
      syncNovaSenha(novaSenha.id, txResult.numero, 'aguardando', queueSelection.preferential);

      res.status(201).json(novaSenha);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // OPERADORES & ADMIN LOGIN ROUTES (UNIFIED)
  app.post('/api/login', (req, res) => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Rate limiting check
    const isLocal = isLoopback(req);
    const isElectron = typeof process !== 'undefined' && !!process.versions.electron;
    const bypassRateLimit = process.env.LOCAL_APP_NO_LOGIN === 'true' && isLocal && isElectron;

    if (isRateLimited(clientIP) && !bypassRateLimit) {
      return res.status(429).json({ 
        error: 'Muitas tentativas. Tente novamente em 15 minutos.',
        blockedUntil: loginAttempts.get(clientIP)?.blockedUntil 
      });
    }

    try {
      const { login, senha } = req.body;
      if (!login || !senha) {
        return res.status(400).json({ error: 'Login e senha são obrigatórios.' });
      }

      const db = getDb();
      const user = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login.trim()) as any;

      if (!user) {
        recordFailedAttempt(clientIP);
        const record = loginAttempts.get(clientIP);
        const remaining = MAX_LOGIN_ATTEMPTS - (record?.count || 0);
        return res.status(401).json({ 
          error: `Login ou senha incorretos. ${remaining > 0 ? `${remaining} tentativa(s) restante(s).` : 'IP bloqueado por 15 minutos.'}` 
        });
      }

      const isMatch = verifyUserPassword(senha, user.senha_hash);
      if (!isMatch) {
        recordFailedAttempt(clientIP);
        const record = loginAttempts.get(clientIP);
        const remaining = MAX_LOGIN_ATTEMPTS - (record?.count || 0);
        return res.status(401).json({ 
          error: `Login ou senha incorretos. ${remaining > 0 ? `${remaining} tentativa(s) restante(s).` : 'IP bloqueado por 15 minutos.'}` 
        });
      }

      clearFailedAttempts(clientIP);

      const secret = getJwtSecret();
      const token = jwt.sign(
        { id: user.id, login: user.login, perfil: user.perfil },
        secret,
        { expiresIn: '3650d' }
      );

      // Registrar sessão em sessoes_operador para compatibilidade com requireAuth herdado
      try {
        db.prepare("DELETE FROM sessoes_operador WHERE expira_em <= datetime('now', 'localtime')").run();
        let opId = 1;
        const op = db.prepare('SELECT id FROM operadores WHERE login = ?').get(user.login) as any;
        if (op) opId = op.id;
        db.prepare(
          "INSERT OR REPLACE INTO sessoes_operador (token, operador_id, expira_em) VALUES (?, ?, datetime('now', 'localtime', '+36500 days'))"
        ).run(token, opId);
      } catch (sessErr) {
        console.error('[AUTH] Erro ao gravar sessoes_operador:', sessErr);
      }

      return res.json({
        token,
        perfil: user.perfil,
        primeiro_acesso: user.primeiro_acesso
      });
    } catch (err: any) {
      console.error('[AUTH] Erro no endpoint /api/login:', err);
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  });

  app.post('/api/logout', (req, res) => {
    return res.status(200).json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.json({ login: 'local_admin', perfil: 'admin', primeiro_acesso: 0 });
    }
    try {
      const db = getDb();
      const dbUser = db.prepare('SELECT login, perfil, primeiro_acesso FROM usuarios WHERE id = ?').get(user.id) as any;
      if (dbUser) {
        return res.json({
          login: dbUser.login,
          perfil: dbUser.perfil,
          primeiro_acesso: dbUser.primeiro_acesso
        });
      }
    } catch (e) {}
    return res.json({
      login: user.login,
      perfil: user.perfil,
      primeiro_acesso: 0
    });
  });

  app.put('/api/auth/senha', (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(400).json({ error: 'Alteração de senha indisponível para conexões locais sem autenticação.' });
      }

      const { senha_atual, nova_senha } = req.body;
      if (!senha_atual || !nova_senha) {
        return res.status(400).json({ error: 'Campos senha_atual e nova_senha são obrigatórios.' });
      }

      if (nova_senha.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      }

      const db = getDb();
      const dbUser = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id) as any;
      if (!dbUser) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const match = verifyUserPassword(senha_atual, dbUser.senha_hash);
      if (!match) {
        return res.status(400).json({ error: 'Senha atual incorreta.' });
      }

      const hash = bcrypt.hashSync(nova_senha, 10);
      db.prepare('UPDATE usuarios SET senha_hash = ?, primeiro_acesso = 0 WHERE id = ?').run(hash, user.id);

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[AUTH] Erro ao alterar senha:', err);
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  });

  app.get('/api/usuarios', (req, res) => {
    const user = (req as any).user;
    if (user && user.perfil !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem acessar a segurança.' });
    }
    try {
      const db = getDb();
      const usuarios = db.prepare('SELECT id, login, perfil, primeiro_acesso, criado_em FROM usuarios').all();
      res.json(usuarios);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/usuarios', (req, res) => {
    const user = (req as any).user;
    if (user && user.perfil !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem gerenciar usuários.' });
    }
    try {
      const { login, senha, perfil } = req.body;
      if (!login || !senha) {
        return res.status(400).json({ error: 'Login e senha são obrigatórios.' });
      }
      const db = getDb();
      const hash = bcrypt.hashSync(senha, 10);
      db.prepare('INSERT INTO usuarios (login, senha_hash, perfil, primeiro_acesso) VALUES (?, ?, ?, 1)')
        .run(login.trim(), hash, perfil || 'operador');
      res.json({ success: true });
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Este login já está cadastrado.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/usuarios/redefinir', (req, res) => {
    const user = (req as any).user;
    if (user && user.perfil !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem redefinir senhas.' });
    }
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
      }
      const db = getDb();
      const tempPassword = Math.random().toString(36).substring(2, 10);
      const hash = bcrypt.hashSync(tempPassword, 10);
      db.prepare('UPDATE usuarios SET senha_hash = ?, primeiro_acesso = 1 WHERE id = ?').run(hash, id);
      res.json({ success: true, senha_temporaria: tempPassword });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/usuarios/:id', (req, res) => {
    const user = (req as any).user;
    if (user && user.perfil !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem remover usuários.' });
    }
    try {
      const { id } = req.params;
      if (user && String(user.id) === String(id)) {
        return res.status(400).json({ error: 'Você não pode remover o próprio usuário logado.' });
      }
      const db = getDb();
      db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/operadores', (req, res) => {
    try {
      const db = getDb();
      const operadores = db.prepare('SELECT id, nome, login, perfil, ativo, primeiro_acesso FROM operadores').all();
      res.json(operadores);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/operadores', requireMaster, (req, res) => {
    try {
      const { nome, login, senha, perfil } = req.body;
      const db = getDb();
      const hashed = hashOperatorPassword(senha);
      const stmt = db.prepare('INSERT INTO operadores (nome, login, senha_hash, perfil, ativo, primeiro_acesso) VALUES (?, ?, ?, ?, 1, 0)');
      const result = stmt.run(nome, login, hashed, perfil || 'operador');
      res.status(201).json({ id: result.lastInsertRowid, nome, login, perfil });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/operadores/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const { nome, login, senha, perfil, ativo } = req.body;
      const db = getDb();
      
      let query = 'UPDATE operadores SET nome = ?, login = ?, perfil = ?, ativo = ?';
      const params = [nome, login, perfil || 'operador', ativo !== undefined ? ativo : 1];
      
      if (senha) {
        const hashed = hashOperatorPassword(senha);
        query += ', senha_hash = ?, primeiro_acesso = 0';
        params.push(hashed);
      }
      
      query += ' WHERE id = ?';
      params.push(id);
      
      db.prepare(query).run(...params);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/operadores/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const db = getDb();
      if (id === '1') return res.status(400).json({ error: 'Admin padrão não pode ser removido' });
      db.prepare('DELETE FROM operadores WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // BALCOES ROUTES
  app.get('/api/balcoes', (req, res) => {
    try {
      const db = getDb();
      const balcoes = db.prepare('SELECT * FROM balcoes WHERE ativo = 1').all();
      res.json(balcoes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/balcoes', requireMaster, (req, res) => {
    try {
      const { nome, prefixo_senha } = req.body;
      const db = getDb();
      const stmt = db.prepare('INSERT INTO balcoes (nome, prefixo_senha, ativo) VALUES (?, ?, 1)');
      const result = stmt.run(nome, prefixo_senha || '');
      res.status(201).json({ id: result.lastInsertRowid, nome });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/balcoes/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const db = getDb();
      if (id === '1') return res.status(400).json({ error: 'Balcão padrão não pode ser removido' });
      db.prepare('UPDATE balcoes SET ativo = 0 WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- ANDROID OPERATOR TOUCH ENDPOINTS & BROADCASTS ---
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  const parseOperatorGuiche = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/^(guich[eê]|balc[aã]o)\s*:?\s*/i, '');
    return normalized.length > 0 && normalized.length <= 40 ? normalized : null;
  };

  app.get('/api/operador/estado', (req: express.Request, res: express.Response) => {
    try {
      const guiche = parseOperatorGuiche(req.query.guiche);
      if (!guiche) return res.status(400).json({ error: 'Guichê inválido.' });
      const db = getDb();
      const active = db.prepare(`
        SELECT s.id, s.numero, s.preferencial, c.guiche
        FROM chamadas c
        JOIN senhas s ON s.id = c.senha_id
        WHERE c.guiche = ? AND s.status = 'chamada'
        ORDER BY c.id DESC LIMIT 1
      `).get(`Guichê ${guiche}`) as any;
      const waiting = db.prepare("SELECT COUNT(*) AS count FROM senhas WHERE status = 'aguardando'").get() as any;
      res.json({
        data: {
          ticket: active || null,
          aguardando: Number(waiting?.count || 0),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/operador/proximo', (req: express.Request, res: express.Response) => {
    try {
      const guiche = parseOperatorGuiche(req.body?.guiche);
      if (!guiche) return res.status(400).json({ error: 'Guichê inválido.' });
      const db = getDb();
      
      console.log(`[Operador Touch - Proximo] guiche=${guiche}`);

      const proximoTouchTx = db.transaction((guicheStr: string) => {
        // Reserve the next ticket before finalizing the active one. This keeps
        // the current service intact when the waiting queue is empty.
        const proxima = db.prepare(
          `SELECT s.*, b.nome as balcao_nome, b.prefixo_senha
           FROM senhas s
           JOIN balcoes b ON s.balcao_id = b.id
           WHERE s.status = 'aguardando'
           ORDER BY s.preferencial DESC, s.id ASC
           LIMIT 1`
        ).get() as any;

        if (!proxima) return { proxima: null, geral: 0, preferencial: 0, autoAttendedId: null };

        const activeCalled = db.prepare(`
          SELECT s.id 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC LIMIT 1
        `).get(`Guichê ${guicheStr}`) as any;

        if (activeCalled) {
          db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(activeCalled.id);
        }

        // Mark as called and register the call atomically.
        db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?").run(proxima.id);

        // 3. Registra a chamada (operador_id = 1 como padrão)
        db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, 1, ?)').run(proxima.id, `Guichê ${guicheStr}`);

        // 4. Counts for queue-update
        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          proxima,
          geral: countGeral.count,
          preferencial: countPref.count,
          autoAttendedId: activeCalled?.id
        };
      });

      const txResult = proximoTouchTx(guiche);

      if (txResult.autoAttendedId) {
        syncStatusSenha(txResult.autoAttendedId, 'atendida');
        broadcastEvent('SENHA_ATENDIDA', { id: txResult.autoAttendedId });
      }

      if (!txResult.proxima) {
        return res.status(404).json({ error: 'Nenhuma senha aguardando na fila.' });
      }

      const { proxima, geral, preferencial } = txResult;
      const formattedNumero = `${proxima.preferencial ? 'P' : 'A'}-${String(proxima.numero).padStart(3, '0')}`;

      const ticketPayload = {
        id: proxima.id,
        numero: formattedNumero,
        preferencial: proxima.preferencial,
        guiche: `Guichê ${guiche}`
      };

      // Broadcast para os telões antigos e novos
      const standardPayload = {
        ...proxima,
        status: 'chamada',
        guiche: `Guichê ${guiche}`,
        aguardando_count: geral + preferencial,
        repeticao: false
      };
      
      broadcastEvent('NOVA_SENHA_CHAMADA', standardPayload);
      broadcastEvent('ticket-called', ticketPayload);
      broadcastEvent('queue-update', {
        geral: geral,
        preferencial: preferencial
      });

      // Sincroniza com Supabase
      syncStatusSenha(proxima.id, 'chamada', `Guichê ${guiche}`);

      res.json({ success: true, data: { ticket: ticketPayload, aguardando: geral + preferencial } });
    } catch (err: any) {
      console.error('[Operador Touch - Proximo] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/operador/repetir', (req: express.Request, res: express.Response) => {
    try {
      const guiche = parseOperatorGuiche(req.body?.guiche);
      if (!guiche) return res.status(400).json({ error: 'Guichê inválido.' });
      const db = getDb();
      
      console.log(`[Operador Touch - Repetir] guiche=${guiche}`);

      // Busca a última chamada deste guichê
      const ultimaChamada = db.prepare(`
        SELECT s.*, c.guiche 
        FROM chamadas c
        JOIN senhas s ON c.senha_id = s.id
        WHERE c.guiche = ? AND s.status = 'chamada'
        ORDER BY c.id DESC
        LIMIT 1
      `).get(`Guichê ${guiche}`) as any;

      if (!ultimaChamada) {
        return res.status(409).json({ error: 'Nenhuma senha em atendimento para repetir.' });
      }

      // Atualiza o timestamp da senha e registra uma nova chamada
      db.prepare("UPDATE senhas SET chamada_em = datetime('now') WHERE id = ?").run(ultimaChamada.id);
      db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, 1, ?)').run(ultimaChamada.id, `Guichê ${guiche}`);

      const formattedNumero = `${ultimaChamada.preferencial ? 'P' : 'A'}-${String(ultimaChamada.numero).padStart(3, '0')}`;

      const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
      const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

      const ticketPayload = {
        id: ultimaChamada.id,
        numero: formattedNumero,
        preferencial: ultimaChamada.preferencial,
        guiche: `Guichê ${guiche}`
      };

      const standardPayload = {
        ...ultimaChamada,
        status: 'chamada',
        guiche: `Guichê ${guiche}`,
        aguardando_count: countGeral.count + countPref.count,
        repeticao: true
      };

      broadcastEvent('NOVA_SENHA_CHAMADA', standardPayload);
      broadcastEvent('ticket-called', ticketPayload);

      // Sincroniza com Supabase
      syncStatusSenha(ultimaChamada.id, 'chamada', `Guichê ${guiche}`);

      res.json({ success: true, data: { ticket: ticketPayload, aguardando: countGeral.count + countPref.count } });
    } catch (err: any) {
      console.error('[Operador Touch - Repetir] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/operador/devolver', (req: express.Request, res: express.Response) => {
    try {
      const guiche = parseOperatorGuiche(req.body?.guiche);
      if (!guiche) return res.status(400).json({ error: 'Guichê inválido.' });
      const db = getDb();
      
      console.log(`[Operador Touch - Devolver] guiche=${guiche}`);

      const devolverTouchTx = db.transaction((guicheStr: string) => {
        // Busca a senha atualmente em atendimento (status 'chamada') neste guichê
        const ultimaChamada = db.prepare(`
          SELECT s.* 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC
          LIMIT 1
        `).get(`Guichê ${guicheStr}`) as any;

        if (!ultimaChamada) return null;

        // Atualiza a senha para 'aguardando' e remove a chamada_em
        db.prepare("UPDATE senhas SET status = 'aguardando', chamada_em = NULL WHERE id = ?").run(ultimaChamada.id);

        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          ultimaChamada,
          geral: countGeral.count,
          preferencial: countPref.count
        };
      });

      const txResult = devolverTouchTx(guiche);

      if (!txResult) {
        return res.status(409).json({ error: 'Nenhuma senha em atendimento para devolver.' });
      }

      const { ultimaChamada, geral, preferencial } = txResult;

      // Notifica o telão sobre o estorno e limpa o ticket-called no guichê
      broadcastEvent('SENHA_ESTORNADA', { id: ultimaChamada.id, aguardando_count: geral + preferencial });
      broadcastEvent('ticket-called', { numero: null, preferencial: null, guiche: `Guichê ${guiche}` });
      broadcastEvent('queue-update', {
        geral: geral,
        preferencial: preferencial
      });

      // Sincroniza com Supabase
      syncStatusSenha(ultimaChamada.id, 'aguardando');

      res.json({ success: true, data: { ticket: null, aguardando: geral + preferencial } });
    } catch (err: any) {
      console.error('[Operador Touch - Devolver] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chamar-proxima', requireAuth, (req: express.Request, res: express.Response) => {
    try {
      const { operador_id, guiche } = req.body;
      const db = getDb();
      
      console.log(`[ChamarProxima] operador=${operador_id} guiche=${guiche}`);

      const chamarProximaTx = db.transaction((operadorIdVal: any, guicheStr: string) => {
        // 0. Auto-finalize previous called ticket of this guichê
        const activeCalled = db.prepare(`
          SELECT s.id 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC LIMIT 1
        `).get(guicheStr) as any;

        if (activeCalled) {
          db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(activeCalled.id);
        }

        // 1. Busca a próxima senha DIRETO DO BANCO (preferencial primeiro, depois por ordem de chegada)
        const proxima = db.prepare(
          `SELECT s.*, b.nome as balcao_nome 
           FROM senhas s 
           JOIN balcoes b ON s.balcao_id = b.id 
           WHERE s.status = 'aguardando' 
           ORDER BY s.preferencial DESC, s.id ASC 
           LIMIT 1`
        ).get() as any;

        if (!proxima) return {
          proxima: null,
          geral: 0,
          preferencial: 0,
          autoAttendedId: activeCalled?.id
        };

        // 2. Marca como chamada
        db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?").run(proxima.id);

        // 3. Registra a chamada
        db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, ?, ?)').run(proxima.id, operadorIdVal, guicheStr);

        // 4. Conta aguardando
        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          proxima,
          geral: countGeral.count,
          preferencial: countPref.count,
          autoAttendedId: activeCalled?.id
        };
      });

      const txResult = chamarProximaTx(operador_id, guiche);

      if (!txResult) {
        return res.status(404).json({ error: 'Nenhuma senha aguardando na fila.' });
      }

      const { proxima, geral, preferencial, autoAttendedId } = txResult;

      if (autoAttendedId) {
        syncStatusSenha(autoAttendedId, 'atendida');
        broadcastEvent('SENHA_ATENDIDA', { id: autoAttendedId });
      }

      if (!proxima) {
        return res.status(404).json({ error: 'Nenhuma senha aguardando na fila.' });
      }

      console.log(`[ChamarProxima] Próxima senha encontrada e reservada: id=${proxima.id} numero=${proxima.numero}`);

      const payload = {
        ...proxima,
        status: 'chamada',
        guiche,
        aguardando_count: geral + preferencial,
        repeticao: false
      };

      broadcastEvent('NOVA_SENHA_CHAMADA', payload);
      
      // Também transmite para os painéis Operator Touch se o guichê for numérico ou correspondente
      try {
        const guicheNumero = guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim();
        const formattedNumero = `${proxima.preferencial ? 'P' : 'A'}-${String(proxima.numero).padStart(3, '0')}`;
        broadcastEvent('ticket-called', {
          id: proxima.id,
          numero: formattedNumero,
          preferencial: proxima.preferencial,
          guiche: guicheNumero
        });
        broadcastEvent('queue-update', {
          geral: geral,
          preferencial: preferencial
        });
      } catch (errBroad) {
        console.error('Erro ao enviar ticket-called/queue-update secundário:', errBroad);
      }

      // Sync: atualiza status na nuvem (Portal do Cliente verá que a vez chegou)
      syncStatusSenha(proxima.id, 'chamada', guiche);

      console.log(`[ChamarProxima] Senha ${proxima.numero} chamada com sucesso para ${guiche}`);
      res.json({ success: true, data: payload });
    } catch (err: any) {
      console.error('[ChamarProxima] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Rota existente mantida para REPETIR chamada (quando já se sabe o ID da senha)
  app.post('/api/chamadas', requireAuth, (req: express.Request, res: express.Response) => {
    try {
      const { senha_id, operador_id, guiche } = req.body;
      const db = getDb();
      
      console.log(`[Chamada] senha_id=${senha_id} operador=${operador_id} guiche=${guiche}`);

      const repetirChamadaTx = db.transaction((senhaIdVal: any, operadorIdVal: any, guicheStr: string) => {
        // 1. Update ticket status
        db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?").run(senhaIdVal);

        // 2. Record the call
        db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, ?, ?)').run(senhaIdVal, operadorIdVal, guicheStr);

        // 3. Fetch details
        const proxima = db.prepare(`
          SELECT s.*, b.nome as balcao_nome 
          FROM senhas s
          JOIN balcoes b ON s.balcao_id = b.id
          WHERE s.id = ?
        `).get(senhaIdVal) as any;

        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          proxima,
          geral: countGeral.count,
          preferencial: countPref.count
        };
      });

      const txResult = repetirChamadaTx(senha_id, operador_id, guiche);
      const { proxima, geral, preferencial } = txResult;

      const payload = {
        ...proxima,
        guiche,
        aguardando_count: geral + preferencial,
        repeticao: true
      };

      broadcastEvent('NOVA_SENHA_CHAMADA', payload);

      // Também transmite para os painéis Operator Touch correspondentes
      try {
        const guicheNumero = guiche.replace(/guichê[:\s]*/gi, '').replace(/balcão[:\s]*/gi, '').trim();
        const formattedNumero = `${proxima.preferencial ? 'P' : 'A'}-${String(proxima.numero).padStart(3, '0')}`;
        broadcastEvent('ticket-called', {
          id: proxima.id,
          numero: formattedNumero,
          preferencial: proxima.preferencial,
          guiche: guicheNumero
        });
        broadcastEvent('queue-update', {
          geral: geral,
          preferencial: preferencial
        });
      } catch (errBroad) {
        console.error('Erro ao enviar ticket-called secundário:', errBroad);
      }

      // Sync: atualiza status na nuvem
      syncStatusSenha(senha_id, 'chamada', guiche);

      console.log('[Chamada] Broadcast enviado com sucesso');
      res.json({ success: true, data: payload });
    } catch (err: any) {
      console.error('[Chamada] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/senhas/estornar', requireAuth, (req, res) => {
    try {
      const { senha_id } = req.body;
      const db = getDb();
      
      const estornarTx = db.transaction((senhaIdVal: any) => {
        db.prepare("UPDATE senhas SET status = 'aguardando', chamada_em = NULL WHERE id = ?").run(senhaIdVal);
        
        const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get() as any;
        const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get() as any;

        return {
          geral: countGeral.count,
          preferencial: countPref.count
        };
      });

      const txResult = estornarTx(senha_id);
      const { geral, preferencial } = txResult;
      
      // Notifica todos os painéis
      broadcastEvent('SENHA_ESTORNADA', { id: senha_id, aguardando_count: geral + preferencial });
      
      // Também transmite para os painéis Operator Touch correspondentes
      try {
        broadcastEvent('queue-update', {
          geral: geral,
          preferencial: preferencial
        });
      } catch (errBroad) {
        console.error('Erro ao enviar queue-update secundário:', errBroad);
      }

      // Sync: volta status na nuvem
      syncStatusSenha(senha_id, 'aguardando');

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/senhas/concluir', (req, res) => {
    try {
      const { senha_id, guiche } = req.body;
      const db = getDb();
      
      db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(senha_id);
      
      // Notifica todos os painéis
      broadcastEvent('SENHA_ATENDIDA', { id: senha_id });
      
      // Sincroniza estado para operadores touch
      if (guiche) {
        broadcastEvent('ticket-called', { id: null, numero: null, preferencial: null, guiche });
      }
      
      syncStatusSenha(senha_id, 'atendida');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/senhas/cancelar', (req, res) => {
    try {
      const { senha_id, guiche } = req.body;
      const db = getDb();
      
      db.prepare("UPDATE senhas SET status = 'cancelada', atendida_em = datetime('now') WHERE id = ?").run(senha_id);
      
      // Notifica todos os painéis
      broadcastEvent('SENHA_CANCELADA', { id: senha_id });
      
      // Sincroniza estado para operadores touch
      if (guiche) {
        broadcastEvent('ticket-called', { id: null, numero: null, preferencial: null, guiche });
      }
      
      syncStatusSenha(senha_id, 'cancelada');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/midias', (req, res) => {
    try {
      const db = getDb();
      // HARD FIX DE SEGURANÇA: sempre filtrar WHERE deleted_at IS NULL e file_status != 'missing'
      const midias = db.prepare("SELECT * FROM midias WHERE deleted_at IS NULL AND file_status != 'missing' ORDER BY ordem ASC, id DESC").all();
      res.json(midias);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/midias', requireMaster, upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        console.error('Upload failed: No file provided');
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const db = getDb();
      const { nome, tipo, ordem } = req.body;
      const caminho = `/uploads/${req.file.filename}`;
      const storedFilePath = resolveUploadPath(caminho, UPLOADS_DIR);

      if (!storedFilePath || !fs.existsSync(storedFilePath)) {
        throw new Error('O arquivo enviado não foi confirmado na pasta persistente de mídias.');
      }

      console.log('Inserting media into DB:', { nome, caminho });

      const stmt = db.prepare("INSERT INTO midias (nome, caminho, tipo, ordem, ativo, file_status) VALUES (?, ?, ?, ?, 1, 'active')");
      const result = stmt.run(nome || req.file.originalname, caminho, tipo || (req.file.mimetype.startsWith('video') ? 'video' : 'imagem'), ordem || 0);

      reconcileMidias();
      const persistedMedia = db.prepare('SELECT file_status FROM midias WHERE id = ?').get(result.lastInsertRowid) as { file_status?: string } | undefined;
      if (persistedMedia?.file_status !== 'active') {
        throw new Error('A mídia foi cadastrada, mas o arquivo persistente não está disponível.');
      }
      broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'upload' });

      res.status(201).json({ 
        id: result.lastInsertRowid,
        nome: nome || req.file.originalname,
        caminho,
        tipo: tipo || (req.file.mimetype.startsWith('video') ? 'video' : 'imagem'),
        ordem: ordem || 0,
        ativo: 1
      });
    } catch (err: any) {
      console.error('Error in POST /api/midias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/midias/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const db = getDb();

      // Soft delete imediatamente para garantir que saia do telão mesmo se a deleção do arquivo falhar
      try {
        db.prepare("UPDATE midias SET deleted_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      } catch (e) {
        // Ignora erro caso a coluna não exista (o db.exec de alter table cuidará disso)
      }

      // Tenta remover o arquivo físico
      const midia = db.prepare('SELECT caminho FROM midias WHERE id = ?').get(id) as any;
      
      if (midia) {
        const filePath = resolveUploadPath(midia.caminho, UPLOADS_DIR);
        console.log('Deleting managed file:', filePath || '[caminho inválido]');
        try {
          const sharedReference = db.prepare(`
            SELECT 1 AS found WHERE
              EXISTS (SELECT 1 FROM midias WHERE caminho = ? AND deleted_at IS NULL)
              OR EXISTS (SELECT 1 FROM media_items WHERE local_path = ?)
              OR EXISTS (SELECT 1 FROM configuracoes WHERE valor = ?)
              OR EXISTS (SELECT 1 FROM vignette_files WHERE local_path = ?)
          `).get(midia.caminho, midia.caminho, midia.caminho, midia.caminho);
          // A validação de media-files impede traversal e unlinkManagedAsset
          // centraliza a exclusão no diretório persistente configurado.
          if (filePath && !sharedReference) unlinkManagedAsset(midia.caminho);
        } catch (fileErr) {
          console.error('Erro ao deletar arquivo físico (pode estar em uso):', fileErr);
          try {
            db.prepare("UPDATE midias SET file_status = 'failed' WHERE id = ?").run(id);
          } catch(e) {}
        }
      }

      reconcileMidias();
      broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'delete' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error in DELETE /api/midias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/midias/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const { ativo, data_expiracao, status } = req.body;
      const db = getDb();
      
      db.prepare(`
        UPDATE midias 
        SET ativo = COALESCE(?, ativo), 
            data_expiracao = COALESCE(?, data_expiracao),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(ativo, data_expiracao, status, id);
      
      broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'update' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error in PUT /api/midias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/configuracoes', (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT chave, valor FROM configuracoes').all() as any[];
      const config = rows.reduce((acc, row) => {
        acc[row.chave] = row.valor;
        return acc;
      }, {} as Record<string, string>);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/configuracoes', requireMaster, async (req: express.Request, res: express.Response) => {
    try {
      const configuracoes = req.body;
      const db = getDb();

      if (!configuracoes || typeof configuracoes !== 'object' || Array.isArray(configuracoes)) {
        return res.status(400).json({ error: 'Configurações devem ser enviadas como objeto.' });
      }

      if (Object.prototype.hasOwnProperty.call(configuracoes, 'portal_cliente_url')) {
        try {
          configuracoes.portal_cliente_url = normalizePortalBaseUrl(configuracoes.portal_cliente_url);
        } catch (err: any) {
          return res.status(400).json({ error: err.message });
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(configuracoes, 'telao_tts_modo')
        && !isTelaoTtsMode(configuracoes.telao_tts_modo)
      ) {
        return res.status(400).json({
          error: `Modo de TTS inválido. Valores aceitos: ${TELAO_TTS_MODES.join(', ')}.`,
        });
      }

      if (Object.prototype.hasOwnProperty.call(configuracoes, 'telao_cache_limite_mb')) {
        const cacheMb = Number(configuracoes.telao_cache_limite_mb);
        if (!Number.isFinite(cacheMb) || cacheMb < 32 || cacheMb > 2048) {
          return res.status(400).json({ error: 'telao_cache_limite_mb deve estar entre 32 e 2048.' });
        }
        configuracoes.telao_cache_limite_mb = String(Math.round(cacheMb));
      }

      // Validação de tamanhos de fonte CSS
      const cssSize = /^(\d+(\.\d+)?)(rem|em|px|vw|vh|%)$/;
      const fontKeys = ['toledo_fonte_descricao', 'toledo_fonte_preco'];
      for (const key of fontKeys) {
        if (configuracoes[key] && !cssSize.test(configuracoes[key])) {
          return res.status(400).json({ error: `Tamanho de fonte inválido para ${key}: ${configuracoes[key]}` });
        }
      }

      // Validação de cor hexadecimal
      if (configuracoes.cor_primaria && !/^#[0-9A-Fa-f]{6}$/.test(configuracoes.cor_primaria)) {
        return res.status(400).json({ error: 'Formato de cor hexadecimal inválido para cor_primaria' });
      }

      console.log('Saving configs:', configuracoes);

      const stmt = db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))");
      
      const transaction = db.transaction((configs: Record<string, string>) => {
        for (const [chave, valor] of Object.entries(configs)) {
          stmt.run(chave, String(valor));
        }
      });
      
      transaction(configuracoes);
      
      // If establishment name or prefixes changed, we might want to update the default balcão
      if (configuracoes.nome_estabelecimento || configuracoes.prefixo_normal) {
        db.prepare('UPDATE balcoes SET nome = ?, prefixo_senha = ? WHERE id = 1')
          .run(configuracoes.nome_estabelecimento || 'Balcão Geral', configuracoes.prefixo_normal || 'N');
      }

      // Notify display to update
      broadcastEvent('CONFIG_ATUALIZADA', configuracoes);

      // Sync public configs to Supabase
      if (configuracoes.nome_estabelecimento) syncConfiguracaoPublica('nome_estabelecimento', configuracoes.nome_estabelecimento);
      if (configuracoes.portal_voz_alerta) syncConfiguracaoPublica('portal_voz_alerta', configuracoes.portal_voz_alerta);
      if (configuracoes.portal_som_sua_vez !== undefined) syncConfiguracaoPublica('portal_som_sua_vez', configuracoes.portal_som_sua_vez);
      if (configuracoes.portal_som_prestes_chamar !== undefined) syncConfiguracaoPublica('portal_som_prestes_chamar', configuracoes.portal_som_prestes_chamar);
      if (configuracoes.toledo_encarte_ativo !== undefined) syncConfiguracaoPublica('toledo_encarte_ativo', String(configuracoes.toledo_encarte_ativo));
      if (configuracoes.toledo_ocultar_em_falta !== undefined) syncConfiguracaoPublica('toledo_ocultar_em_falta', String(configuracoes.toledo_ocultar_em_falta));
      if (configuracoes.telao_ticker_texto !== undefined) syncConfiguracaoPublica('telao_ticker_texto', String(configuracoes.telao_ticker_texto));
      
      if (configuracoes.cor_primaria !== undefined && isSupabaseConfigured()) {
        const novaCor = configuracoes.cor_primaria;
        try {
          const client = createSupabaseAnonClient();
          if (client) {
            const { error } = await client
              .from('configuracoes_publicas')
              .upsert({ chave: 'cor_primaria', valor: novaCor, updated_at: new Date().toISOString() });
            
            if (error) {
              console.error('[API] Erro ao sincronizar nova cor_primaria com o Supabase:', error);
              db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '1', datetime('now'))`).run();
            } else {
              db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '0', datetime('now'))`).run();
            }
          }
        } catch (err) {
          db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '1', datetime('now'))`).run();
          console.warn('[Sync] Supabase offline — cor_primaria marcada como pendente de sincronização.');
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('Error saving configs:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // LOGO UPLOAD
  app.post('/api/configuracoes/logo', requireMaster, upload.single('logo'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum logo enviado' });
      
      const db = getDb();
      const logoPath = `/uploads/${req.file.filename}`;
      
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
        .run('logo_cliente', logoPath);
        
      broadcastEvent('CONFIG_ATUALIZADA', { logo_cliente: logoPath });

      // Converter imagem pra base64 e enviar pro portal do cliente no Supabase
      try {
        const filePath = req.file.path;
        const base64 = fs.readFileSync(filePath, 'base64');
        const mimeType = req.file.mimetype;
        const dataUrl = `data:${mimeType};base64,${base64}`;
        syncConfiguracaoPublica('logo_cliente_base64', dataUrl);
      } catch (e) {
        console.error('Erro ao syncar logo em base64', e);
      }

      res.json({ success: true, logoPath });
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ARTE TELAO UPLOAD
  app.post('/api/configuracoes/telao-arte', requireMaster, upload.single('arte'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhuma arte enviada' });
      
      const db = getDb();
      const artePath = `/uploads/${req.file.filename}`;
      
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
        .run('telao_arte_espera', artePath);
        
      broadcastEvent('CONFIG_ATUALIZADA', { telao_arte_espera: artePath });

      res.json({ success: true, artePath });
    } catch (err: any) {
      console.error('Error uploading telão arte:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // SOM UPLOAD
  app.post('/api/configuracoes/som', requireMaster, upload.single('som'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo de som enviado' });
      
      const db = getDb();
      const somPath = `/uploads/${req.file.filename}`;
      
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
        .run('som_personalizado', somPath);
        
      broadcastEvent('CONFIG_ATUALIZADA', { som_personalizado: somPath });
      res.json({ success: true, somPath });
    } catch (err: any) {
      console.error('Error uploading sound:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // TTS STATUS AND MANAGEMENT ROUTES
  app.get('/api/tts/status', (req, res) => {
    try {
      const dataDir = CHAMAAI_DATA_DIR;
      const ttsBaseDir = path.join(dataDir, 'uploads', 'tts');
      const response: Record<string, { count: number; range: string }> = {};

      const tipos = ['tipo1', 'tipo2', 'tipo3'];
      for (const tipo of tipos) {
        const tipoDir = path.join(ttsBaseDir, tipo);
        if (fs.existsSync(tipoDir)) {
          const files = fs.readdirSync(tipoDir).filter(f => f.toLowerCase().endsWith('.mp3'));
          const numbers: number[] = [];
          for (const file of files) {
            const match = file.match(/Senha_(\d+)/i);
            if (match) {
              numbers.push(parseInt(match[1], 10));
            }
          }
          if (numbers.length > 0) {
            numbers.sort((a, b) => a - b);
            response[tipo] = {
              count: files.length,
              range: `${numbers[0]}-${numbers[numbers.length - 1]}`
            };
          } else {
            response[tipo] = { count: files.length, range: '' };
          }
        } else {
          response[tipo] = { count: 0, range: '' };
        }
      }

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tts/upload', requireMaster, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      const db = getDb();

      const { execSync } = require('child_process');
      const zipFilePath = req.file.path;
      const dataDir = CHAMAAI_DATA_DIR;
      const uploadsDir = path.join(dataDir, 'uploads');
      const ttsBaseDir = path.join(uploadsDir, 'tts');
      const tempDir = path.join(dataDir, 'Backups', `_extract_tts_${Date.now()}`);

      fs.mkdirSync(tempDir, { recursive: true });

      // Extrai o ZIP via PowerShell nativo (Expand-Archive)
      try {
        execSync(
          `powershell -NoProfile -Command "Expand-Archive -Path '${zipFilePath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force"`,
          { timeout: 60000 }
        );
      } catch (err: any) {
        console.error('[TTS UPLOAD] Erro ao extrair ZIP:', err);
        return res.status(500).json({ error: 'Erro ao extrair arquivo ZIP.' });
      }

      function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
        if (!fs.existsSync(dirPath)) return arrayOfFiles;
        const files = fs.readdirSync(dirPath);
        files.forEach((file) => {
          const fullPath = path.join(dirPath, file);
          if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
          } else {
            arrayOfFiles.push(fullPath);
          }
        });
        return arrayOfFiles;
      }

      // Encontrar todos os arquivos extraídos
      const allFiles = getAllFiles(tempDir);
      let successCount = 0;

      for (const filePath of allFiles) {
        const baseName = path.basename(filePath);
        if (!baseName.toLowerCase().endsWith('.mp3')) continue;

        // Determinar o tipo do áudio pelo padrão do nome
        let tipo = '';
        if (/^Senha_\d+_1\.mp3$/i.test(baseName)) {
          tipo = 'tipo1';
        } else if (/^Senha_\d+_2_chamada\.mp3$/i.test(baseName) || /^Senha_\d+_2\.mp3$/i.test(baseName)) {
          tipo = 'tipo2';
        } else if (/^Senha_\d+_3\.mp3$/i.test(baseName)) {
          tipo = 'tipo3';
        }

        if (tipo) {
          const destDir = path.join(ttsBaseDir, tipo);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(filePath, path.join(destDir, baseName));
          successCount++;
        }
      }

      // Limpar pasta temporária e o ZIP
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
      } catch (e) {
        console.error('[TTS UPLOAD] Erro ao limpar arquivos temporários:', e);
      }

      const ttsRevision = crypto.randomUUID();
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('telao_tts_revision', ?, datetime('now'))")
        .run(ttsRevision);

      broadcastEvent('CONFIG_ATUALIZADA', { tts_updated: Date.now().toString(), telao_tts_revision: ttsRevision });
      res.json({ success: true, count: successCount });
    } catch (err: any) {
      console.error('[TTS UPLOAD] Erro geral:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tts/clear/:tipo', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const tipo = req.params.tipo;
      if (typeof tipo !== 'string' || !['tipo1', 'tipo2', 'tipo3'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido.' });
      }

      const dataDir = CHAMAAI_DATA_DIR;
      const tipoDir = path.join(dataDir, 'uploads', 'tts', tipo);
      
      if (fs.existsSync(tipoDir)) {
        const files = fs.readdirSync(tipoDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.mp3')) {
            fs.unlinkSync(path.join(tipoDir, file));
          }
        }
      }

      const ttsRevision = crypto.randomUUID();
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('telao_tts_revision', ?, datetime('now'))")
        .run(ttsRevision);

      broadcastEvent('CONFIG_ATUALIZADA', { tts_cleared: Date.now().toString(), telao_tts_revision: ttsRevision });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // BACKUP — Gera ZIP com escopo selecionável
  app.get('/api/admin/backup', async (req, res) => {
    try {
      const incluirConfig = req.query.config !== '0';
      const incluirOperadores = req.query.operadores !== '0';
      const incluirBalcoes = req.query.balcoes !== '0';
      const incluirMidias = req.query.midias === '1';

      const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
      const tempBackupDir = path.join(dataDir, 'Backups', '_manual');
      if (!fs.existsSync(tempBackupDir)) {
        fs.mkdirSync(tempBackupDir, { recursive: true });
      }

      const zipFile = await gerarBackupZip({
        incluirConfig,
        incluirOperadores,
        incluirBalcoes,
        incluirMidias,
        destino: tempBackupDir,
      });

      if (zipFile && fs.existsSync(zipFile)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(zipFile)}"`);
        const stream = fs.createReadStream(zipFile);
        stream.pipe(res);
        stream.on('end', () => {
          // Limpa o arquivo temporário após download
          try { fs.unlinkSync(zipFile); } catch (e) {}
        });
      } else {
        res.status(500).json({ error: 'Erro ao gerar backup' });
      }
    } catch (err: any) {
      console.error('Backup error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- GERENCIADOR DE BACKUPS ---
  
  // LISTAR BACKUPS
  app.get('/api/admin/backups', (req, res) => {
    try {
      const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
      const backupDir = path.join(dataDir, 'Backups');
      const limit = parseInt((req.query.limit as string) || '20');
      
      if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
      
      const arquivos = fs.readdirSync(backupDir);
      const backups = arquivos
        .filter(file => file.startsWith('backup_') && file.endsWith('.zip'))
        .map(file => {
          const stats = fs.statSync(path.join(backupDir, file));
          return {
            nome: file,
            tamanhoMB: (stats.size / (1024 * 1024)).toFixed(2),
            criado_em: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
        .slice(0, limit);
        
      res.json({ backups });
    } catch (err: any) {
      console.error('Erro ao listar backups:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // EXCLUIR BACKUP
  app.delete('/api/admin/backups/:filename', requireMaster, (req, res) => {
    try {
      const filename = req.params.filename as string;
      // Validação rígida contra Path Traversal
      if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Nome de arquivo inválido.' });
      }
      
      const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
      const filePath = path.join(dataDir, 'Backups', filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Backup não encontrado.' });
      }
    } catch (err: any) {
      console.error('Erro ao excluir backup:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RESTAURAR BACKUP LOCAL
  app.post('/api/admin/backups/:filename/restore', requireMaster, async (req, res) => {
    try {
      const filename = req.params.filename as string;
      // Validação rígida contra Path Traversal
      if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Nome de arquivo inválido.' });
      }
      
      const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
      const filePath = path.join(dataDir, 'Backups', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup não encontrado.' });
      }
      
      await restoreBackupZip(filePath);
      
      // Reinicia o estado e força os terminais a regarregarem as configs
      broadcastEvent('SISTEMA_RESETADO', { success: true });
      broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Erro ao restaurar backup local:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RESTORE MANUAL (Upload)
  app.post('/api/admin/restore', requireMaster, backupUpload.single('backupFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }
      
      await restoreBackupZip(req.file.path);
      
      // Apaga o zip de upload após uso
      try { fs.unlinkSync(req.file.path); } catch(e) {}
      
      // Reinicia o estado e força os terminais a regarregarem as configs
      broadcastEvent('SISTEMA_RESETADO', { success: true });
      broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[RESTORE MANUAL ERROR]:', err);
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch(e) {}
      }
      res.status(500).json({ error: err.message });
    }
  });

  // --- RELATÓRIOS ---
  app.get('/api/relatorios', (req, res) => {
    try {
      const { inicio, fim } = req.query;
      const db = getDb();

      // Ajusta datas para cobrir o dia inteiro (YYYY-MM-DD 00:00:00 até YYYY-MM-DD 23:59:59)
      const dateStart = `${inicio} 00:00:00`;
      const dateEnd = `${fim} 23:59:59`;

      const total = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE criado_em BETWEEN ? AND ?").get(dateStart, dateEnd) as any;
      const atendidas = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'atendida' AND criado_em BETWEEN ? AND ?").get(dateStart, dateEnd) as any;
      const canceladas = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status IN ('cancelada', 'nao_compareceu') AND criado_em BETWEEN ? AND ?").get(dateStart, dateEnd) as any;

      // Cálculo de tempo médio de espera em minutos
      // julianday retorna a fração de dias. Multiplicamos por 1440 para converter em minutos (24*60)
      const espera = db.prepare(`
        SELECT AVG((julianday(chamada_em) - julianday(criado_em)) * 1440) as media 
        FROM senhas 
        WHERE status IN ('chamada', 'atendida', 'cancelada', 'nao_compareceu') 
        AND chamada_em IS NOT NULL
        AND criado_em BETWEEN ? AND ?
      `).get(dateStart, dateEnd) as any;

      // Cálculo de tempo médio de atendimento (TMA) em minutos
      const atendimento = db.prepare(`
        SELECT AVG((julianday(atendida_em) - julianday(chamada_em)) * 1440) as media 
        FROM senhas 
        WHERE status = 'atendida'
        AND chamada_em IS NOT NULL
        AND atendida_em IS NOT NULL
        AND criado_em BETWEEN ? AND ?
      `).get(dateStart, dateEnd) as any;

      // Senhas por hora (periodo)
      const porHora = db.prepare(`
        SELECT strftime('%H', criado_em) as hora, COUNT(*) as quantidade
        FROM senhas
        WHERE criado_em BETWEEN ? AND ?
        GROUP BY strftime('%H', criado_em)
        ORDER BY hora ASC
      `).all(dateStart, dateEnd);

      // Senhas por balcão
      const porBalcao = db.prepare(`
        SELECT b.nome, COUNT(s.id) as quantidade
        FROM senhas s
        JOIN balcoes b ON s.balcao_id = b.id
        WHERE s.criado_em BETWEEN ? AND ?
        GROUP BY b.id
      `).all(dateStart, dateEnd);

      res.json({
        total: total.count || 0,
        atendidas: atendidas.count || 0,
        canceladas: canceladas.count || 0,
        tempoMedioEspera: espera.media || 0,
        tempoMedioAtendimento: atendimento.media || 0,
        porHora,
        porBalcao
      });
    } catch (err: any) {
      console.error('Relatorio error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  ENCARTE — Configurações Adicionais (Admin)
  // ═══════════════════════════════════════════════════════════════════

  // --- FILTROS DE EXCLUSÃO ---
  app.get('/api/admin/encarte-filtros', requireMaster, (req, res) => {
    try { res.json(getDb().prepare('SELECT * FROM encarte_filtros').all()); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/admin/encarte-filtros', requireMaster, (req, res) => {
    try {
      const { palavra_chave } = req.body;
      const stmt = getDb().prepare('INSERT INTO encarte_filtros (palavra_chave) VALUES (?)');
      res.status(201).json({ id: stmt.run(palavra_chave).lastInsertRowid, palavra_chave, ativo: 1 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/admin/encarte-filtros/:id', requireMaster, (req, res) => {
    try {
      const { palavra_chave, ativo } = req.body;
      getDb().prepare('UPDATE encarte_filtros SET palavra_chave = ?, ativo = ? WHERE id = ?').run(palavra_chave, ativo, req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/admin/encarte-filtros/:id', requireMaster, (req, res) => {
    try { getDb().prepare('DELETE FROM encarte_filtros WHERE id = ?').run(req.params.id); res.json({ success: true }); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- NOMES CUSTOMIZADOS ---
  app.get('/api/admin/encarte-nomes', requireMaster, (req, res) => {
    try { res.json(getDb().prepare('SELECT * FROM encarte_nomes_customizados').all()); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/admin/encarte-nomes', requireMaster, (req, res) => {
    try {
      const { codigo_produto, nome_exibicao } = req.body;
      getDb().prepare('INSERT OR REPLACE INTO encarte_nomes_customizados (codigo_produto, nome_exibicao) VALUES (?, ?)').run(codigo_produto, nome_exibicao);
      res.status(201).json({ codigo_produto, nome_exibicao, ativo: 1 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/admin/encarte-nomes/:id', requireMaster, (req, res) => {
    try {
      const { nome_exibicao, ativo } = req.body;
      getDb().prepare('UPDATE encarte_nomes_customizados SET nome_exibicao = ?, ativo = ? WHERE codigo_produto = ?').run(nome_exibicao, ativo, req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/admin/encarte-nomes/:id', requireMaster, (req, res) => {
    try { getDb().prepare('DELETE FROM encarte_nomes_customizados WHERE codigo_produto = ?').run(req.params.id); res.json({ success: true }); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- TEMAS (Backgrounds com Vigência) ---
  app.get('/api/admin/encarte-temas', requireMaster, (req, res) => {
    try { res.json(getDb().prepare('SELECT * FROM encarte_temas').all()); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/admin/encarte-temas', requireMaster, (req, res) => {
    try {
      const { nome, imagem_fundo, data_inicio, data_fim } = req.body;
      const stmt = getDb().prepare('INSERT INTO encarte_temas (nome, imagem_fundo, data_inicio, data_fim) VALUES (?, ?, ?, ?)');
      res.status(201).json({ id: stmt.run(nome, imagem_fundo, data_inicio || null, data_fim || null).lastInsertRowid });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.put('/api/admin/encarte-temas/:id', requireMaster, (req, res) => {
    try {
      const { nome, imagem_fundo, data_inicio, data_fim, ativo } = req.body;
      getDb().prepare('UPDATE encarte_temas SET nome = ?, imagem_fundo = ?, data_inicio = ?, data_fim = ?, ativo = ? WHERE id = ?')
             .run(nome, imagem_fundo, data_inicio || null, data_fim || null, ativo, req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete('/api/admin/encarte-temas/:id', requireMaster, (req, res) => {
    try { getDb().prepare('DELETE FROM encarte_temas WHERE id = ?').run(req.params.id); res.json({ success: true }); } 
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- TEMA ATUAL (Para o Telão) ---
  app.get('/api/telao/tema-atual', (req, res) => {
    try {
      // Comparar a string ISO "YYYY-MM-DD" atual contra os campos de data no SQLite
      const now = new Date().toISOString().split('T')[0];
      const db = getDb();
      const tema = db.prepare(`
        SELECT * FROM encarte_temas 
        WHERE ativo = 1 
          AND (data_inicio IS NULL OR data_inicio <= ?)
          AND (data_fim IS NULL OR data_fim >= ?)
        ORDER BY id DESC LIMIT 1
      `).get(now, now);
      res.json(tema || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  TOLEDO — Encarte de Preços por KG
  // ═══════════════════════════════════════════════════════════════════

  // GET all Toledo products (for the Encarte slide)
  app.get('/api/toledo/produtos', (req, res) => {
    try {
      const db = getDb();

      // 1. Carregar filtros ativos
      const filtros = db.prepare('SELECT palavra_chave FROM encarte_filtros WHERE ativo = 1').all() as any[];
      const keywordList = filtros.map(f => f.palavra_chave.toLowerCase());

      // 2. Carregar nomes customizados ativos
      const nomes = db.prepare('SELECT codigo_produto, nome_exibicao FROM encarte_nomes_customizados WHERE ativo = 1').all() as any[];
      const mapNomes = new Map();
      nomes.forEach(n => mapNomes.set(n.codigo_produto, n.nome_exibicao));

      // 3. Usar a categoria macro Toledo para manter o mesmo vocabulário
      // escolhido no perfil do telão. A categoria do catálogo pode ser uma
      // subcategoria (ex.: "Queijos") e não deve reduzir o encarte selecionado.
      let produtos = db.prepare(`
        SELECT p.id, p.plu, p.nome as descricao, p.preco,
          COALESCE(t.categoria, p.categoria_legada, c.nome, 'Outros') as categoria,
          p.unidade, p.updated_at as atualizado_em
        FROM produtos p
        LEFT JOIN toledo_produtos t ON CAST(t.plu AS TEXT) = CAST(p.plu AS TEXT)
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.deleted_at IS NULL AND p.status = 1
        ORDER BY categoria ASC, p.nome ASC
      `).all() as any[];

      // 4. Aplicar filtros e renomeação
      const finalProdutos = [];
      for (const p of produtos) {
        const lowerDesc = p.descricao.toLowerCase();
        
        // Hide tags fixas
        if (lowerDesc.includes('[oculto]') || lowerDesc.includes('#hide')) continue;

        // Keyword filters
        let blocked = false;
        for (const kw of keywordList) {
          if (lowerDesc.includes(kw)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        // Sobrescrita de nome customizado
        if (mapNomes.has(p.plu)) {
          p.descricao = mapNomes.get(p.plu);
        }

        finalProdutos.push(p);
      }

      res.json(finalProdutos);
    } catch (err: any) {
      console.error('[TOLEDO API] Erro ao buscar produtos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET Toledo processing log
  app.get('/api/toledo/log', (req, res) => {
    try {
      const db = getDb();
      const logs = db.prepare(
        'SELECT * FROM toledo_log ORDER BY id DESC LIMIT 50'
      ).all();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST force refresh from file
  app.post('/api/toledo/refresh', requireMaster, async (req, res) => {
    try {
      const result = await forceToledoRefresh();

      // Sync: envia produtos atualizados para a nuvem após refresh manual
      try {
        const db = getDb();
        const produtosCloud = db.prepare(
          'SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos'
        ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string; unidade?: string }>;
        syncProdutos(produtosCloud);
      } catch (syncErr) {
        console.error('[TOLEDO] Sync cloud falhou (não crítico):', syncErr);
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  const PERSISTENT_DIR = 'C:\\ChamaAi';
  const PERSISTENT_CAT_PATH = path.join(PERSISTENT_DIR, 'categorias.json');
  const PERSISTENT_ORDEM_PATH = path.join(PERSISTENT_DIR, 'categorias-ordem.json');

  // POST update categories mapping
  app.post('/api/toledo/categorias', requireMaster, (req, res) => {
    try {
      const novasCategorias = req.body;
      
      // Always ensure the persistent directory exists
      if (!fs.existsSync(PERSISTENT_DIR)) {
        fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
      }

      // Write to persistent path (main copy)
      fs.writeFileSync(PERSISTENT_CAT_PATH, JSON.stringify(novasCategorias, null, 2), 'utf-8');
      console.log('[TOLEDO] Categorias salvas na pasta persistente:', PERSISTENT_CAT_PATH);

      // Backwards compatibility fallback write
      const otherPaths = [
        path.join(__dirname, '../../server/categorias.json'),
        path.join(__dirname, 'categorias.json'),
        path.join(process.cwd(), 'server', 'categorias.json'),
      ];

      for (const catPath of otherPaths) {
        try {
          fs.writeFileSync(catPath, JSON.stringify(novasCategorias, null, 2), 'utf-8');
          console.log('[TOLEDO] Categorias sincronizadas com cópia de fallback:', catPath);
        } catch (e) {
          // Ignore write failure on readonly folder
        }
      }

      // Reload in-memory mapping
      reloadCategorias();
      
      // Bônus: Atualiza as categorias dos produtos que JÁ ESTÃO no banco!
      const db = getDb();
      const updateStmt = db.prepare('UPDATE toledo_produtos SET categoria = ? WHERE plu = ?');
      const transaction = db.transaction((cats) => {
        for (const [plu, catName] of Object.entries(cats)) {
          updateStmt.run(catName, plu);
        }
      });
      transaction(novasCategorias);

      // Sync: envia produtos com categorias atualizadas para a nuvem
      const produtosCloud = db.prepare(
        'SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos'
      ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string; unidade?: string }>;
      syncProdutos(produtosCloud);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET categories mapping
  app.get('/api/toledo/categorias', (req, res) => {
    try {
      if (fs.existsSync(PERSISTENT_CAT_PATH)) {
        const data = JSON.parse(fs.readFileSync(PERSISTENT_CAT_PATH, 'utf-8'));
        return res.json(data);
      }

      const possiblePaths = [
        path.join(__dirname, '../../server/categorias.json'),
        path.join(__dirname, 'categorias.json'),
        path.join(process.cwd(), 'server', 'categorias.json'),
      ];

      for (const catPath of possiblePaths) {
        if (fs.existsSync(catPath)) {
          const data = JSON.parse(fs.readFileSync(catPath, 'utf-8'));
          // Initialize persistent file
          try {
            if (!fs.existsSync(PERSISTENT_DIR)) fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
            fs.writeFileSync(PERSISTENT_CAT_PATH, JSON.stringify(data, null, 2), 'utf-8');
          } catch (errWrite) {
            console.error('[TOLEDO] Erro ao inicializar arquivo persistente de categorias:', errWrite);
          }
          return res.json(data);
        }
      }

      res.json({});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Ordem das categorias no portal do cliente (totalmente dinâmico do banco) ──

  app.get('/api/toledo/categorias-ordem', (_req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const rows = db.prepare("SELECT nome FROM categorias WHERE ativo = 1 ORDER BY ordem ASC, id ASC").all() as any[];
      const names = rows.map(r => r.nome);
      res.json(names);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/toledo/categorias-ordem', requireMaster, async (req: express.Request, res: express.Response) => {
    try {
      const ordem: string[] = req.body;
      const db = getDb();

      const updateStmt = db.prepare("UPDATE categorias SET ordem = ? WHERE nome = ?");
      const transaction = db.transaction((names: string[]) => {
        names.forEach((name, index) => {
          updateStmt.run(index + 1, name);
        });
      });
      transaction(ordem);

      // Sync: grava a ordem no Supabase para o portal cliente (Vercel) ler
      try {
        syncConfiguracaoPublica('categorias_ordem', JSON.stringify(ordem));
        console.log('[SYNC] ✅ Ordem de categorias enfileirada para sincronização');
      } catch (syncErr) {
        console.error('[SYNC] ⚠️ Erro ao enfileirar ordem (não crítico):', syncErr);
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  
  // ── Funções Auxiliares do Catálogo ───────────────────────────────────────
  const generateUniqueSlug = (db: any, tableName: string, baseName: string, ignoreId?: number): string => {
    if (!baseName) return '';
    let baseSlug = baseName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (!baseSlug) baseSlug = `${tableName.slice(0, 3)}-${Date.now()}`;

    let finalSlug = baseSlug;
    let counter = 1;

    let query = `SELECT id FROM ${tableName} WHERE slug = ?`;
    let params: any[] = [finalSlug];
    if (ignoreId) {
      query += " AND id != ?";
      params.push(ignoreId);
    }

    while (db.prepare(query).get(...params)) {
      finalSlug = `${baseSlug}-${counter}`;
      params[0] = finalSlug;
      counter++;
    }

    return finalSlug;
  };

  const registerAuditLog = (db: any, acao: string, entidade: string, id: number, details: any) => {
    try {
      db.prepare(`
        INSERT INTO audit_logs (acao, entidade, entidade_id, detalhes_json, criado_em)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(acao, entidade, id, JSON.stringify(details));
    } catch (err) {
      console.error('Falha ao gravar audit log:', err);
    }
  };

  const parseJsonField = (fieldValue: any) => {
    if (fieldValue === null || fieldValue === undefined) return null;
    if (typeof fieldValue === 'string') {
      if (fieldValue.trim() === '') return null; // Treat empty string as null or valid? The user said don't overwrite if not sent, but if sent as empty string, maybe it's valid? Wait, JSON.parse('') throws. Let's just JSON.parse it to validate.
      JSON.parse(fieldValue);
      return fieldValue;
    }
    return JSON.stringify(fieldValue);
  };

  // ── FASE 2: ROTAS DO CATÁLOGO DE PRODUTOS (NOVAS) ────────────────────────
  
  app.get('/api/catalogo/produtos', (req, res) => {
    try {
      const db = getDb();
      const { search, categoria_id, status, deleted } = req.query;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string) || 50);
      const offset = (page - 1) * limit;

      let baseQuery = " FROM produtos WHERE 1=1";
      const params: any[] = [];

      if (deleted !== 'true') baseQuery += " AND deleted_at IS NULL";

      if (categoria_id) {
        baseQuery += " AND categoria_id = ?";
        params.push(categoria_id);
      }
      if (status !== undefined) {
        baseQuery += " AND status = ?";
        params.push(status);
      }
      if (search) {
        baseQuery += " AND (nome LIKE ? OR plu LIKE ? OR categoria_legada LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Ordenação segura (Whitelist)
      const allowedSortFields = ['nome', 'preco', 'categoria_id', 'status', 'created_at', 'updated_at', 'ordem'];
      let sortField = 'nome';
      let sortDirection = 'ASC';

      if (req.query.sort && allowedSortFields.includes(req.query.sort as string)) {
        sortField = req.query.sort as string;
      }
      if (req.query.order && String(req.query.order).toUpperCase() === 'DESC') {
        sortDirection = 'DESC';
      }

      const countRow = db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(...params) as any;
      const total = countRow ? countRow.total : 0;
      const totalPages = Math.ceil(total / limit);

      baseQuery += ` ORDER BY ${sortField} ${sortDirection} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const items = db.prepare(`SELECT * ${baseQuery}`).all(...params);

      res.json({
        success: true,
        data: {
          items,
          pagination: { page, limit, total, totalPages }
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/catalogo/produtos/:id', (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      const produto = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
      if (!produto) return res.status(404).json({ success: false, error: "Produto não encontrado" });
      res.json({ success: true, data: produto });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/catalogo/produtos', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const body = req.body;
      
      if (!body.nome) return res.status(400).json({ success: false, error: "Nome é obrigatório" });
      
      const preco = Number(body.preco) || 0;
      if (isNaN(preco) || preco < 0) return res.status(400).json({ success: false, error: "Preço inválido" });
      
      const estoque = Number(body.estoque) || 0;
      if (isNaN(estoque)) return res.status(400).json({ success: false, error: "Estoque inválido" });
      
      const status = body.status === undefined ? 1 : (body.status ? 1 : 0);
      
      let categoria_id = body.categoria_id || null;
      if (categoria_id) {
        const cat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(categoria_id);
        if (!cat) return res.status(400).json({ success: false, error: "Categoria informada não existe ou está excluída." });
      }

      let links = null, imagens = null, variacoes = null, configuracoes_internas = null;
      try {
        if (body.links) links = parseJsonField(body.links);
        if (body.imagens) imagens = parseJsonField(body.imagens);
        if (body.variacoes) variacoes = parseJsonField(body.variacoes);
        if (body.configuracoes_internas) configuracoes_internas = parseJsonField(body.configuracoes_internas);
      } catch (e) {
        return res.status(400).json({ success: false, error: "Campo JSON inválido" });
      }

      const slug = generateUniqueSlug(db, 'produtos', body.nome);

      const result = db.prepare(`
        INSERT INTO produtos (
          slug, nome, descricao, preco, status, estoque,
          categoria_id, categoria_legada, plu, ordem, links, imagens,
          variacoes, configuracoes_internas, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        slug, body.nome, body.descricao || null, preco, status, estoque,
        categoria_id, body.categoria_legada || null, body.plu || null, Number(body.ordem) || 0, links, imagens,
        variacoes, configuracoes_internas
      );

      const novoId = result.lastInsertRowid;
      registerAuditLog(db, 'CREATE_PRODUTO', 'PRODUTO', Number(novoId), { created: body });
      syncCatalogoProdutos();

      res.json({ success: true, data: { id: novoId }, message: "Produto criado com sucesso" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const updateProdutoSeguro = (req: any, res: any) => {
    try {
      const db = getDb();
      const id = req.params.id;
      const body = req.body;
      
      const existing = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id) as any;
      if (!existing) return res.status(404).json({ success: false, error: "Produto não encontrado ou excluído." });

      const updates: string[] = [];
      const params: any[] = [];

      if (body.nome !== undefined) {
        updates.push("nome = ?");
        params.push(body.nome);
        if (body.nome !== existing.nome && !body.slug) {
          updates.push("slug = ?");
          params.push(generateUniqueSlug(db, 'produtos', body.nome, existing.id));
        }
      }
      if (body.slug !== undefined) {
        updates.push("slug = ?");
        params.push(generateUniqueSlug(db, 'produtos', body.slug, existing.id));
      }
      
      if (body.descricao !== undefined) { updates.push("descricao = ?"); params.push(body.descricao); }
      if (body.preco !== undefined) { 
        const preco = Number(body.preco) || 0;
        if (isNaN(preco) || preco < 0) return res.status(400).json({ success: false, error: "Preço inválido" });
        updates.push("preco = ?"); params.push(preco); 
      }
      if (body.status !== undefined) { updates.push("status = ?"); params.push(body.status ? 1 : 0); }
      if (body.estoque !== undefined) { 
        const estoque = Number(body.estoque) || 0;
        if (isNaN(estoque)) return res.status(400).json({ success: false, error: "Estoque inválido" });
        updates.push("estoque = ?"); params.push(estoque); 
      }
      if (body.categoria_id !== undefined) { 
        let catId = body.categoria_id;
        if (catId) {
          const cat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(catId);
          if (!cat) return res.status(400).json({ success: false, error: "Categoria informada não existe ou está excluída." });
        }
        updates.push("categoria_id = ?"); params.push(catId || null); 
      }
      if (body.categoria_legada !== undefined) { updates.push("categoria_legada = ?"); params.push(body.categoria_legada); }
      if (body.plu !== undefined) { updates.push("plu = ?"); params.push(body.plu); }
      if (body.ordem !== undefined) { updates.push("ordem = ?"); params.push(Number(body.ordem) || 0); }

      // JSONs
      try {
        if (body.links !== undefined) { updates.push("links = ?"); params.push(parseJsonField(body.links)); }
        if (body.imagens !== undefined) { updates.push("imagens = ?"); params.push(parseJsonField(body.imagens)); }
        if (body.variacoes !== undefined) { updates.push("variacoes = ?"); params.push(parseJsonField(body.variacoes)); }
        if (body.configuracoes_internas !== undefined) { updates.push("configuracoes_internas = ?"); params.push(parseJsonField(body.configuracoes_internas)); }
      } catch (e) {
        return res.status(400).json({ success: false, error: "Campo JSON inválido" });
      }

      if (updates.length === 0) return res.json({ success: true, message: "Nada a atualizar." });

      updates.push("updated_at = datetime('now', 'localtime')");
      params.push(id);

      db.prepare(`UPDATE produtos SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      registerAuditLog(db, 'UPDATE_PRODUTO', 'PRODUTO', Number(id), { before: existing, changed_keys: Object.keys(body) });
      syncCatalogoProdutos();

      res.json({ success: true, message: "Produto atualizado com sucesso." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.put('/api/catalogo/produtos/:id', requireMaster, updateProdutoSeguro);
  app.patch('/api/catalogo/produtos/:id', requireMaster, updateProdutoSeguro);

  app.delete('/api/catalogo/produtos/:id', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      const existing = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
      if (!existing) return res.status(404).json({ success: false, error: "Produto não encontrado ou já excluído." });

      db.prepare("UPDATE produtos SET deleted_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      registerAuditLog(db, 'SOFT_DELETE', 'PRODUTO', Number(id), { message: 'Produto movido para lixeira' });
      syncDeleteCatalogoItem('produtos_publicos', Number(id));

      res.json({ success: true, message: "Produto movido para a lixeira." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/produtos/:id/restaurar', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      db.prepare("UPDATE produtos SET deleted_at = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      registerAuditLog(db, 'RESTORE', 'PRODUTO', Number(id), { message: 'Produto restaurado' });
      syncCatalogoProdutos();
      res.json({ success: true, message: "Produto restaurado com sucesso." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── FASE 2: ROTAS DO CATÁLOGO DE CATEGORIAS (NOVAS) ──────────────────────

  app.get('/api/catalogo/categorias', (req, res) => {
    try {
      const db = getDb();
      const { deleted } = req.query;
      let query = "SELECT * FROM categorias WHERE 1=1";
      if (deleted !== 'true') query += " AND deleted_at IS NULL";
      query += " ORDER BY ordem ASC, id ASC";
      const rows = db.prepare(query).all();
      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/catalogo/categorias/:id', (req, res) => {
    try {
      const db = getDb();
      const cat = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
      if (!cat) return res.status(404).json({ success: false, error: "Categoria não encontrada" });
      res.json({ success: true, data: cat });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/catalogo/categorias', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const { nome, emoji, descricao, ordem, ativo } = req.body;
      if (!nome) return res.status(400).json({ success: false, error: "Nome é obrigatório" });
      
      const slug = generateUniqueSlug(db, 'categorias', nome);
      const isAtivo = ativo === undefined ? 1 : (ativo ? 1 : 0);

      const result = db.prepare(`
        INSERT INTO categorias (nome, slug, emoji, descricao, ordem, ativo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(nome, slug, emoji || '', descricao || '', Number(ordem) || 0, isAtivo);
      
      const novoId = result.lastInsertRowid;
      registerAuditLog(db, 'CREATE_CATEGORIA', 'CATEGORIA', Number(novoId), { created: req.body });
      syncCatalogoCategorias();
      res.json({ success: true, data: { id: novoId }, message: "Categoria criada" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/categorias/ordenar', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const { ordem } = req.body; // Array de { id, ordem }
      if (!Array.isArray(ordem)) return res.status(400).json({ success: false, error: "Formato inválido" });

      const transaction = db.transaction((itens: any[]) => {
        const stmt = db.prepare("UPDATE categorias SET ordem = ? WHERE id = ? AND deleted_at IS NULL");
        for (const item of itens) {
          if (item.id !== undefined && item.ordem !== undefined) {
            stmt.run(Number(item.ordem), item.id);
          }
        }
      });
      transaction(ordem);
      registerAuditLog(db, 'REORDER', 'CATEGORIA', 0, { items: ordem.length });
      syncCatalogoCategorias();
      res.json({ success: true, message: "Categorias reordenadas" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const updateCategoriaSegura = (req: any, res: any) => {
    try {
      const db = getDb();
      const id = req.params.id;
      const body = req.body;
      const existing = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id) as any;
      if (!existing) return res.status(404).json({ success: false, error: "Categoria não encontrada" });

      const updates: string[] = [];
      const params: any[] = [];

      if (body.nome !== undefined) {
        updates.push("nome = ?"); params.push(body.nome);
        if (body.nome !== existing.nome && !body.slug) {
          updates.push("slug = ?"); params.push(generateUniqueSlug(db, 'categorias', body.nome, existing.id));
        }
      }
      if (body.slug !== undefined) {
        updates.push("slug = ?"); params.push(generateUniqueSlug(db, 'categorias', body.slug, existing.id));
      }
      if (body.emoji !== undefined) { updates.push("emoji = ?"); params.push(body.emoji); }
      if (body.descricao !== undefined) { updates.push("descricao = ?"); params.push(body.descricao); }
      if (body.ordem !== undefined) { updates.push("ordem = ?"); params.push(Number(body.ordem) || 0); }
      if (body.ativo !== undefined) { updates.push("ativo = ?"); params.push(body.ativo ? 1 : 0); }

      if (updates.length === 0) return res.json({ success: true, message: "Nada a atualizar" });

      params.push(id);
      db.prepare(`UPDATE categorias SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      
      registerAuditLog(db, 'UPDATE_CATEGORIA', 'CATEGORIA', Number(id), { before: existing, changed_keys: Object.keys(body) });
      syncCatalogoCategorias();
      res.json({ success: true, message: "Categoria atualizada" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.put('/api/catalogo/categorias/:id', requireMaster, updateCategoriaSegura);
  app.patch('/api/catalogo/categorias/:id', requireMaster, updateCategoriaSegura);

  app.delete('/api/catalogo/categorias/:id', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      const cat = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
      if (!cat) return res.status(404).json({ success: false, error: "Categoria não encontrada" });

      const countRow = db.prepare("SELECT COUNT(*) as count FROM produtos WHERE categoria_id = ? AND deleted_at IS NULL").get(id) as any;
      if (countRow && countRow.count > 0) {
        return res.status(409).json({ 
          success: false, 
          error: "Não é possível excluir", 
          details: { vinculados: countRow.count },
          message: `Existem ${countRow.count} produto(s) vinculados a esta categoria. Mova-os primeiro ou inative a categoria.`
        });
      }

      db.prepare("UPDATE categorias SET deleted_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      registerAuditLog(db, 'SOFT_DELETE', 'CATEGORIA', Number(id), { message: 'Categoria movida para lixeira' });
      syncDeleteCatalogoItem('categorias_publicas', Number(id));
      res.json({ success: true, message: "Categoria movida para a lixeira." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/categorias/:id/mover-produtos', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const oldId = req.params.id;
      const { nova_categoria_id } = req.body;
      
      if (!nova_categoria_id) return res.status(400).json({ success: false, error: "nova_categoria_id é obrigatório" });
      if (String(oldId) === String(nova_categoria_id)) return res.status(400).json({ success: false, error: "A nova categoria deve ser diferente" });

      const oldCat = db.prepare("SELECT id FROM categorias WHERE id = ?").get(oldId);
      if (!oldCat) return res.status(404).json({ success: false, error: "Categoria antiga não encontrada" });
      
      const newCat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(nova_categoria_id);
      if (!newCat) return res.status(404).json({ success: false, error: "Nova categoria não encontrada ou está excluída" });

      const result = db.prepare("UPDATE produtos SET categoria_id = ?, updated_at = datetime('now', 'localtime') WHERE categoria_id = ? AND deleted_at IS NULL").run(nova_categoria_id, oldId);
      
      registerAuditLog(db, 'MOVER_PRODUTOS', 'CATEGORIA', Number(oldId), { para: nova_categoria_id, quantidade: result.changes });
      syncCatalogoProdutos();
      res.json({ success: true, message: `${result.changes} produto(s) movidos com sucesso.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/categorias/:id/restaurar', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      db.prepare("UPDATE categorias SET deleted_at = NULL WHERE id = ?").run(id);
      registerAuditLog(db, 'RESTORE', 'CATEGORIA', Number(id), { message: 'Categoria restaurada' });
      syncCatalogoCategorias();
      res.json({ success: true, message: "Categoria restaurada" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/categorias/:id/inativar', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      db.prepare("UPDATE categorias SET ativo = 0 WHERE id = ? AND deleted_at IS NULL").run(id);
      registerAuditLog(db, 'INATIVAR', 'CATEGORIA', Number(id), { message: 'Categoria inativada' });
      syncCatalogoCategorias();
      res.json({ success: true, message: "Categoria inativada" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/catalogo/categorias/:id/ativar', requireMaster, (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      db.prepare("UPDATE categorias SET ativo = 1 WHERE id = ? AND deleted_at IS NULL").run(id);
      registerAuditLog(db, 'ATIVAR', 'CATEGORIA', Number(id), { message: 'Categoria ativada' });
      syncCatalogoCategorias();
      res.json({ success: true, message: "Categoria ativada" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


// ── CRUD de Categorias Dinâmicas ───────────────────────────────────────────

  // GET all categories
  app.get('/api/categorias', (req, res) => {
    try {
      const db = getDb();
      const rows = db.prepare("SELECT * FROM categorias ORDER BY ordem ASC, id ASC").all();
      const mapped = rows.map((r: any) => ({
        id: r.id,
        nome: r.nome,
        emoji: r.emoji || '',
        descricao: r.descricao || '',
        ordem: r.ordem || 0,
        ativo: r.ativo === 1,
        setor: r.setor || 'Outros'
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST create category
  app.post('/api/categorias', requireMaster, (req, res) => {
    try {
      const { nome, emoji, descricao, ordem, ativo, setor } = req.body;
      if (!nome || typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }

      const db = getDb();
      const insertStmt = db.prepare(`
        INSERT INTO categorias (nome, emoji, descricao, ordem, ativo, setor)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(
        nome.trim(),
        emoji || '',
        descricao || '',
        ordem !== undefined ? Number(ordem) : 0,
        ativo === false ? 0 : 1,
        setor || 'Outros'
      );

      res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT update category
  app.put('/api/categorias/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const { nome, emoji, descricao, ordem, ativo, setor } = req.body;
      if (!nome || typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
      }

      const db = getDb();
      const updateStmt = db.prepare(`
        UPDATE categorias 
        SET nome = ?, emoji = ?, descricao = ?, ordem = ?, ativo = ?, setor = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `);
      updateStmt.run(
        nome.trim(),
        emoji || '',
        descricao || '',
        ordem !== undefined ? Number(ordem) : 0,
        ativo === false ? 0 : 1,
        setor || 'Outros',
        id
      );

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE category
  app.delete('/api/categorias/:id', requireMaster, (req, res) => {
    try {
      const { id } = req.params;
      const db = getDb();
      const deleteStmt = db.prepare("DELETE FROM categorias WHERE id = ?");
      deleteStmt.run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET export categories
  app.get('/api/categorias/export', (req, res) => {
    try {
      const format = req.query.format || 'json';
      const db = getDb();
      const rows = db.prepare("SELECT * FROM categorias ORDER BY ordem ASC, id ASC").all() as any[];

      if (format === 'csv') {
        let csvContent = 'nome,emoji,descricao,ordem,ativo,setor\n';
        rows.forEach(r => {
          const nomeSafe = `"${r.nome.replace(/"/g, '""')}"`;
          const emojiSafe = `"${(r.emoji || '').replace(/"/g, '""')}"`;
          const descSafe = `"${(r.descricao || '').replace(/"/g, '""')}"`;
          const ordem = r.ordem || 0;
          const ativo = r.ativo === 1 ? 'true' : 'false';
          const setorSafe = `"${(r.setor || 'Outros').replace(/"/g, '""')}"`;
          csvContent += `${nomeSafe},${emojiSafe},${descSafe},${ordem},${ativo},${setorSafe}\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"');
        return res.send(csvContent);
      }

      // JSON format
      const jsonContent = rows.map(r => ({
        nome: r.nome,
        emoji: r.emoji || '',
        descricao: r.descricao || '',
        ordem: r.ordem || 0,
        ativo: r.ativo === 1,
        setor: r.setor || 'Outros'
      }));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="categorias.json"');
      res.json(jsonContent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST import categories
  app.post('/api/categorias/import', requireMaster, (req, res) => {
    try {
      const { data, format } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Nenhum dado fornecido para importação.' });
      }

      let parsed: Array<{ nome: string, emoji?: string, descricao?: string, ordem?: number, ativo?: boolean, setor?: string }> = [];

      if (format === 'csv') {
        // Parser simples de CSV que lida com aspas
        const lines = data.split(/\r?\n/);
        if (lines.length > 0) {
          const header = lines[0].toLowerCase().split(',');
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;

            const fields: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let c = 0; c < line.length; c++) {
              const char = line[c];
              if (char === '"') {
                if (inQuotes && line[c + 1] === '"') {
                  current += '"';
                  c++;
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                fields.push(current);
                current = '';
              } else {
                current += char;
              }
            }
            fields.push(current);

            const item: any = {};
            header.forEach((h: string, idx: number) => {
              const cleanH = h.trim();
              if (cleanH === 'nome') item.nome = fields[idx]?.trim();
              if (cleanH === 'emoji') item.emoji = fields[idx]?.trim();
              if (cleanH === 'descricao' || cleanH === 'descrição') item.descricao = fields[idx]?.trim();
              if (cleanH === 'ordem') item.ordem = parseInt(fields[idx]);
              if (cleanH === 'ativo') item.ativo = fields[idx]?.toLowerCase() === 'true' || fields[idx] === '1';
              if (cleanH === 'setor') item.setor = fields[idx]?.trim();
            });
            if (item.nome) {
              parsed.push(item);
            }
          }
        }
      } else {
        // JSON format
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ error: 'O formato JSON de importação deve ser uma lista (array).' });
        }
      }

      const db = getDb();
      const insertOrUpdate = db.prepare(`
        INSERT INTO categorias (nome, emoji, descricao, ordem, ativo, setor)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(nome) DO UPDATE SET
          emoji = excluded.emoji,
          descricao = excluded.descricao,
          ordem = excluded.ordem,
          ativo = excluded.ativo,
          setor = excluded.setor,
          updated_at = datetime('now', 'localtime')
      `);

      const transaction = db.transaction((items) => {
        items.forEach((item: any) => {
          insertOrUpdate.run(
            item.nome.trim(),
            item.emoji || '',
            item.descricao || '',
            item.ordem !== undefined ? Number(item.ordem) : 0,
            item.ativo === false ? 0 : 1,
            item.setor || 'Outros'
          );
        });
      });

      transaction(parsed);
      res.json({ success: true, count: parsed.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update product description manually (admin)
  app.put('/api/toledo/produtos/:plu', (req, res) => {
    try {
      const { plu } = req.params;
      const { descricao, unidade } = req.body;
      const db = getDb();
      
      if (descricao !== undefined && unidade !== undefined) {
        db.prepare(`UPDATE toledo_produtos SET descricao = ?, unidade = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
          .run(descricao, unidade, plu);
      } else if (unidade !== undefined) {
        db.prepare(`UPDATE toledo_produtos SET unidade = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
          .run(unidade, plu);
      } else if (descricao !== undefined) {
        db.prepare(`UPDATE toledo_produtos SET descricao = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
          .run(descricao, plu);
      } else {
        return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido.' });
      }
      
      broadcastEvent('TOLEDO_PRECOS_ATUALIZADOS', { action: 'description_update' });
      // Sync manual change to catalog
      const updatedItem = db.prepare("SELECT plu, preco, descricao, categoria, unidade FROM toledo_produtos WHERE plu = ?").get(plu);
      if (updatedItem) syncToCatalogoProduto(db, updatedItem as any);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ── ROTAS DE IDENTIDADE CLOUD LOCAL (FASE 1) ──────────────────────
  // ═══════════════════════════════════════════════════════════════════

  // Retorna a identidade atual (com chaves e tokens mascarados/ocultados por completo)
  app.get('/api/cloud/identity', (req, res) => {
    try {
      const { getCloudIdentity, maskLicenseKey, maskPortalToken } = require('./services/cloud-identity.service');
      const identity = getCloudIdentity();
      const result = {
        ...identity,
        device_token: undefined, // remove token real por completo
        license_key: undefined, // remove chave real por completo
        portal_public_token: undefined, // remove portal public token real
        has_device_token: !!identity.device_token,
        license_key_masked: maskLicenseKey(identity.license_key),
        portal_public_token_masked: maskPortalToken(identity.portal_public_token)
      };
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Retorna de forma segura apenas booleanos e status operacionais para diagnóstico
  app.get('/api/cloud/status', (req, res) => {
    try {
      const { getCloudIdentity } = require('./services/cloud-identity.service');
      const { getCloudIngestionConfig } = require('./services/cloud-ingestion.service');
      const { getCloudLicenseConfig } = require('./services/cloud-license.service');
      const { getCloudCommandsConfig } = require('./services/cloud-commands.service');
      
      const identity = getCloudIdentity();
      const ingestConfig = getCloudIngestionConfig();
      const licenseConfig = getCloudLicenseConfig();
      const commandsConfig = getCloudCommandsConfig();
      
      // Contagem de itens pendentes na fila local
      let pendingCount = 0;
      try {
        const db = getDb();
        const row = db.prepare('SELECT count(*) as count FROM supabase_sync_queue').get() as { count: number };
        pendingCount = row?.count || 0;
      } catch (e) {}
      
      let syncStatus = 'disabled';
      if (identity.cloud_enabled === 1 && identity.tenant_id && identity.store_id) {
        syncStatus = pendingCount > 0 ? 'pending_items' : 'ready';
      }
      
      res.json({
        cloud_enabled: identity.cloud_enabled === 1,
        has_tenant: !!identity.tenant_id,
        has_store: !!identity.store_id,
        has_device_token: !!identity.device_token,
        has_portal_token: !!identity.portal_public_token,
        ingest_configured: !!ingestConfig.url,
        activate_configured: !!licenseConfig.activateUrl,
        checkin_configured: !!licenseConfig.checkinUrl,
        commands_configured: !!commandsConfig.commandsUrl,
        last_checkin_at: identity.last_checkin_at || null,
        sync_status: syncStatus,
        pending_sync_items: pendingCount
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ativa a sincronização na nuvem com tenant e store locais ou via Cloud
  app.post('/api/cloud/activate', requireMaster, async (req, res) => {
    try {
      const { tenant_id, store_id, license_key } = req.body;
      const { setCloudIdentity, maskLicenseKey, maskPortalToken, getDeviceToken } = require('./services/cloud-identity.service');

      if (!license_key || typeof license_key !== 'string' || license_key.trim() === '') {
        return res.status(400).json({ error: 'license_key é obrigatório e deve ser texto válido.' });
      }

      // MODO B: Ativação Manual (Fallback / Dev)
      if (tenant_id && store_id) {
        console.log(`[CLOUD IDENTITY] 🌐 Ativando nuvem localmente (MANUAL) para Tenant: ${tenant_id}, Loja: ${store_id}`);
        
        const updated = setCloudIdentity({
          tenant_id: tenant_id.trim(),
          store_id: store_id.trim(),
          license_key: license_key.trim(),
          cloud_enabled: 1,
          status: 'active'
        });

        const token = getDeviceToken();

        return res.json({
          ...updated,
          device_token: undefined, // remove token real por completo
          license_key: undefined, // remove chave real por completo
          portal_public_token: undefined, // remove portal public token real
          has_device_token: !!token,
          license_key_masked: maskLicenseKey(updated.license_key),
          portal_public_token_masked: maskPortalToken(updated.portal_public_token),
          message: token ? 'Ativado manualmente.' : 'Ativado manualmente. O sync cloud continuará pausado pois não há device_token.'
        });
      }
      
      // MODO A: Ativação Cloud Real
      const { activateLicense } = require('./services/cloud-license.service');
      const activationData = await activateLicense(license_key.trim());

      const updated = require('./services/cloud-identity.service').getCloudIdentity();

      res.json({
        ...updated,
        device_token: undefined, // remove token real por completo da resposta principal
        license_key: undefined, // remove chave real por completo da resposta principal
        portal_public_token: undefined, // remove portal public token real da resposta principal
        has_device_token: !!updated.device_token,
        license_key_masked: maskLicenseKey(updated.license_key),
        portal_public_token_masked: maskPortalToken(updated.portal_public_token),
        cloud_response: {
          license: activationData.license,
          next_checkin_seconds: activationData.next_checkin_seconds
          // device_token retornado via Deno pode vir aqui se necessário para fins de exibição única
        }
      });
    } catch (err: any) {
      console.error('[CLOUD IDENTITY] ❌ Falha na ativação cloud:', err);
      res.status(500).json({ error: err.message });
    }
  });


  // Retorna o status simplificado da licença/ativação
  app.post('/api/cloud/check-license', (req, res) => {
    try {
      const { getCloudIdentity } = require('./services/cloud-identity.service');
      const identity = getCloudIdentity();
      if (identity.cloud_enabled === 1 && identity.tenant_id && identity.store_id) {
        return res.json({
          ok: true,
          cloud_enabled: true,
          status: identity.status || 'active'
        });
      } else {
        return res.json({
          ok: false,
          cloud_enabled: false,
          status: identity.status || 'pending'
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Registra check-in do servidor
  app.post('/api/cloud/checkin', (req, res) => {
    try {
      const { setCloudIdentity, getCloudCheckinPayload } = require('./services/cloud-identity.service');
      const nowStr = new Date().toISOString();
      
      // Salva último check-in no banco local
      setCloudIdentity({
        last_checkin_at: nowStr
      });

      const payload = getCloudCheckinPayload();
      console.log(`[CLOUD IDENTITY] 📡 Check-in executado localmente. Status: ${payload.status}`);
      res.json(payload);
    } catch (err: any) {
      console.error('[CLOUD IDENTITY] ❌ Falha no check-in local:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  
  setupMediaIndoorRoutes(app, broadcastEvent, requireMaster);
  setupTelaoAssetRoutes(app);
  setupVignetteRoutes(app, broadcastEvent, requireMaster);

  // Catch-all 404 handler for API
  
  // --- TEMPORARY TEST ENDPOINT ---
  app.get('/api/dev/test-fase2-1', (req, res) => {
    try {
      const db = getDb();
      const plu = "5881";
      
      // Update custom fields in catalog to simulate manual edit
      db.prepare(`UPDATE produtos SET imagens = '["img1.png"]', tags = '["premium"]', slug = 'alho-custom' WHERE plu = ?`).run(plu);
      
      // Force a sync update from Toledo side
      const toledo = db.prepare("SELECT plu, preco, descricao, categoria, unidade FROM toledo_produtos WHERE plu = ?").get(plu);
      if (toledo) {
        syncToCatalogoProduto(db, toledo as any);
      }
      
      // Fetch result
      const prod = db.prepare("SELECT plu, nome, imagens, tags, slug, preco FROM produtos WHERE plu = ?").get(plu);
      const logs = db.prepare("SELECT acao, detalhes_json, criado_em FROM audit_logs WHERE entidade = 'produtos' AND entidade_id = (SELECT id FROM produtos WHERE plu = ?) ORDER BY id DESC LIMIT 5").all(plu);
      
      res.json({ prod, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api', (req, res) => {
    console.warn(`404 - Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.url}` });
  });

  // Serve Frontend to network clients
  const frontendPath = path.join(__dirname, '../../dist');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    // Middleware para SPA: se não for API, uploads ou atualizações locais, manda o index.html
    app.use((req, res, next) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/uploads') || req.url.startsWith('/tts') || req.url.startsWith('/local-updates')) {
        return next();
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  // Rota para resetar as senhas manualmente
  app.post('/api/reset-senhas', requireMaster, (req, res) => {
    try {
      const db = getDb();
      // 1. Reseta os contadores de todos os balcões
      db.prepare("UPDATE balcoes SET contador_atual = 0").run();
      
      // 2. Limpeza total de senhas e chamadas para um reinício do zero
      db.prepare("DELETE FROM chamadas").run();
      db.prepare("DELETE FROM senhas").run();

      // Sync: limpa senhas na nuvem
      syncLimparSenhas();
      
      // Notifica todos os terminais para resetarem seu estado local IMEDIATAMENTE
      broadcastEvent('SISTEMA_RESETADO', { success: true });
      broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
      
      res.json({ success: true, message: 'Sistema resetado com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });



  const server = app.listen(PORT, async () => {
    console.log('========================================');
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log('========================================');

    // Iniciar anúncio por broadcast UDP para auto-descoberta
    startUdpBroadcast();

    // Startup reset check and configs synchronization
    try {
      const db = getDb();

      // Execute category migration safely on server startup
      try {
        migrateDatabaseAndConfigs(db);
        reloadCategorias();
      } catch (migErr: any) {
        console.error('[STARTUP] Erro ao executar migração de categorias:', migErr.message);
      }

      // Inicializa a identidade cloud local
      try {
        const { ensureInstallationId } = require('./services/cloud-identity.service');
        const identity = ensureInstallationId();
        console.log(`[STARTUP] ✅ Identidade local da instalação inicializada. ID: ${identity.installation_id}`);
      } catch (identityErr: any) {
        console.error('[STARTUP] ⚠️ Erro ao inicializar identidade da instalação (não crítico):', identityErr.message);
      }

      // Garante que a tabela de tokens remotos existe
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS tokens_remotos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          ip_origem TEXT,
          criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          expira_em TEXT NOT NULL
        )`);
      } catch (e) {
        console.error('[STARTUP] Erro ao criar tabela tokens_remotos:', e);
      }
      
      // 1. Sync public configuration options to Supabase
      const rows = db.prepare("SELECT chave, valor FROM configuracoes").all() as any[];
      const cfg = rows.reduce((acc, row) => ({ ...acc, [row.chave]: row.valor }), {} as Record<string, string>);
      
      if (cfg['nome_estabelecimento']) {
        syncConfiguracaoPublica('nome_estabelecimento', cfg['nome_estabelecimento']);
      }
      if (cfg['portal_voz_alerta']) {
        syncConfiguracaoPublica('portal_voz_alerta', cfg['portal_voz_alerta']);
      }
      if (cfg['portal_som_sua_vez']) {
        syncConfiguracaoPublica('portal_som_sua_vez', cfg['portal_som_sua_vez']);
      }
      if (cfg['portal_som_prestes_chamar']) {
        syncConfiguracaoPublica('portal_som_prestes_chamar', cfg['portal_som_prestes_chamar']);
      }
      if (cfg['toledo_encarte_ativo'] !== undefined) {
        syncConfiguracaoPublica('toledo_encarte_ativo', cfg['toledo_encarte_ativo']);
      }
      if (cfg['toledo_ocultar_em_falta'] !== undefined) {
        syncConfiguracaoPublica('toledo_ocultar_em_falta', cfg['toledo_ocultar_em_falta']);
      }
      if (cfg['telao_ticker_texto'] !== undefined) {
        syncConfiguracaoPublica('telao_ticker_texto', cfg['telao_ticker_texto']);
      }

      // Sincroniza a ordem das categorias no startup
      try {
        let ordemCategorias: string[] = [];
        if (fs.existsSync(PERSISTENT_ORDEM_PATH)) {
          ordemCategorias = JSON.parse(fs.readFileSync(PERSISTENT_ORDEM_PATH, 'utf-8'));
        } else {
          const possiblePaths = [
            path.join(__dirname, '../../server/categorias-ordem.json'),
            path.join(__dirname, 'categorias-ordem.json'),
            path.join(process.cwd(), 'server', 'categorias-ordem.json'),
          ];
          for (const orderPath of possiblePaths) {
            if (fs.existsSync(orderPath)) {
              ordemCategorias = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
              break;
            }
          }
        }
        if (ordemCategorias && ordemCategorias.length > 0) {
          syncConfiguracaoPublica('categorias_ordem', JSON.stringify(ordemCategorias));
          console.log('[STARTUP] ✅ Ordem de categorias sincronizada com Supabase:', ordemCategorias.length, 'categorias');
        }
      } catch (errOrdem) {
        console.error('[STARTUP] Erro ao sincronizar ordem das categorias no startup:', errOrdem);
      }

      if (cfg['logo_cliente']) {
        const fullLogoPath = resolveManagedAssetPath(cfg['logo_cliente']);
        if (fullLogoPath && fs.existsSync(fullLogoPath)) {
          const base64 = fs.readFileSync(fullLogoPath, 'base64');
          const ext = path.extname(fullLogoPath).toLowerCase().replace('.', '');
          const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const dataUrl = `data:${mimeType};base64,${base64}`;
          syncConfiguracaoPublica('logo_cliente_base64', dataUrl);
          console.log('[STARTUP] ✅ Logo do estabelecimento sincronizada em base64 com Supabase');
        }
      }

      // Sincronização pendente da cor primária no startup
      try {
        const pendente = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'sync_pendente_cor_primaria'").get() as any;
        if (pendente && pendente.valor === '1' && isSupabaseConfigured()) {
          const cor = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'cor_primaria'").get() as any;
          if (cor && cor.valor) {
            console.log('[STARTUP] Detectado cor_primaria pendente de sincronização. Tentando sincronizar com o Supabase...');
            const client = createSupabaseAnonClient();
            if (client) {
              const { error } = await client
                .from('configuracoes_publicas')
                .upsert({ chave: 'cor_primaria', valor: cor.valor, updated_at: new Date().toISOString() });
            
              if (!error) {
                db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '0', datetime('now'))").run();
                console.log('[STARTUP] ✅ Cor primária sincronizada com sucesso e flag de pendência limpa.');
              } else {
                throw error;
              }
            }
          }
        }
      } catch (errColor) {
        console.warn('[STARTUP] Supabase offline — cor_primaria permanece pendente de sincronização.');
      }

      // Sincroniza todos os produtos Toledo ativos no startup para garantir que a nuvem esteja atualizada
      try {
        const produtosCloud = db.prepare(
          'SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos'
        ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string; unidade?: string }>;
        if (produtosCloud.length > 0) {
          syncProdutos(produtosCloud);
          console.log('[STARTUP] ✅ Enfileirada sincronização de', produtosCloud.length, 'produtos Toledo com o Supabase');
        }
      } catch (errProd) {
        console.error('[STARTUP] Erro ao sincronizar produtos no startup:', errProd);
      }

      // 2. Perform daily reset if the server was off at reset time
      const configReset = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'reset_diario_automatico'").get() as any;
      if (configReset && configReset.valor === '1') {
        const hoje = new Date().toISOString().split('T')[0];
        const ultimoResetRecord = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'ultimo_reset'").get() as any;
        
        if (!ultimoResetRecord || ultimoResetRecord.valor !== hoje) {
          console.log('[STARTUP] Detectado que o reset diário de hoje ainda não foi realizado. Executando agora...');
          db.prepare("UPDATE balcoes SET contador_atual = 0").run();
          db.prepare("DELETE FROM senhas WHERE status = 'aguardando'").run();
          
          db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('ultimo_reset', ?, datetime('now'))").run(hoje);
          
          // Clear cloud
          syncLimparSenhas();

          // Emitir evento SSE de reset ao virar o dia
          const eventoReset = {
            tipo: 'DIA_RESETADO',
            timestamp: new Date().toISOString(),
            mensagem: 'Novo dia iniciado. Recarregando estado.'
          };
          broadcastEvent('DIA_RESETADO', eventoReset);
          
          console.log('[STARTUP] Reset diário concluído com sucesso.');
        }
      }
    } catch (err) {
      console.error('[STARTUP] Erro no check de reset diário / sync de configurações:', err);
    }

    // Start Toledo file watcher after server is ready
    try {
      setBroadcastFn(broadcastEvent);  // Inject SSE broadcaster (avoids circular dependency)
      toledoWatcherCleanup = startToledoWatcher();
    } catch (err) {
      console.error('[TOLEDO] Erro ao iniciar watcher (não crítico):', err);
    }

    // Start Supabase command listener for remote operator (Vercel)
    try {
      startSupabaseCommandListener();
    } catch (err) {
      console.error('[SUPABASE] Erro ao iniciar command listener (não crítico):', err);
    }

    // Start Supabase sync worker (Outbox Pattern — processa fila local a cada 5s)
    try {
      startSyncWorker();
      startCloudCheckinCron();
      startCloudCommandsCron();
    } catch (err) {
      console.error('[SUPABASE] Erro ao iniciar sync worker, checkin ou commands cron (não crítico):', err);
    }
    try {
      startVignetteScheduler(broadcastEvent);
      console.log('[VINHETAS] Agendador recorrente iniciado.');
    } catch (err) {
      console.error('[VINHETAS] Erro ao iniciar agendador:', err);
    }
  });

  serverInstance = server;

  // Heartbeat para manter as conexões SSE ativas e evitar timeouts
  heartbeatInterval = setInterval(() => {
    const pingPayload = `data: ${JSON.stringify({ event: 'HEARTBEAT', data: { timestamp: Date.now() } })}\n\n`;
    sseClients.forEach(client => {
      try { client.write(pingPayload); } catch (e) {}
    });
    Object.keys(telaoSseClients).forEach(code => {
      telaoSseClients[code].forEach(client => {
        try { client.write(pingPayload); } catch (e) {}
      });
    });
  }, 15000);

  server.on('connection', (socket: any) => {
    serverSockets.add(socket);
    socket.on('close', () => {
      serverSockets.delete(socket);
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// BACKUP INTELIGENTE — Agendamento & Opt-in
// ═══════════════════════════════════════════════════════════════════

function carregarConfiguracoes(): Record<string, string> {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT chave, valor FROM configuracoes').all() as any[];
    return rows.reduce((acc, row) => ({ ...acc, [row.chave]: row.valor }), {} as Record<string, string>);
  } catch {
    return {};
  }
}

async function executarBackupAgendado() {
  const cfg = carregarConfiguracoes();

  // Opt-in rigoroso
  if (cfg.backup_agendado_ativo !== '1') {
    console.log('[BACKUP] Agendamento desativado, ignorando.');
    return;
  }

  // Verificar frequência
  const hoje = new Date();
  if (cfg.backup_frequencia === 'semanal' && hoje.getDay() !== 0) return;
  if (cfg.backup_frequencia === 'mensal' && hoje.getDate() !== 1) return;

  console.log('[BACKUP] Executando backup agendado...');

  const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
  const backupDir = cfg.backup_destino && cfg.backup_destino.trim() !== '' 
    ? cfg.backup_destino.trim() 
    : path.join(dataDir, 'Backups');

  await gerarBackupZip({
    incluirConfig: cfg.backup_incluir_config !== '0',
    incluirOperadores: cfg.backup_incluir_operadores !== '0',
    incluirBalcoes: cfg.backup_incluir_balcoes !== '0',
    incluirMidias: cfg.backup_incluir_midias !== '0',
    destino: backupDir,
  });

  // Auto-limpeza: manter backups dos últimos 30 dias
  await limparBackupsAntigos(backupDir, 30);
}

async function gerarBackupZip(opts: {
  incluirConfig: boolean;
  incluirOperadores: boolean;
  incluirBalcoes: boolean;
  incluirMidias: boolean;
  destino: string;
}) {
  const { execSync } = require('child_process');
  const crypto = require('crypto');
  const db = getDb();
  const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
  const uploadsDir = path.join(dataDir, 'uploads');

  if (!fs.existsSync(opts.destino)) {
    fs.mkdirSync(opts.destino, { recursive: true });
  }

  const dataStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timestamp = Date.now();
  const zipFile = path.join(opts.destino, `backup_${dataStr}_${timestamp}.zip`);
  const tempDir = path.join(opts.destino, `_temp_${timestamp}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const backupData: any = {};

    if (opts.incluirConfig) {
      backupData.configuracoes = db.prepare('SELECT * FROM configuracoes').all();
    }
    if (opts.incluirOperadores) {
      backupData.operadores = db.prepare('SELECT * FROM operadores').all();
    }
    if (opts.incluirBalcoes) {
      backupData.balcoes = db.prepare('SELECT * FROM balcoes').all();
    }
    if (opts.incluirMidias) {
      backupData.midias = db.prepare('SELECT * FROM midias').all();
    }

    // Salvar dados do banco como JSON
    const dbJsonPath = path.join(tempDir, 'database.json');
    fs.writeFileSync(dbJsonPath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Copiar arquivos físicos de mídia se solicitado
    if (opts.incluirMidias && fs.existsSync(uploadsDir)) {
      const uploadsBackupDir = path.join(tempDir, 'uploads');
      fs.mkdirSync(uploadsBackupDir, { recursive: true });
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const src = path.join(uploadsDir, file);
        const dst = path.join(uploadsBackupDir, file);
        if (fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dst);
        }
      }
    }

    // Gerar manifest com SHA-256
    const manifest: Record<string, string> = {};
    const walkDir = (dir: string, prefix: string = '') => {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        if (fs.statSync(fullPath).isDirectory()) {
          walkDir(fullPath, relPath);
        } else {
          const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
          manifest[relPath] = hash;
        }
      }
    };
    walkDir(tempDir);
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    // Compactar em ZIP usando PowerShell
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFile}' -Force"`,
      { timeout: 120000 }
    );
    console.log(`[BACKUP] ✅ Arquivo ZIP gerado: ${zipFile}`);

    // --- VALIDAÇÃO DO BACKUP (Compactação e Descompactação) ---
    console.log(`[BACKUP] 🔍 Iniciando validação do backup gerado...`);
    const validationDir = path.join(opts.destino, `_val_${timestamp}`);
    try {
      fs.mkdirSync(validationDir, { recursive: true });
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipFile}' -DestinationPath '${validationDir}' -Force"`,
        { timeout: 120000 }
      );
      
      const dbJsonValPath = path.join(validationDir, 'database.json');
      if (!fs.existsSync(dbJsonValPath)) {
        throw new Error("Arquivo database.json não encontrado após descompactação da validação.");
      }
      
      const valHash = crypto.createHash('sha256').update(fs.readFileSync(dbJsonValPath)).digest('hex');
      const originalHash = manifest['database.json'];
      
      if (valHash !== originalHash) {
        throw new Error(`Checksum SHA256 inválido para database.json. Esperado: ${originalHash}, Obtido: ${valHash}`);
      }
      console.log(`[BACKUP] ✅ Validação concluída. O backup está íntegro.`);
    } catch (valErr: any) {
      console.error(`[BACKUP] ❌ Falha na validação do backup: ${valErr.message}`);
      throw new Error(`Validação de integridade do backup falhou: ${valErr.message}`);
    } finally {
      try { fs.rmSync(validationDir, { recursive: true, force: true }); } catch (e) {}
    }
    // -------------------------------------------------------------

    return zipFile;
  } finally {
    // Limpar pasta temporária
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('[BACKUP] ⚠️ Erro ao limpar pasta temporária:', e);
    }
  }
}

async function restoreBackupZip(zipFilePath: string): Promise<void> {
  const { execSync } = require('child_process');
  const crypto = require('crypto');
  const db = getDb();
  const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
  const uploadsDir = path.join(dataDir, 'uploads');
  const tempDir = path.join(dataDir, 'Backups', `_extract_${Date.now()}`);

  let actualZipPath = zipFilePath;
  const needsRename = !zipFilePath.toLowerCase().endsWith('.zip');

  if (needsRename) {
    actualZipPath = zipFilePath + '.zip';
    if (fs.existsSync(zipFilePath)) {
      // Pequeno atraso para garantir liberação do descriptor do multer antes do rename se necessário
      await new Promise(resolve => setTimeout(resolve, 200));
      fs.renameSync(zipFilePath, actualZipPath);
    }
  }

  // Atraso de segurança de 500ms para Windows liberar qualquer lock de leitura no arquivo
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Extrai o ZIP via PowerShell nativo (protegendo caminhos contra aspas simples)
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${actualZipPath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force"`,
      { timeout: 120000 }
    );

    // Valida o Manifest
    const manifestPath = path.join(tempDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Arquivo manifest.json ausente. Backup corrompido, inválido ou criado em versão antiga.');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const tempUploads = path.join(tempDir, 'uploads');
    
    // Checa a integridade via SHA-256 de todos os arquivos
    for (const [relPath, expectedHash] of Object.entries(manifest)) {
      if (typeof expectedHash !== 'string') continue;
      const fullPath = path.join(tempDir, relPath);
      if (!fs.existsSync(fullPath)) throw new Error(`Arquivo faltante no pacote de backup: ${relPath}`);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      if (hash !== expectedHash) throw new Error(`Hash inválido (corrupção detectada) para: ${relPath}`);
    }

    // Lê os dados do banco SQLite em JSON
    const dbJsonPath = path.join(tempDir, 'database.json');
    if (!fs.existsSync(dbJsonPath)) throw new Error('Arquivo database.json ausente no backup.');
    const backupData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));

    // Inicia a restauração atômica do SQLite
    const tables = ['configuracoes', 'balcoes', 'midias', 'operadores'];
    db.prepare('PRAGMA foreign_keys = OFF').run();

    try {
      const transaction = db.transaction((data: any) => {
        db.prepare('DELETE FROM chamadas').run();
        db.prepare('DELETE FROM senhas').run();

        for (const table of tables) {
          if (data[table]) {
            db.prepare(`DELETE FROM ${table}`).run();
            if (data[table].length > 0) {
              const columns = Object.keys(data[table][0]);
              const placeholders = columns.map(() => '?').join(',');
              const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
              for (const row of data[table]) {
                const values = columns.map(col => row[col]);
                stmt.run(values);
              }
            }
          }
        }
      });
      transaction(backupData);
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }

    // Apenas após o sucesso atômico do banco de dados, prosseguimos para copiar os arquivos de mídia.
    // Isso previne que arquivos antigos sejam perdidos se o banco falhar.
    if (fs.existsSync(tempUploads)) {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const files = fs.readdirSync(tempUploads);
      for (const file of files) {
        fs.copyFileSync(path.join(tempUploads, file), path.join(uploadsDir, file));
      }
    }

  } finally {
    // Restaura o nome original para que o caller possa deletar/gerenciar o arquivo corretamente
    if (needsRename && fs.existsSync(actualZipPath)) {
      try {
        fs.renameSync(actualZipPath, zipFilePath);
      } catch (e) {
        console.error('[RESTORE] Erro ao restaurar nome do arquivo original:', e);
      }
    }
    // Limpeza da extração
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

async function limparBackupsAntigos(backupDir: string, diasReter: number) {
  try {
    if (!fs.existsSync(backupDir)) return;
    const agora = Date.now();
    const arquivos = fs.readdirSync(backupDir);
    for (const arquivo of arquivos) {
      if (!arquivo.startsWith('backup_') || !arquivo.endsWith('.zip')) continue;
      const filePath = path.join(backupDir, arquivo);
      const stats = fs.statSync(filePath);
      const idadeDias = (agora - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (idadeDias > diasReter) {
        fs.unlinkSync(filePath);
        console.log(`[BACKUP] 🗑️ Backup antigo removido (${Math.floor(idadeDias)} dias): ${arquivo}`);
      }
    }
  } catch (e) {
    console.error('[BACKUP] ⚠️ Erro ao limpar backups antigos:', e);
  }
}

export function broadcastEvent(event: string, data: any) {
  const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
  
  // Envia para os clientes SSE globais
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      console.error('[SSE] Erro ao enviar evento para cliente global:', e);
    }
  });

  // Envia para os telões específicos
  Object.keys(telaoSseClients).forEach(code => {
    telaoSseClients[code].forEach(client => {
      try {
        client.write(payload);
      } catch (e) {
        console.error(`[SSE] Erro ao enviar evento para telão ${code}:`, e);
      }
    });
  });
}

let udpSocket: dgram.Socket | null = null;
let udpBroadcastInterval: NodeJS.Timeout | null = null;

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
          return net.address;
        }
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function startUdpBroadcast() {
  try {
    if (udpSocket) {
      try { udpSocket.close(); } catch(e) {}
      udpSocket = null;
    }
    if (udpBroadcastInterval) {
      clearInterval(udpBroadcastInterval);
      udpBroadcastInterval = null;
    }

    udpSocket = dgram.createSocket('udp4');
    udpSocket.bind(() => {
      if (udpSocket) {
        try {
          udpSocket.setBroadcast(true);
          console.log('[UDP] Socket de broadcast habilitado.');
        } catch (e) {
          console.error('[UDP] Erro ao habilitar setBroadcast:', e);
        }
      }
    });

    // Envia o primeiro anúncio imediatamente
    setTimeout(() => {
      enviarAnuncio();
    }, 500);

    udpBroadcastInterval = setInterval(enviarAnuncio, 5000);
  } catch (err) {
    console.error('[UDP] Falha ao iniciar broadcast:', err);
  }
}

function enviarAnuncio() {
  try {
    const localIp = getLocalIp();
    const anuncio = {
      tipo: 'CHAMAAI_SERVIDOR',
      ip: localIp,
      porta: 3001,
      nome: 'ChamaAi'
    };
    const mensagem = Buffer.from(JSON.stringify(anuncio));
    if (udpSocket) {
      udpSocket.send(mensagem, 0, mensagem.length, 41234, '255.255.255.255', (err) => {
        if (err) {
          console.error('[UDP] Erro no envio do broadcast:', err);
        }
      });
    }
  } catch (err) {
    console.error('[UDP] Erro na serialização/envio do broadcast:', err);
  }
}
let serverInstance: any = null;
const serverSockets = new Set<any>();
let toledoWatcherCleanup: (() => void) | null | undefined = null;

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    console.log('[SERVER] Iniciando desligamento gracioso...');
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (udpBroadcastInterval) {
      clearInterval(udpBroadcastInterval);
      udpBroadcastInterval = null;
    }

    if (udpSocket) {
      try {
        udpSocket.close();
        console.log('[UDP] Socket de broadcast UDP encerrado.');
      } catch (e) {
        console.error('Erro ao fechar socket UDP:', e);
      }
      udpSocket = null;
    }
    
    // Fechar todas as conexões SSE ativas
    if (sseClients && sseClients.length > 0) {
      console.log(`[SERVER] Fechando ${sseClients.length} conexões SSE ativas...`);
      sseClients.forEach(client => {
        try {
          client.end();
        } catch (e) {
          console.error('Erro ao fechar conexão SSE:', e);
        }
      });
      sseClients = [];
    }

    for (const code of Object.keys(telaoSseClients)) {
      for (const client of telaoSseClients[code]) {
        try {
          client.end();
        } catch (e) {
          console.error(`[SERVER] Erro ao fechar SSE do telão ${code}:`, e);
        }
      }
      delete telaoSseClients[code];
    }

    // Fechar todos os sockets HTTP/TCP ativos
    if (serverSockets.size > 0) {
      console.log(`[SERVER] Destruindo ${serverSockets.size} sockets ativos...`);
      for (const socket of serverSockets) {
        try {
          socket.destroy();
        } catch (e) {
          console.error('Erro ao destruir socket:', e);
        }
      }
      serverSockets.clear();
    }

    if (toledoWatcherCleanup) {
      try {
        toledoWatcherCleanup();
        toledoWatcherCleanup = null;
      } catch(e) {
        console.error('Erro ao parar Toledo watcher', e);
      }
    }

    try {
      stopSupabaseCommandListener();
    } catch(e) {
      console.error('Erro ao parar Supabase listener', e);
    }

    try {
      stopSyncWorker();
    } catch(e) {
      console.error('Erro ao parar Sync worker', e);
    }

    try {
      stopCloudCommandsCron();
    } catch(e) {
      console.error('Erro ao parar Commands cron', e);
    }

    try {
      stopVignetteScheduler();
    } catch(e) {
      console.error('Erro ao parar agendador de vinhetas', e);
    }
    try {
      const db = getDb();
      if (db) db.close();
      console.log('[SERVER] SQLite fechado.');
    } catch(e) {
      console.error('Erro ao fechar DB', e);
    }

    if (serverInstance) {
      serverInstance.close(() => {
        console.log('[SERVER] Servidor HTTP Express encerrado.');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
