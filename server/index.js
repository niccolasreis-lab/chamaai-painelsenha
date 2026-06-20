"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loopbackToken = void 0;
exports.startServer = startServer;
exports.broadcastEvent = broadcastEvent;
exports.stopServer = stopServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const dgram_1 = __importDefault(require("dgram"));
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../electron/services/database");
const toledo_watcher_1 = require("./toledo-watcher");
const supabase_sync_1 = require("./supabase-sync");
const categorizador_1 = require("./categorizador");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const media_indoor_1 = require("./media-indoor");
const app = (0, express_1.default)();
app.set('trust proxy', true);
exports.loopbackToken = crypto_1.default.randomBytes(32).toString('hex');
(0, supabase_sync_1.setLoopbackToken)(exports.loopbackToken);
// --- MASTER REMOTO: Rate Limiting (Anti-Brute Force) ---
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
function hashPassword(password, salt) {
    const usedSalt = salt || crypto_1.default.randomBytes(32).toString('hex');
    const derivedKey = crypto_1.default.scryptSync(password, usedSalt, 64);
    return { hash: derivedKey.toString('hex'), salt: usedSalt };
}
function verifyPassword(password, storedHash, storedSalt) {
    const { hash } = hashPassword(password, storedSalt);
    return crypto_1.default.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}
function hashOperatorPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const derivedKey = crypto_1.default.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}
function verifyOperatorPassword(password, storedValue) {
    if (!storedValue)
        return false;
    if (!storedValue.startsWith('scrypt$')) {
        return password === storedValue;
    }
    const parts = storedValue.split('$');
    if (parts.length !== 3)
        return false;
    const salt = parts[1];
    const storedHash = parts[2];
    const derivedKey = crypto_1.default.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, 'hex');
    if (derivedKey.length !== storedBuffer.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(derivedKey, storedBuffer);
}
function verifyUserPassword(password, storedValue) {
    try {
        if (!storedValue)
            return false;
        // If it's scrypt (used by legacy operators)
        if (storedValue.startsWith('scrypt$')) {
            const parts = storedValue.split('$');
            if (parts.length !== 3)
                return false;
            const salt = parts[1];
            const storedHash = parts[2];
            const derivedKey = crypto_1.default.scryptSync(password, salt, 64);
            const storedBuffer = Buffer.from(storedHash, 'hex');
            if (derivedKey.length !== storedBuffer.length) {
                return false;
            }
            return crypto_1.default.timingSafeEqual(derivedKey, storedBuffer);
        }
        // If it's plaintext (some legacy setups)
        if (!storedValue.startsWith('$2b$') && !storedValue.startsWith('$2a$')) {
            const aBuf = Buffer.from(password);
            const bBuf = Buffer.from(storedValue);
            if (aBuf.length !== bBuf.length) {
                crypto_1.default.timingSafeEqual(aBuf, aBuf);
                return false;
            }
            return crypto_1.default.timingSafeEqual(aBuf, bBuf);
        }
        // Otherwise, it's bcrypt
        return bcryptjs_1.default.compareSync(password, storedValue);
    }
    catch (e) {
        return false;
    }
}
function isRateLimited(ip) {
    const record = loginAttempts.get(ip);
    if (!record)
        return false;
    if (Date.now() < record.blockedUntil)
        return true;
    if (Date.now() >= record.blockedUntil && record.count >= MAX_LOGIN_ATTEMPTS) {
        loginAttempts.delete(ip);
        return false;
    }
    return false;
}
function recordFailedAttempt(ip) {
    const record = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    record.count++;
    if (record.count >= MAX_LOGIN_ATTEMPTS) {
        record.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    }
    loginAttempts.set(ip, record);
}
function clearFailedAttempts(ip) {
    loginAttempts.delete(ip);
}
// --- MASTER SERVER DETECTION (cache com TTL de 30s) ---
let cachedLocalIPs = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 segundos
function getLocalIPs() {
    const now = Date.now();
    if (cachedLocalIPs && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedLocalIPs;
    }
    const ips = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
    const interfaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
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
function isRequestLocal(req) {
    const localIPs = getLocalIPs();
    const clientIP = req.ip || req.socket.remoteAddress || '';
    return localIPs.has(clientIP);
}
function isLoopback(req) {
    const clientIP = req.ip || req.socket.remoteAddress || '';
    return clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
}
// Middleware: injeta header X-Is-Master em todas as respostas
function injectMasterHeader(req, res, next) {
    let isMaster = isRequestLocal(req);
    // Also check remote token
    if (!isMaster) {
        const token = req.headers['x-master-token'];
        if (token) {
            try {
                const db = (0, database_1.getDb)();
                const session = db.prepare("SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')").get(token);
                if (session)
                    isMaster = true;
            }
            catch (err) { }
        }
    }
    // Check if master password exists
    let hasMasterPassword = false;
    try {
        const db = (0, database_1.getDb)();
        const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get();
        hasMasterPassword = !!(row && row.valor);
    }
    catch (err) { }
    res.setHeader('X-Is-Master', isMaster ? 'true' : 'false');
    res.setHeader('X-Has-Master-Password', hasMasterPassword ? 'true' : 'false');
    next();
}
// Middleware guard: bloqueia escrita administrativa de clientes remotos
function requireMaster(req, res, next) {
    // Acesso local sempre permitido
    if (isRequestLocal(req))
        return next();
    // Verifica token remoto
    const token = req.headers['x-master-token'];
    if (token) {
        try {
            const db = (0, database_1.getDb)();
            const session = db.prepare("SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')").get(token);
            if (session)
                return next();
        }
        catch (err) {
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
function requireAuth(req, res, next) {
    // Se já foi autenticado pelo JWT no remoteAuthMiddleware, permite e define o operador_id
    if (req.user) {
        req.operador_id = req.user.id;
        return next();
    }
    // Loopback authentication bypass using unique token
    const loopbackHeader = req.headers['x-loopback-token'];
    if (loopbackHeader && loopbackHeader === exports.loopbackToken) {
        req.operador_id = 1; // default to admin id
        return next();
    }
    // Se for master local e não exigir auth, permite
    if (isRequestLocal(req)) {
        try {
            const db = (0, database_1.getDb)();
            const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'acesso_local_exige_auth'").get();
            if (!row || row.valor !== '1') {
                return next();
            }
        }
        catch (err) { }
    }
    const token = req.headers['x-operator-token'];
    if (!token) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }
    try {
        const db = (0, database_1.getDb)();
        const session = db.prepare("SELECT * FROM sessoes_operador WHERE token = ? AND expira_em > datetime('now', 'localtime')").get(token);
        if (!session) {
            return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
        }
        // Opcional: estender o TTL da sessão aqui
        req.operador_id = session.operador_id;
        return next();
    }
    catch (err) {
        console.error('[AUTH] Erro ao validar token de operador:', err);
        return res.status(500).json({ error: 'Erro interno ao validar autenticação.' });
    }
}
let memoryFallbackSecret = null;
function getJwtSecret() {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }
    const db = (0, database_1.getDb)();
    try {
        const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'jwt_secret'").get();
        if (row && row.valor) {
            return row.valor;
        }
        else {
            const newSecret = crypto_1.default.randomBytes(32).toString('hex');
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('jwt_secret', ?)").run(newSecret);
            return newSecret;
        }
    }
    catch (err) {
        console.error('[AUTH] Erro ao obter JWT_SECRET do banco:', err);
        if (!memoryFallbackSecret) {
            memoryFallbackSecret = crypto_1.default.randomBytes(32).toString('hex');
        }
        return memoryFallbackSecret;
    }
}
function remoteAuthMiddleware(req, res, next) {
    const localNoLoginEnabled = process.env.LOCAL_APP_NO_LOGIN === 'true';
    const isLocal = isLoopback(req);
    const isElectron = typeof process !== 'undefined' && !!process.versions.electron;
    if (localNoLoginEnabled && isLocal && isElectron) {
        req.user = {
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
        const db = (0, database_1.getDb)();
        const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'auth_local_obrigatorio'").get();
        if (row && row.valor === '1') {
            authLocalObrigatorio = true;
        }
    }
    catch (e) { }
    if (isLoopbackVal && !authLocalObrigatorio) {
        return next();
    }
    // 2. Verificar se a rota é pública
    const reqPath = req.baseUrl ? req.baseUrl + req.path : req.path;
    const method = req.method;
    // Lista de rotas sempre públicas:
    if (reqPath === '/api/login' ||
        reqPath === '/api/logout' ||
        reqPath.startsWith('/api/telao/sse') ||
        reqPath.startsWith('/api/portal')) {
        return next();
    }
    // Ler dados do telão, fila, mídias e chamadas recentes, e criar senha (totem)
    if (method === 'GET' && (reqPath === '/api/configuracoes' ||
        reqPath === '/api/midias' ||
        reqPath === '/api/fila' ||
        reqPath === '/api/chamadas/recentes' ||
        reqPath === '/api/telao/init' ||
        reqPath.startsWith('/api/telao/profile/'))) {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.user = decoded;
        return next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Autenticação necessária' });
    }
}
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Is-Master', 'X-Has-Master-Password']
}));
app.use(injectMasterHeader);
app.use(express_1.default.json({ limit: '5mb' }));
app.use(express_1.default.urlencoded({ limit: '5mb', extended: true }));
app.use('/api', remoteAuthMiddleware);
let sseClients = [];
const telaoSseClients = {};
let heartbeatInterval = null;
function startServer() {
    const PORT = 3001;
    // Resolve o caminho para uma pasta local visível e fácil de gerenciar
    const userDataPath = 'C:\\ChamaAi';
    const UPLOADS_DIR = path_1.default.join(userDataPath, 'uploads');
    // Ensure uploads directory exists
    if (!fs_1.default.existsSync(UPLOADS_DIR)) {
        fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    // Configure Multer for local storage
    const storage = multer_1.default.diskStorage({
        destination: (req, file, cb) => {
            cb(null, UPLOADS_DIR);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
        }
    });
    const upload = (0, multer_1.default)({ storage });
    function reconcileMidias() {
        try {
            const db = (0, database_1.getDb)();
            // Only process media that aren't marked as deleted or failed
            const activeMidias = db.prepare("SELECT id, caminho, file_status FROM midias WHERE deleted_at IS NULL AND file_status != 'failed'").all();
            let missingCount = 0;
            for (const m of activeMidias) {
                const filePath = path_1.default.join(process.cwd(), m.caminho.replace(/^[\\/\\\\]/, ''));
                const exists = fs_1.default.existsSync(filePath);
                if (!exists && m.file_status !== 'missing') {
                    db.prepare("UPDATE midias SET file_status = 'missing' WHERE id = ?").run(m.id);
                    missingCount++;
                }
                else if (exists && m.file_status === 'missing') {
                    db.prepare("UPDATE midias SET file_status = 'active' WHERE id = ?").run(m.id);
                }
            }
            // Checking for orphan files in UPLOADS_DIR (that are not in DB)
            if (fs_1.default.existsSync(UPLOADS_DIR)) {
                const files = fs_1.default.readdirSync(UPLOADS_DIR);
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
        }
        catch (err) {
            console.error('[RECONCILE] Erro ao reconciliar mídias:', err);
        }
    }
    // Execute reconciliation on startup
    reconcileMidias();
    // Upload configurado especificamente para arquivos de backup grandes
    const backupUpload = (0, multer_1.default)({
        dest: path_1.default.join(process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi', 'Backups', '_temp'),
        limits: { fileSize: 500 * 1024 * 1024 } // Limite rígido de 500MB
    });
    // Serve static files from uploads folder with aggressive caching to avoid client media freezing
    app.use('/uploads', express_1.default.static(UPLOADS_DIR, {
        maxAge: 31536000000, // 1 year in milliseconds
        immutable: true,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));
    // Resolve o diretório de atualizações locais de forma dinâmica
    function getLocalUpdatesDir() {
        try {
            const db = (0, database_1.getDb)();
            const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'update_path'").get();
            if (row && row.valor) {
                return row.valor;
            }
        }
        catch (e) { }
        return 'C:\\ChamaAi_Atualizacoes';
    }
    // Serve compiled offline updates locally over HTTP to bypass file:// protocol download errors
    app.use('/local-updates', (req, res, next) => {
        const localUpdatesDir = getLocalUpdatesDir();
        if (req.path.endsWith('.exe') && req.path.includes('-')) {
            const spacePath = req.path.replace(/-/g, ' ');
            const fullPath = path_1.default.join(localUpdatesDir, spacePath.substring(1));
            if (fs_1.default.existsSync(fullPath)) {
                req.url = spacePath;
            }
        }
        next();
    });
    app.use('/local-updates', (req, res, next) => {
        const localUpdatesDir = getLocalUpdatesDir();
        if (!fs_1.default.existsSync(localUpdatesDir)) {
            try {
                fs_1.default.mkdirSync(localUpdatesDir, { recursive: true });
            }
            catch (e) { }
        }
        express_1.default.static(localUpdatesDir, {
            setHeaders: (res) => {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            }
        })(req, res, next);
    });
    // Serve frontend static files from dist folder
    const DIST_DIR = path_1.default.join(__dirname, '../../dist');
    if (fs_1.default.existsSync(DIST_DIR)) {
        console.log('[SERVER] Serving frontend from:', DIST_DIR);
        app.use(express_1.default.static(DIST_DIR));
    }
    // --- CRON JOBS ---
    // Roda todos os dias à meia-noite
    node_cron_1.default.schedule('0 0 * * *', () => {
        try {
            const db = (0, database_1.getDb)();
            const config = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'reset_diario_automatico'").get();
            if (config && config.valor === '1') {
                console.log('[CRON] Iniciando reset diário automático das senhas...');
                db.prepare("UPDATE balcoes SET contador_atual = 0").run();
                // Limpa a fila de espera para o novo dia
                db.prepare("DELETE FROM senhas WHERE status = 'aguardando'").run();
                const hoje = new Date().toISOString().split('T')[0];
                db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('ultimo_reset', ?, datetime('now'))").run(hoje);
                // Sync: limpa senhas na nuvem também
                (0, supabase_sync_1.syncLimparSenhas)();
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
        }
        catch (err) {
            console.error('[CRON] Erro ao resetar senhas:', err);
        }
        // --- BACKUP INTELIGENTE (Agendado com opt-in) ---
        try {
            executarBackupAgendado();
        }
        catch (err) {
            console.error('[CRON] ❌ Erro ao executar backup agendado:', err);
        }
        // ----------------------------------
        // --- EXPIRAÇÃO DE MÍDIAS ---
        try {
            const db = (0, database_1.getDb)();
            const info = db.prepare(`
        UPDATE midias 
        SET status = 'expirado' 
        WHERE data_expiracao IS NOT NULL AND status = 'ativo' AND data_expiracao < date('now')
      `).run();
            if (info.changes > 0) {
                console.log(`[CRON] ${info.changes} mídia(s) expiraram hoje.`);
                broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'expire' });
            }
        }
        catch (err) {
            console.error('[CRON] Erro ao expirar mídias:', err);
        }
        // ----------------------------------
    });
    // -----------------
    // Cron para agendamento de layouts de telão (roda a cada minuto)
    node_cron_1.default.schedule('* * * * *', () => {
        try {
            const db = (0, database_1.getDb)();
            // 1. Verificar se o agendamento está ativo
            const agendamentoAtivo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'telao_agendamento_ativo'").get();
            if (!agendamentoAtivo || agendamentoAtivo.valor !== '1')
                return;
            // 2. Buscar regras do agendamento
            const agendamentoRegrasRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'telao_agendamento_regras'").get();
            if (!agendamentoRegrasRow || !agendamentoRegrasRow.valor)
                return;
            let regras = [];
            try {
                regras = JSON.parse(agendamentoRegrasRow.valor);
            }
            catch (parseErr) {
                console.error('[CRON TELÃO] Erro ao analisar JSON de regras. Desativando agendamento...', parseErr);
                db.prepare("UPDATE configuracoes SET valor = '0', atualizado_em = datetime('now') WHERE chave = 'telao_agendamento_ativo'").run();
                broadcastEvent('CONFIG_ATUALIZADA', { telao_agendamento_ativo: '0' });
                return;
            }
            if (!Array.isArray(regras) || regras.length === 0)
                return;
            // 3. Pegar horário local do servidor no formato HH:MM
            const agora = new Date();
            const horaStr = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
            // 4. Encontrar regra para o horário atual
            const regraCorrespondente = regras.find(r => r.hora === horaStr);
            if (regraCorrespondente) {
                console.log(`[CRON TELÃO] Horário correspondente detectado (${horaStr}). Atualizando layouts para: ${regraCorrespondente.layout}`);
                // 5. Buscar todos os telões vinculados
                const teloesVinculados = db.prepare("SELECT code FROM teloes WHERE status = 'vinculado'").all();
                for (const device of teloesVinculados) {
                    db.prepare("UPDATE teloes SET template_layout = ? WHERE code = ?").run(regraCorrespondente.layout, device.code);
                    const perfil = db.prepare('SELECT * FROM teloes WHERE code = ?').get(device.code);
                    broadcastToTelao(device.code, 'TELAO_ATUALIZADO', perfil);
                }
            }
        }
        catch (err) {
            console.error('[CRON TELÃO] Erro crítico no cron de agendamento de telões:', err);
        }
    });
    // --- Admin Status Endpoint ---
    app.get('/api/admin/status', (req, res) => {
        const isMasterLocal = isRequestLocal(req);
        let isMasterRemote = false;
        let hasMasterPassword = false;
        // Check if remote token is valid
        const token = req.headers['x-master-token'];
        if (token) {
            try {
                const db = (0, database_1.getDb)();
                const session = db.prepare("SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')").get(token);
                if (session)
                    isMasterRemote = true;
            }
            catch (err) { }
        }
        // Check if master password has been configured
        try {
            const db = (0, database_1.getDb)();
            const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get();
            hasMasterPassword = !!(row && row.valor);
        }
        catch (err) { }
        let acessoLocalExigeAuth = false;
        try {
            const db = (0, database_1.getDb)();
            const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'acesso_local_exige_auth'").get();
            acessoLocalExigeAuth = row ? row.valor === '1' : false;
        }
        catch (err) { }
        let isNewInstall = false;
        try {
            const db = (0, database_1.getDb)();
            const adminUser = db.prepare("SELECT senha_hash, primeiro_acesso FROM operadores WHERE login = 'admin'").get();
            if (adminUser) {
                isNewInstall = adminUser.senha_hash === 'admin' || adminUser.primeiro_acesso === 1;
            }
        }
        catch (err) { }
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
            const db = (0, database_1.getDb)();
            // 1. Estatísticas gerais da fila
            const totalItems = db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get();
            // 2. Contagem por tabela
            const byTable = db.prepare('SELECT tabela, COUNT(*) as count FROM supabase_sync_queue GROUP BY tabela ORDER BY count DESC').all();
            // 3. Contagem por ação
            const byAction = db.prepare('SELECT acao, COUNT(*) as count FROM supabase_sync_queue GROUP BY acao ORDER BY count DESC').all();
            // 4. Itens que falharam (excederam max_tentativas)
            const failedItems = db.prepare('SELECT * FROM supabase_sync_queue WHERE tentativas >= max_tentativas ORDER BY id DESC LIMIT 10').all();
            // 5. Itens pendentes com tentativas (risco de falha)
            const retryItems = db.prepare('SELECT * FROM supabase_sync_queue WHERE tentativas > 0 AND tentativas < max_tentativas ORDER BY tentativas DESC LIMIT 10').all();
            // 6. Últimos 10 itens enfileirados (_fifo)
            const recentItems = db.prepare('SELECT * FROM supabase_sync_queue ORDER BY id DESC LIMIT 10').all();
            // 7. Idade do item mais antigo
            const oldestItem = db.prepare('SELECT id, tabela, acao, tentativas, criado_em FROM supabase_sync_queue ORDER BY id ASC LIMIT 1').get();
            // 8. Status de tentativas
            const attemptStats = db.prepare('SELECT tentativas, COUNT(*) as count FROM supabase_sync_queue GROUP BY tentativas ORDER BY tentativas ASC').all();
            res.json({
                isSupabaseConfigured: supabase_sync_1.isSupabaseConfigured,
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
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- DEBUG SYNC: Retry manual de itens falhos ---
    app.post('/api/debug-sync/retry', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const result = db.prepare('UPDATE supabase_sync_queue SET tentativas = 0 WHERE tentativas >= max_tentativas').run();
            res.json({
                message: `${result.changes} itens resetados para retry`,
                retriedCount: result.changes
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- DEBUG SYNC: Limpar fila inteira ---
    app.post('/api/debug-sync/clear', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const count = db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get();
            db.prepare('DELETE FROM supabase_sync_queue').run();
            res.json({
                message: `${count?.count || 0} itens removidos da fila`,
                clearedCount: count?.count || 0
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- DEBUG SYNC: Deletar item específico por ID ---
    app.delete('/api/debug-sync/:id', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
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
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- Endpoint for Dashboard Charts ---
    app.get('/api/dashboard/metricas', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
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
        }
        catch (err) {
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
            const db = (0, database_1.getDb)();
            const hashRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_hash'").get();
            const saltRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'master_remoto_salt'").get();
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
            const token = crypto_1.default.randomBytes(48).toString('hex');
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
            db.prepare("INSERT INTO tokens_remotos (token, ip_origem, expira_em) VALUES (?, ?, datetime('now', 'localtime', '+' || ? || ' hours'))").run(token, clientIP, TTL_HOURS);
            console.log(`[MASTER REMOTO] ✅ Sessão criada para IP: ${clientIP}`);
            res.json({ token, expiresInHours: TTL_HOURS });
        }
        catch (err) {
            console.error('[MASTER REMOTO] Erro na autenticação:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // --- MASTER REMOTO: Logout (Revogar Token) ---
    app.post('/api/admin/logout-master', (req, res) => {
        const token = req.headers['x-master-token'];
        if (!token)
            return res.status(400).json({ error: 'Token não informado.' });
        try {
            const db = (0, database_1.getDb)();
            db.prepare("DELETE FROM tokens_remotos WHERE token = ?").run(token);
            console.log(`[MASTER REMOTO] 🔒 Token revogado pelo IP: ${req.ip}`);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- MASTER REMOTO: Definir/Alterar Senha ---
    app.post('/api/admin/set-master-password', (req, res) => {
        // Apenas localhost OU portador de token válido pode definir/alterar senha
        const isLocal = isRequestLocal(req);
        const token = req.headers['x-master-token'];
        let isRemoteAuth = false;
        if (token) {
            try {
                const db = (0, database_1.getDb)();
                const session = db.prepare("SELECT * FROM tokens_remotos WHERE token = ? AND expira_em > datetime('now', 'localtime')").get(token);
                if (session)
                    isRemoteAuth = true;
            }
            catch (err) { }
        }
        if (!isLocal && !isRemoteAuth) {
            return res.status(403).json({ error: 'Apenas o servidor master ou uma sessão autenticada pode alterar a senha.' });
        }
        const { senha } = req.body;
        if (!senha || typeof senha !== 'string' || senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }
        try {
            const db = (0, database_1.getDb)();
            const { hash, salt } = hashPassword(senha);
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('master_remoto_hash', ?, datetime('now'))").run(hash);
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('master_remoto_salt', ?, datetime('now'))").run(salt);
            console.log(`[MASTER REMOTO] 🔐 Senha de acesso remoto ${isLocal ? 'definida' : 'alterada'} com sucesso.`);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/network-info', (req, res) => {
        const nets = os_1.default.networkInterfaces();
        const results = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
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
    function broadcastToTelao(code, event, data) {
        const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
        if (telaoSseClients[code]) {
            telaoSseClients[code].forEach(client => client.write(payload));
        }
    }
    app.get('/api/telao/init', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            db.prepare("INSERT INTO teloes (code, status) VALUES (?, 'pendente')").run(code);
            res.json({ code });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/telao/profile/:code', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const code = req.params.code.toUpperCase();
            const telao = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code);
            if (!telao)
                return res.status(404).json({ error: 'Telão não encontrado' });
            res.json(telao);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/telao/list', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const teloes = db.prepare('SELECT * FROM teloes ORDER BY criado_em DESC').all();
            res.json(teloes);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/telao/vincular', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { code, nome, modulo_painel, modulo_encarte, modulo_midia, encarte_categorias, template_layout } = req.body;
            const stmt = db.prepare(`
        UPDATE teloes 
        SET nome = ?, status = 'vinculado', modulo_painel = ?, modulo_encarte = ?, modulo_midia = ?, encarte_categorias = ?, template_layout = ?, vinculado_em = datetime('now')
        WHERE code = ?
      `);
            stmt.run(nome, modulo_painel ? 1 : 0, modulo_encarte ? 1 : 0, modulo_midia ? 1 : 0, encarte_categorias || '', template_layout || 'classic', code.toUpperCase());
            const perfil = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code.toUpperCase());
            broadcastToTelao(code.toUpperCase(), 'TELAO_VINCULADO', perfil);
            res.json({ success: true, perfil });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/telao/:code', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const code = req.params.code.toUpperCase();
            const { nome, modulo_painel, modulo_encarte, modulo_midia, encarte_categorias, template_layout } = req.body;
            const stmt = db.prepare(`
        UPDATE teloes 
        SET nome = ?, modulo_painel = ?, modulo_encarte = ?, modulo_midia = ?, encarte_categorias = ?, template_layout = ?
        WHERE code = ?
      `);
            stmt.run(nome, modulo_painel ? 1 : 0, modulo_encarte ? 1 : 0, modulo_midia ? 1 : 0, encarte_categorias || '', template_layout || 'classic', code);
            const perfil = db.prepare('SELECT * FROM teloes WHERE code = ?').get(code);
            broadcastToTelao(code, 'TELAO_ATUALIZADO', perfil);
            res.json({ success: true, perfil });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/telao/:code', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const code = req.params.code.toUpperCase();
            // Remove from DB so it's a completely clean state (the telao will request /init again if it reloads, or we just tell it to DESVINCULADO)
            db.prepare('DELETE FROM teloes WHERE code = ?').run(code);
            broadcastToTelao(code, 'TELAO_DESVINCULADO', { code });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/telao/:code/reiniciar', requireMaster, (req, res) => {
        const code = req.params.code.toUpperCase();
        broadcastToTelao(code, 'RECARREGAR_PAGINA', { reason: 'admin_command' });
        res.json({ success: true });
    });
    // -------------------------
    app.get('/api/senhas', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
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
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/chamadas/recentes', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const recent = db.prepare(`
        SELECT s.id, s.numero, s.preferencial, s.status, c.guiche, b.nome as balcao_nome, s.chamada_em
        FROM chamadas c
        JOIN senhas s ON c.senha_id = s.id
        JOIN balcoes b ON s.balcao_id = b.id
        ORDER BY c.id DESC
        LIMIT 5
      `).all();
            res.json(recent);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Fila de espera (apenas senhas aguardando, ordenadas por prioridade)
    app.get('/api/fila', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const fila = db.prepare(`SELECT * FROM senhas WHERE status = 'aguardando' ORDER BY preferencial DESC, id ASC`).all();
            res.json(fila);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/senhas/:id/status', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const senha = db.prepare('SELECT id, status, numero, preferencial FROM senhas WHERE id = ?').get(req.params.id);
            if (!senha) {
                return res.status(404).json({ error: 'Senha não encontrada' });
            }
            let posicao = null;
            if (senha.status === 'aguardando') {
                const ahead = db.prepare(`SELECT COUNT(*) as count FROM senhas 
           WHERE status = 'aguardando' 
             AND (
               (preferencial > ?) 
               OR 
               (preferencial = ? AND id < ?)
             )`).get(senha.preferencial, senha.preferencial, senha.id);
                posicao = (ahead?.count ?? 0) + 1;
            }
            res.json({ status: senha.status, numero: senha.numero, aguardando: senha.status === 'aguardando', posicao });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/senhas', (req, res) => {
        try {
            const { balcao_id, preferencial, nome_cliente } = req.body;
            const db = (0, database_1.getDb)();
            console.log('Emitindo senha para balcão:', balcao_id, 'Preferencial:', preferencial, 'Nome:', nome_cliente);
            const balcaoIdNum = Number(balcao_id);
            const emitirSenhaTx = db.transaction((balcaoId, isPreferencial, nomeCliente) => {
                // Increment counter with reset at 999
                db.prepare(`
          UPDATE balcoes 
          SET contador_atual = CASE 
            WHEN contador_atual >= 999 THEN 0 
            ELSE contador_atual + 1 
          END 
          WHERE id = ?
        `).run(balcaoId);
                const balcao = db.prepare('SELECT contador_atual FROM balcoes WHERE id = ?').get(balcaoId);
                if (!balcao)
                    throw new Error('Balcão não encontrado');
                const numero = (balcao.contador_atual !== undefined ? balcao.contador_atual : balcao.CONTADOR_ATUAL) ?? 0;
                const result = db.prepare('INSERT INTO senhas (balcao_id, numero, preferencial, status, nome_cliente) VALUES (?, ?, ?, ?, ?)')
                    .run(balcaoId, numero, isPreferencial, 'aguardando', nomeCliente);
                const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get();
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
                return {
                    id: result.lastInsertRowid,
                    numero,
                    aguardando_count: aguardandoCount.count,
                    geral: countGeral.count,
                    preferencial: countPref.count
                };
            });
            const txResult = emitirSenhaTx(balcaoIdNum, preferencial ? 1 : 0, nome_cliente || null);
            const novaSenha = {
                id: txResult.id,
                balcao_id: balcaoIdNum,
                numero: txResult.numero,
                preferencial: preferencial ? 1 : 0,
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
            }
            catch (errQueue) {
                console.error('Erro ao emitir queue-update:', errQueue);
            }
            // Sync: espelha a nova senha na nuvem para o Portal do Cliente
            (0, supabase_sync_1.syncNovaSenha)(novaSenha.id, txResult.numero, 'aguardando');
            res.status(201).json(novaSenha);
        }
        catch (err) {
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
            const db = (0, database_1.getDb)();
            const user = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login.trim());
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
            const token = jsonwebtoken_1.default.sign({ id: user.id, login: user.login, perfil: user.perfil }, secret, { expiresIn: '3650d' });
            // Registrar sessão em sessoes_operador para compatibilidade com requireAuth herdado
            try {
                db.prepare("DELETE FROM sessoes_operador WHERE expira_em <= datetime('now', 'localtime')").run();
                let opId = 1;
                const op = db.prepare('SELECT id FROM operadores WHERE login = ?').get(user.login);
                if (op)
                    opId = op.id;
                db.prepare("INSERT OR REPLACE INTO sessoes_operador (token, operador_id, expira_em) VALUES (?, ?, datetime('now', 'localtime', '+36500 days'))").run(token, opId);
            }
            catch (sessErr) {
                console.error('[AUTH] Erro ao gravar sessoes_operador:', sessErr);
            }
            return res.json({
                token,
                perfil: user.perfil,
                primeiro_acesso: user.primeiro_acesso
            });
        }
        catch (err) {
            console.error('[AUTH] Erro no endpoint /api/login:', err);
            return res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    });
    app.post('/api/logout', (req, res) => {
        return res.status(200).json({ success: true });
    });
    app.get('/api/auth/me', (req, res) => {
        const user = req.user;
        if (!user) {
            return res.json({ login: 'local_admin', perfil: 'admin', primeiro_acesso: 0 });
        }
        try {
            const db = (0, database_1.getDb)();
            const dbUser = db.prepare('SELECT login, perfil, primeiro_acesso FROM usuarios WHERE id = ?').get(user.id);
            if (dbUser) {
                return res.json({
                    login: dbUser.login,
                    perfil: dbUser.perfil,
                    primeiro_acesso: dbUser.primeiro_acesso
                });
            }
        }
        catch (e) { }
        return res.json({
            login: user.login,
            perfil: user.perfil,
            primeiro_acesso: 0
        });
    });
    app.put('/api/auth/senha', (req, res) => {
        try {
            const user = req.user;
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
            const db = (0, database_1.getDb)();
            const dbUser = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id);
            if (!dbUser) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            const match = verifyUserPassword(senha_atual, dbUser.senha_hash);
            if (!match) {
                return res.status(400).json({ error: 'Senha atual incorreta.' });
            }
            const hash = bcryptjs_1.default.hashSync(nova_senha, 10);
            db.prepare('UPDATE usuarios SET senha_hash = ?, primeiro_acesso = 0 WHERE id = ?').run(hash, user.id);
            return res.json({ success: true });
        }
        catch (err) {
            console.error('[AUTH] Erro ao alterar senha:', err);
            return res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    });
    app.get('/api/usuarios', (req, res) => {
        const user = req.user;
        if (user && user.perfil !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem acessar a segurança.' });
        }
        try {
            const db = (0, database_1.getDb)();
            const usuarios = db.prepare('SELECT id, login, perfil, primeiro_acesso, criado_em FROM usuarios').all();
            res.json(usuarios);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/usuarios', (req, res) => {
        const user = req.user;
        if (user && user.perfil !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem gerenciar usuários.' });
        }
        try {
            const { login, senha, perfil } = req.body;
            if (!login || !senha) {
                return res.status(400).json({ error: 'Login e senha são obrigatórios.' });
            }
            const db = (0, database_1.getDb)();
            const hash = bcryptjs_1.default.hashSync(senha, 10);
            db.prepare('INSERT INTO usuarios (login, senha_hash, perfil, primeiro_acesso) VALUES (?, ?, ?, 1)')
                .run(login.trim(), hash, perfil || 'operador');
            res.json({ success: true });
        }
        catch (err) {
            if (err.message && err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Este login já está cadastrado.' });
            }
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/usuarios/redefinir', (req, res) => {
        const user = req.user;
        if (user && user.perfil !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem redefinir senhas.' });
        }
        try {
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
            }
            const db = (0, database_1.getDb)();
            const tempPassword = Math.random().toString(36).substring(2, 10);
            const hash = bcryptjs_1.default.hashSync(tempPassword, 10);
            db.prepare('UPDATE usuarios SET senha_hash = ?, primeiro_acesso = 1 WHERE id = ?').run(hash, id);
            res.json({ success: true, senha_temporaria: tempPassword });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/usuarios/:id', (req, res) => {
        const user = req.user;
        if (user && user.perfil !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem remover usuários.' });
        }
        try {
            const { id } = req.params;
            if (user && String(user.id) === String(id)) {
                return res.status(400).json({ error: 'Você não pode remover o próprio usuário logado.' });
            }
            const db = (0, database_1.getDb)();
            db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/operadores', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const operadores = db.prepare('SELECT id, nome, login, perfil, ativo, primeiro_acesso FROM operadores').all();
            res.json(operadores);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/operadores', requireMaster, (req, res) => {
        try {
            const { nome, login, senha, perfil } = req.body;
            const db = (0, database_1.getDb)();
            const hashed = hashOperatorPassword(senha);
            const stmt = db.prepare('INSERT INTO operadores (nome, login, senha_hash, perfil, ativo, primeiro_acesso) VALUES (?, ?, ?, ?, 1, 0)');
            const result = stmt.run(nome, login, hashed, perfil || 'operador');
            res.status(201).json({ id: result.lastInsertRowid, nome, login, perfil });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/operadores/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const { nome, login, senha, perfil, ativo } = req.body;
            const db = (0, database_1.getDb)();
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
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/operadores/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const db = (0, database_1.getDb)();
            if (id === '1')
                return res.status(400).json({ error: 'Admin padrão não pode ser removido' });
            db.prepare('DELETE FROM operadores WHERE id = ?').run(id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // BALCOES ROUTES
    app.get('/api/balcoes', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const balcoes = db.prepare('SELECT * FROM balcoes WHERE ativo = 1').all();
            res.json(balcoes);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/balcoes', requireMaster, (req, res) => {
        try {
            const { nome, prefixo_senha } = req.body;
            const db = (0, database_1.getDb)();
            const stmt = db.prepare('INSERT INTO balcoes (nome, prefixo_senha, ativo) VALUES (?, ?, 1)');
            const result = stmt.run(nome, prefixo_senha || '');
            res.status(201).json({ id: result.lastInsertRowid, nome });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/balcoes/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const db = (0, database_1.getDb)();
            if (id === '1')
                return res.status(400).json({ error: 'Balcão padrão não pode ser removido' });
            db.prepare('UPDATE balcoes SET ativo = 0 WHERE id = ?').run(id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- ANDROID OPERATOR TOUCH ENDPOINTS & BROADCASTS ---
    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });
    app.post('/api/operador/proximo', (req, res) => {
        try {
            const { guiche } = req.body;
            const db = (0, database_1.getDb)();
            console.log(`[Operador Touch - Proximo] guiche=${guiche}`);
            const proximoTouchTx = db.transaction((guicheStr) => {
                // 0. Auto-finalize previous called ticket of this guichê
                const activeCalled = db.prepare(`
          SELECT s.id 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC LIMIT 1
        `).get(`Guichê ${guicheStr}`);
                if (activeCalled) {
                    db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(activeCalled.id);
                }
                // 1. Busca a próxima senha (preferencial primeiro, depois por ordem de chegada)
                const proxima = db.prepare(`SELECT s.*, b.nome as balcao_nome, b.prefixo_senha 
           FROM senhas s 
           JOIN balcoes b ON s.balcao_id = b.id 
           WHERE s.status = 'aguardando' 
           ORDER BY s.preferencial DESC, s.id ASC 
           LIMIT 1`).get();
                if (!proxima) {
                    return {
                        proxima: null,
                        geral: 0,
                        preferencial: 0,
                        autoAttendedId: activeCalled?.id
                    };
                }
                // 2. Marca como chamada
                db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?").run(proxima.id);
                // 3. Registra a chamada (operador_id = 1 como padrão)
                db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, 1, ?)').run(proxima.id, `Guichê ${guicheStr}`);
                // 4. Counts for queue-update
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
                return {
                    proxima,
                    geral: countGeral.count,
                    preferencial: countPref.count,
                    autoAttendedId: activeCalled?.id
                };
            });
            const txResult = proximoTouchTx(guiche);
            if (txResult.autoAttendedId) {
                (0, supabase_sync_1.syncStatusSenha)(txResult.autoAttendedId, 'atendida');
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
            (0, supabase_sync_1.syncStatusSenha)(proxima.id, 'chamada', `Guichê ${guiche}`);
            res.json({ success: true, data: ticketPayload });
        }
        catch (err) {
            console.error('[Operador Touch - Proximo] ERRO:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/operador/repetir', (req, res) => {
        try {
            const { guiche } = req.body;
            const db = (0, database_1.getDb)();
            console.log(`[Operador Touch - Repetir] guiche=${guiche}`);
            // Busca a última chamada deste guichê
            const ultimaChamada = db.prepare(`
        SELECT s.*, c.guiche 
        FROM chamadas c
        JOIN senhas s ON c.senha_id = s.id
        WHERE c.guiche = ?
        ORDER BY c.id DESC
        LIMIT 1
      `).get(`Guichê ${guiche}`);
            if (!ultimaChamada) {
                return res.status(404).json({ error: 'Nenhuma senha chamada anteriormente neste guichê.' });
            }
            // Atualiza o timestamp da senha e registra uma nova chamada
            db.prepare("UPDATE senhas SET chamada_em = datetime('now') WHERE id = ?").run(ultimaChamada.id);
            db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, 1, ?)').run(ultimaChamada.id, `Guichê ${guiche}`);
            const formattedNumero = `${ultimaChamada.preferencial ? 'P' : 'A'}-${String(ultimaChamada.numero).padStart(3, '0')}`;
            const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
            const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
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
            (0, supabase_sync_1.syncStatusSenha)(ultimaChamada.id, 'chamada', `Guichê ${guiche}`);
            res.json({ success: true, data: ticketPayload });
        }
        catch (err) {
            console.error('[Operador Touch - Repetir] ERRO:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/operador/devolver', requireAuth, (req, res) => {
        try {
            const { guiche } = req.body;
            const db = (0, database_1.getDb)();
            console.log(`[Operador Touch - Devolver] guiche=${guiche}`);
            const devolverTouchTx = db.transaction((guicheStr) => {
                // Busca a senha atualmente em atendimento (status 'chamada') neste guichê
                const ultimaChamada = db.prepare(`
          SELECT s.* 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC
          LIMIT 1
        `).get(`Guichê ${guicheStr}`);
                if (!ultimaChamada)
                    return null;
                // Atualiza a senha para 'aguardando' e remove a chamada_em
                db.prepare("UPDATE senhas SET status = 'aguardando', chamada_em = NULL WHERE id = ?").run(ultimaChamada.id);
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
                return {
                    ultimaChamada,
                    geral: countGeral.count,
                    preferencial: countPref.count
                };
            });
            const txResult = devolverTouchTx(guiche);
            if (!txResult) {
                return res.status(404).json({ error: 'Nenhuma senha em atendimento encontrada para este guichê.' });
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
            (0, supabase_sync_1.syncStatusSenha)(ultimaChamada.id, 'aguardando');
            res.json({ success: true });
        }
        catch (err) {
            console.error('[Operador Touch - Devolver] ERRO:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/chamar-proxima', requireAuth, (req, res) => {
        try {
            const { operador_id, guiche } = req.body;
            const db = (0, database_1.getDb)();
            console.log(`[ChamarProxima] operador=${operador_id} guiche=${guiche}`);
            const chamarProximaTx = db.transaction((operadorIdVal, guicheStr) => {
                // 0. Auto-finalize previous called ticket of this guichê
                const activeCalled = db.prepare(`
          SELECT s.id 
          FROM chamadas c
          JOIN senhas s ON c.senha_id = s.id
          WHERE c.guiche = ? AND s.status = 'chamada'
          ORDER BY c.id DESC LIMIT 1
        `).get(guicheStr);
                if (activeCalled) {
                    db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(activeCalled.id);
                }
                // 1. Busca a próxima senha DIRETO DO BANCO (preferencial primeiro, depois por ordem de chegada)
                const proxima = db.prepare(`SELECT s.*, b.nome as balcao_nome 
           FROM senhas s 
           JOIN balcoes b ON s.balcao_id = b.id 
           WHERE s.status = 'aguardando' 
           ORDER BY s.preferencial DESC, s.id ASC 
           LIMIT 1`).get();
                if (!proxima)
                    return {
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
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
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
                (0, supabase_sync_1.syncStatusSenha)(autoAttendedId, 'atendida');
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
            }
            catch (errBroad) {
                console.error('Erro ao enviar ticket-called/queue-update secundário:', errBroad);
            }
            // Sync: atualiza status na nuvem (Portal do Cliente verá que a vez chegou)
            (0, supabase_sync_1.syncStatusSenha)(proxima.id, 'chamada', guiche);
            console.log(`[ChamarProxima] Senha ${proxima.numero} chamada com sucesso para ${guiche}`);
            res.json({ success: true, data: payload });
        }
        catch (err) {
            console.error('[ChamarProxima] ERRO:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    // Rota existente mantida para REPETIR chamada (quando já se sabe o ID da senha)
    app.post('/api/chamadas', requireAuth, (req, res) => {
        try {
            const { senha_id, operador_id, guiche } = req.body;
            const db = (0, database_1.getDb)();
            console.log(`[Chamada] senha_id=${senha_id} operador=${operador_id} guiche=${guiche}`);
            const repetirChamadaTx = db.transaction((senhaIdVal, operadorIdVal, guicheStr) => {
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
        `).get(senhaIdVal);
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
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
            }
            catch (errBroad) {
                console.error('Erro ao enviar ticket-called secundário:', errBroad);
            }
            // Sync: atualiza status na nuvem
            (0, supabase_sync_1.syncStatusSenha)(senha_id, 'chamada', guiche);
            console.log('[Chamada] Broadcast enviado com sucesso');
            res.json({ success: true, data: payload });
        }
        catch (err) {
            console.error('[Chamada] ERRO:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/senhas/estornar', requireAuth, (req, res) => {
        try {
            const { senha_id } = req.body;
            const db = (0, database_1.getDb)();
            const estornarTx = db.transaction((senhaIdVal) => {
                db.prepare("UPDATE senhas SET status = 'aguardando', chamada_em = NULL WHERE id = ?").run(senhaIdVal);
                const countGeral = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 0").get();
                const countPref = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando' AND preferencial = 1").get();
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
            }
            catch (errBroad) {
                console.error('Erro ao enviar queue-update secundário:', errBroad);
            }
            // Sync: volta status na nuvem
            (0, supabase_sync_1.syncStatusSenha)(senha_id, 'aguardando');
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/senhas/concluir', (req, res) => {
        try {
            const { senha_id, guiche } = req.body;
            const db = (0, database_1.getDb)();
            db.prepare("UPDATE senhas SET status = 'atendida', atendida_em = datetime('now') WHERE id = ?").run(senha_id);
            // Notifica todos os painéis
            broadcastEvent('SENHA_ATENDIDA', { id: senha_id });
            // Sincroniza estado para operadores touch
            if (guiche) {
                broadcastEvent('ticket-called', { id: null, numero: null, preferencial: null, guiche });
            }
            (0, supabase_sync_1.syncStatusSenha)(senha_id, 'atendida');
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/senhas/cancelar', (req, res) => {
        try {
            const { senha_id, guiche } = req.body;
            const db = (0, database_1.getDb)();
            db.prepare("UPDATE senhas SET status = 'cancelada', atendida_em = datetime('now') WHERE id = ?").run(senha_id);
            // Notifica todos os painéis
            broadcastEvent('SENHA_CANCELADA', { id: senha_id });
            // Sincroniza estado para operadores touch
            if (guiche) {
                broadcastEvent('ticket-called', { id: null, numero: null, preferencial: null, guiche });
            }
            (0, supabase_sync_1.syncStatusSenha)(senha_id, 'cancelada');
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/midias', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            // HARD FIX DE SEGURANÇA: sempre filtrar WHERE deleted_at IS NULL e file_status != 'missing'
            const midias = db.prepare("SELECT * FROM midias WHERE deleted_at IS NULL AND file_status != 'missing' ORDER BY ordem ASC, id DESC").all();
            res.json(midias);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/midias', requireMaster, upload.single('file'), (req, res) => {
        try {
            if (!req.file) {
                console.error('Upload failed: No file provided');
                return res.status(400).json({ error: 'Nenhum arquivo enviado' });
            }
            const db = (0, database_1.getDb)();
            const { nome, tipo, ordem } = req.body;
            const caminho = `/uploads/${req.file.filename}`;
            console.log('Inserting media into DB:', { nome, caminho });
            const stmt = db.prepare("INSERT INTO midias (nome, caminho, tipo, ordem, ativo, file_status) VALUES (?, ?, ?, ?, 1, 'active')");
            const result = stmt.run(nome || req.file.originalname, caminho, tipo || (req.file.mimetype.startsWith('video') ? 'video' : 'imagem'), ordem || 0);
            reconcileMidias();
            broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'upload' });
            res.status(201).json({
                id: result.lastInsertRowid,
                nome: nome || req.file.originalname,
                caminho,
                tipo: tipo || (req.file.mimetype.startsWith('video') ? 'video' : 'imagem'),
                ordem: ordem || 0,
                ativo: 1
            });
        }
        catch (err) {
            console.error('Error in POST /api/midias:', err);
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/midias/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const db = (0, database_1.getDb)();
            // Soft delete imediatamente para garantir que saia do telão mesmo se a deleção do arquivo falhar
            try {
                db.prepare("UPDATE midias SET deleted_at = datetime('now', 'localtime') WHERE id = ?").run(id);
            }
            catch (e) {
                // Ignora erro caso a coluna não exista (o db.exec de alter table cuidará disso)
            }
            // Tenta remover o arquivo físico
            const midia = db.prepare('SELECT caminho FROM midias WHERE id = ?').get(id);
            if (midia) {
                const filePath = path_1.default.join(process.cwd(), midia.caminho.replace(/^[\\/\\\\]/, ''));
                console.log('Deleting file:', filePath);
                try {
                    if (fs_1.default.existsSync(filePath)) {
                        fs_1.default.unlinkSync(filePath);
                    }
                }
                catch (fileErr) {
                    console.error('Erro ao deletar arquivo físico (pode estar em uso):', fileErr);
                    try {
                        db.prepare("UPDATE midias SET file_status = 'failed' WHERE id = ?").run(id);
                    }
                    catch (e) { }
                }
            }
            reconcileMidias();
            broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'delete' });
            res.json({ success: true });
        }
        catch (err) {
            console.error('Error in DELETE /api/midias:', err);
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/midias/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const { ativo, data_expiracao, status } = req.body;
            const db = (0, database_1.getDb)();
            db.prepare(`
        UPDATE midias 
        SET ativo = COALESCE(?, ativo), 
            data_expiracao = COALESCE(?, data_expiracao),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(ativo, data_expiracao, status, id);
            broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'update' });
            res.json({ success: true });
        }
        catch (err) {
            console.error('Error in PUT /api/midias:', err);
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/configuracoes', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
            const config = rows.reduce((acc, row) => {
                acc[row.chave] = row.valor;
                return acc;
            }, {});
            res.json(config);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/configuracoes', requireMaster, async (req, res) => {
        try {
            const configuracoes = req.body;
            const db = (0, database_1.getDb)();
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
            const transaction = db.transaction((configs) => {
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
            if (configuracoes.nome_estabelecimento)
                (0, supabase_sync_1.syncConfiguracaoPublica)('nome_estabelecimento', configuracoes.nome_estabelecimento);
            if (configuracoes.portal_voz_alerta)
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_voz_alerta', configuracoes.portal_voz_alerta);
            if (configuracoes.portal_som_sua_vez !== undefined)
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_som_sua_vez', configuracoes.portal_som_sua_vez);
            if (configuracoes.portal_som_prestes_chamar !== undefined)
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_som_prestes_chamar', configuracoes.portal_som_prestes_chamar);
            if (configuracoes.toledo_encarte_ativo !== undefined)
                (0, supabase_sync_1.syncConfiguracaoPublica)('toledo_encarte_ativo', String(configuracoes.toledo_encarte_ativo));
            if (configuracoes.toledo_ocultar_em_falta !== undefined)
                (0, supabase_sync_1.syncConfiguracaoPublica)('toledo_ocultar_em_falta', String(configuracoes.toledo_ocultar_em_falta));
            if (configuracoes.telao_ticker_texto !== undefined)
                (0, supabase_sync_1.syncConfiguracaoPublica)('telao_ticker_texto', String(configuracoes.telao_ticker_texto));
            if (configuracoes.cor_primaria !== undefined && supabase_sync_1.isSupabaseConfigured) {
                const novaCor = configuracoes.cor_primaria;
                try {
                    const { error } = await supabase_sync_1.supabase
                        .from('configuracoes_publicas')
                        .upsert({ chave: 'cor_primaria', valor: novaCor, updated_at: new Date().toISOString() });
                    if (error)
                        throw error;
                    db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '0', datetime('now'))`).run();
                }
                catch (err) {
                    db.prepare(`INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '1', datetime('now'))`).run();
                    console.warn('[Sync] Supabase offline — cor_primaria marcada como pendente de sincronização.');
                }
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error('Error saving configs:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // LOGO UPLOAD
    app.post('/api/configuracoes/logo', requireMaster, upload.single('logo'), (req, res) => {
        try {
            if (!req.file)
                return res.status(400).json({ error: 'Nenhum logo enviado' });
            const db = (0, database_1.getDb)();
            const logoPath = `/uploads/${req.file.filename}`;
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
                .run('logo_cliente', logoPath);
            broadcastEvent('CONFIG_ATUALIZADA', { logo_cliente: logoPath });
            // Converter imagem pra base64 e enviar pro portal do cliente no Supabase
            try {
                const filePath = path_1.default.join(process.cwd(), req.file.path);
                const base64 = fs_1.default.readFileSync(filePath, 'base64');
                const mimeType = req.file.mimetype;
                const dataUrl = `data:${mimeType};base64,${base64}`;
                (0, supabase_sync_1.syncConfiguracaoPublica)('logo_cliente_base64', dataUrl);
            }
            catch (e) {
                console.error('Erro ao syncar logo em base64', e);
            }
            res.json({ success: true, logoPath });
        }
        catch (err) {
            console.error('Error uploading logo:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // ARTE TELAO UPLOAD
    app.post('/api/configuracoes/telao-arte', requireMaster, upload.single('arte'), (req, res) => {
        try {
            if (!req.file)
                return res.status(400).json({ error: 'Nenhuma arte enviada' });
            const db = (0, database_1.getDb)();
            const artePath = `/uploads/${req.file.filename}`;
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
                .run('telao_arte_espera', artePath);
            broadcastEvent('CONFIG_ATUALIZADA', { telao_arte_espera: artePath });
            res.json({ success: true, artePath });
        }
        catch (err) {
            console.error('Error uploading telão arte:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // SOM UPLOAD
    app.post('/api/configuracoes/som', requireMaster, upload.single('som'), (req, res) => {
        try {
            if (!req.file)
                return res.status(400).json({ error: 'Nenhum arquivo de som enviado' });
            const db = (0, database_1.getDb)();
            const somPath = `/uploads/${req.file.filename}`;
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
                .run('som_personalizado', somPath);
            broadcastEvent('CONFIG_ATUALIZADA', { som_personalizado: somPath });
            res.json({ success: true, somPath });
        }
        catch (err) {
            console.error('Error uploading sound:', err);
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
            const tempBackupDir = path_1.default.join(dataDir, 'Backups', '_manual');
            if (!fs_1.default.existsSync(tempBackupDir)) {
                fs_1.default.mkdirSync(tempBackupDir, { recursive: true });
            }
            const zipFile = await gerarBackupZip({
                incluirConfig,
                incluirOperadores,
                incluirBalcoes,
                incluirMidias,
                destino: tempBackupDir,
            });
            if (zipFile && fs_1.default.existsSync(zipFile)) {
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${path_1.default.basename(zipFile)}"`);
                const stream = fs_1.default.createReadStream(zipFile);
                stream.pipe(res);
                stream.on('end', () => {
                    // Limpa o arquivo temporário após download
                    try {
                        fs_1.default.unlinkSync(zipFile);
                    }
                    catch (e) { }
                });
            }
            else {
                res.status(500).json({ error: 'Erro ao gerar backup' });
            }
        }
        catch (err) {
            console.error('Backup error:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // --- GERENCIADOR DE BACKUPS ---
    // LISTAR BACKUPS
    app.get('/api/admin/backups', (req, res) => {
        try {
            const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
            const backupDir = path_1.default.join(dataDir, 'Backups');
            const limit = parseInt(req.query.limit || '20');
            if (!fs_1.default.existsSync(backupDir))
                return res.json({ backups: [] });
            const arquivos = fs_1.default.readdirSync(backupDir);
            const backups = arquivos
                .filter(file => file.startsWith('backup_') && file.endsWith('.zip'))
                .map(file => {
                const stats = fs_1.default.statSync(path_1.default.join(backupDir, file));
                return {
                    nome: file,
                    tamanhoMB: (stats.size / (1024 * 1024)).toFixed(2),
                    criado_em: stats.mtime.toISOString()
                };
            })
                .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
                .slice(0, limit);
            res.json({ backups });
        }
        catch (err) {
            console.error('Erro ao listar backups:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // EXCLUIR BACKUP
    app.delete('/api/admin/backups/:filename', requireMaster, (req, res) => {
        try {
            const filename = req.params.filename;
            // Validação rígida contra Path Traversal
            if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({ error: 'Nome de arquivo inválido.' });
            }
            const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
            const filePath = path_1.default.join(dataDir, 'Backups', filename);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                res.json({ success: true });
            }
            else {
                res.status(404).json({ error: 'Backup não encontrado.' });
            }
        }
        catch (err) {
            console.error('Erro ao excluir backup:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // RESTAURAR BACKUP LOCAL
    app.post('/api/admin/backups/:filename/restore', requireMaster, async (req, res) => {
        try {
            const filename = req.params.filename;
            // Validação rígida contra Path Traversal
            if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({ error: 'Nome de arquivo inválido.' });
            }
            const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
            const filePath = path_1.default.join(dataDir, 'Backups', filename);
            if (!fs_1.default.existsSync(filePath)) {
                return res.status(404).json({ error: 'Backup não encontrado.' });
            }
            await restoreBackupZip(filePath);
            // Reinicia o estado e força os terminais a regarregarem as configs
            broadcastEvent('SISTEMA_RESETADO', { success: true });
            broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
            res.json({ success: true });
        }
        catch (err) {
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
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch (e) { }
            // Reinicia o estado e força os terminais a regarregarem as configs
            broadcastEvent('SISTEMA_RESETADO', { success: true });
            broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
            res.json({ success: true });
        }
        catch (err) {
            console.error('[RESTORE MANUAL ERROR]:', err);
            if (req.file && fs_1.default.existsSync(req.file.path)) {
                try {
                    fs_1.default.unlinkSync(req.file.path);
                }
                catch (e) { }
            }
            res.status(500).json({ error: err.message });
        }
    });
    // --- RELATÓRIOS ---
    app.get('/api/relatorios', (req, res) => {
        try {
            const { inicio, fim } = req.query;
            const db = (0, database_1.getDb)();
            // Ajusta datas para cobrir o dia inteiro (YYYY-MM-DD 00:00:00 até YYYY-MM-DD 23:59:59)
            const dateStart = `${inicio} 00:00:00`;
            const dateEnd = `${fim} 23:59:59`;
            const total = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE criado_em BETWEEN ? AND ?").get(dateStart, dateEnd);
            const atendidas = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'atendida' AND criado_em BETWEEN ? AND ?").get(dateStart, dateEnd);
            const canceladas = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status IN ('cancelada', 'nao_compareceu') AND criado_em BETWEEN ? AND ?").get(dateStart, dateEnd);
            // Cálculo de tempo médio de espera em minutos
            // julianday retorna a fração de dias. Multiplicamos por 1440 para converter em minutos (24*60)
            const espera = db.prepare(`
        SELECT AVG((julianday(chamada_em) - julianday(criado_em)) * 1440) as media 
        FROM senhas 
        WHERE status IN ('chamada', 'atendida', 'cancelada', 'nao_compareceu') 
        AND chamada_em IS NOT NULL
        AND criado_em BETWEEN ? AND ?
      `).get(dateStart, dateEnd);
            // Cálculo de tempo médio de atendimento (TMA) em minutos
            const atendimento = db.prepare(`
        SELECT AVG((julianday(atendida_em) - julianday(chamada_em)) * 1440) as media 
        FROM senhas 
        WHERE status = 'atendida'
        AND chamada_em IS NOT NULL
        AND atendida_em IS NOT NULL
        AND criado_em BETWEEN ? AND ?
      `).get(dateStart, dateEnd);
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
        }
        catch (err) {
            console.error('Relatorio error:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // ═══════════════════════════════════════════════════════════════════
    //  ENCARTE — Configurações Adicionais (Admin)
    // ═══════════════════════════════════════════════════════════════════
    // --- FILTROS DE EXCLUSÃO ---
    app.get('/api/admin/encarte-filtros', requireMaster, (req, res) => {
        try {
            res.json((0, database_1.getDb)().prepare('SELECT * FROM encarte_filtros').all());
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/admin/encarte-filtros', requireMaster, (req, res) => {
        try {
            const { palavra_chave } = req.body;
            const stmt = (0, database_1.getDb)().prepare('INSERT INTO encarte_filtros (palavra_chave) VALUES (?)');
            res.status(201).json({ id: stmt.run(palavra_chave).lastInsertRowid, palavra_chave, ativo: 1 });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/admin/encarte-filtros/:id', requireMaster, (req, res) => {
        try {
            const { palavra_chave, ativo } = req.body;
            (0, database_1.getDb)().prepare('UPDATE encarte_filtros SET palavra_chave = ?, ativo = ? WHERE id = ?').run(palavra_chave, ativo, req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/admin/encarte-filtros/:id', requireMaster, (req, res) => {
        try {
            (0, database_1.getDb)().prepare('DELETE FROM encarte_filtros WHERE id = ?').run(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- NOMES CUSTOMIZADOS ---
    app.get('/api/admin/encarte-nomes', requireMaster, (req, res) => {
        try {
            res.json((0, database_1.getDb)().prepare('SELECT * FROM encarte_nomes_customizados').all());
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/admin/encarte-nomes', requireMaster, (req, res) => {
        try {
            const { codigo_produto, nome_exibicao } = req.body;
            (0, database_1.getDb)().prepare('INSERT OR REPLACE INTO encarte_nomes_customizados (codigo_produto, nome_exibicao) VALUES (?, ?)').run(codigo_produto, nome_exibicao);
            res.status(201).json({ codigo_produto, nome_exibicao, ativo: 1 });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/admin/encarte-nomes/:id', requireMaster, (req, res) => {
        try {
            const { nome_exibicao, ativo } = req.body;
            (0, database_1.getDb)().prepare('UPDATE encarte_nomes_customizados SET nome_exibicao = ?, ativo = ? WHERE codigo_produto = ?').run(nome_exibicao, ativo, req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/admin/encarte-nomes/:id', requireMaster, (req, res) => {
        try {
            (0, database_1.getDb)().prepare('DELETE FROM encarte_nomes_customizados WHERE codigo_produto = ?').run(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- TEMAS (Backgrounds com Vigência) ---
    app.get('/api/admin/encarte-temas', requireMaster, (req, res) => {
        try {
            res.json((0, database_1.getDb)().prepare('SELECT * FROM encarte_temas').all());
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/admin/encarte-temas', requireMaster, (req, res) => {
        try {
            const { nome, imagem_fundo, data_inicio, data_fim } = req.body;
            const stmt = (0, database_1.getDb)().prepare('INSERT INTO encarte_temas (nome, imagem_fundo, data_inicio, data_fim) VALUES (?, ?, ?, ?)');
            res.status(201).json({ id: stmt.run(nome, imagem_fundo, data_inicio || null, data_fim || null).lastInsertRowid });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/admin/encarte-temas/:id', requireMaster, (req, res) => {
        try {
            const { nome, imagem_fundo, data_inicio, data_fim, ativo } = req.body;
            (0, database_1.getDb)().prepare('UPDATE encarte_temas SET nome = ?, imagem_fundo = ?, data_inicio = ?, data_fim = ?, ativo = ? WHERE id = ?')
                .run(nome, imagem_fundo, data_inicio || null, data_fim || null, ativo, req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/admin/encarte-temas/:id', requireMaster, (req, res) => {
        try {
            (0, database_1.getDb)().prepare('DELETE FROM encarte_temas WHERE id = ?').run(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- TEMA ATUAL (Para o Telão) ---
    app.get('/api/telao/tema-atual', (req, res) => {
        try {
            // Comparar a string ISO "YYYY-MM-DD" atual contra os campos de data no SQLite
            const now = new Date().toISOString().split('T')[0];
            const db = (0, database_1.getDb)();
            const tema = db.prepare(`
        SELECT * FROM encarte_temas 
        WHERE ativo = 1 
          AND (data_inicio IS NULL OR data_inicio <= ?)
          AND (data_fim IS NULL OR data_fim >= ?)
        ORDER BY id DESC LIMIT 1
      `).get(now, now);
            res.json(tema || null);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ═══════════════════════════════════════════════════════════════════
    //  TOLEDO — Encarte de Preços por KG
    // ═══════════════════════════════════════════════════════════════════
    // GET all Toledo products (for the Encarte slide)
    app.get('/api/toledo/produtos', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            // 1. Carregar filtros ativos
            const filtros = db.prepare('SELECT palavra_chave FROM encarte_filtros WHERE ativo = 1').all();
            const keywordList = filtros.map(f => f.palavra_chave.toLowerCase());
            // 2. Carregar nomes customizados ativos
            const nomes = db.prepare('SELECT codigo_produto, nome_exibicao FROM encarte_nomes_customizados WHERE ativo = 1').all();
            const mapNomes = new Map();
            nomes.forEach(n => mapNomes.set(n.codigo_produto, n.nome_exibicao));
            // 3. Buscar os produtos da tabela unificada (produtos + categorias)
            let produtos = db.prepare(`
        SELECT p.id, p.plu, p.nome as descricao, p.preco, COALESCE(c.nome, p.categoria_legada, 'Outros') as categoria, p.unidade, p.updated_at as atualizado_em
        FROM produtos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.deleted_at IS NULL AND p.status = 1
        ORDER BY categoria ASC, p.nome ASC
      `).all();
            // 4. Aplicar filtros e renomeação
            const finalProdutos = [];
            for (const p of produtos) {
                const lowerDesc = p.descricao.toLowerCase();
                // Hide tags fixas
                if (lowerDesc.includes('[oculto]') || lowerDesc.includes('#hide'))
                    continue;
                // Keyword filters
                let blocked = false;
                for (const kw of keywordList) {
                    if (lowerDesc.includes(kw)) {
                        blocked = true;
                        break;
                    }
                }
                if (blocked)
                    continue;
                // Sobrescrita de nome customizado
                if (mapNomes.has(p.plu)) {
                    p.descricao = mapNomes.get(p.plu);
                }
                finalProdutos.push(p);
            }
            res.json(finalProdutos);
        }
        catch (err) {
            console.error('[TOLEDO API] Erro ao buscar produtos:', err);
            res.status(500).json({ error: err.message });
        }
    });
    // GET Toledo processing log
    app.get('/api/toledo/log', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const logs = db.prepare('SELECT * FROM toledo_log ORDER BY id DESC LIMIT 50').all();
            res.json(logs);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST force refresh from file
    app.post('/api/toledo/refresh', requireMaster, async (req, res) => {
        try {
            const result = await (0, toledo_watcher_1.forceToledoRefresh)();
            // Sync: envia produtos atualizados para a nuvem após refresh manual
            try {
                const db = (0, database_1.getDb)();
                const produtosCloud = db.prepare('SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos').all();
                (0, supabase_sync_1.syncProdutos)(produtosCloud);
            }
            catch (syncErr) {
                console.error('[TOLEDO] Sync cloud falhou (não crítico):', syncErr);
            }
            res.json(result);
        }
        catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });
    const PERSISTENT_DIR = 'C:\\ChamaAi';
    const PERSISTENT_CAT_PATH = path_1.default.join(PERSISTENT_DIR, 'categorias.json');
    const PERSISTENT_ORDEM_PATH = path_1.default.join(PERSISTENT_DIR, 'categorias-ordem.json');
    // POST update categories mapping
    app.post('/api/toledo/categorias', requireMaster, (req, res) => {
        try {
            const novasCategorias = req.body;
            // Always ensure the persistent directory exists
            if (!fs_1.default.existsSync(PERSISTENT_DIR)) {
                fs_1.default.mkdirSync(PERSISTENT_DIR, { recursive: true });
            }
            // Write to persistent path (main copy)
            fs_1.default.writeFileSync(PERSISTENT_CAT_PATH, JSON.stringify(novasCategorias, null, 2), 'utf-8');
            console.log('[TOLEDO] Categorias salvas na pasta persistente:', PERSISTENT_CAT_PATH);
            // Backwards compatibility fallback write
            const otherPaths = [
                path_1.default.join(__dirname, '../../server/categorias.json'),
                path_1.default.join(__dirname, 'categorias.json'),
                path_1.default.join(process.cwd(), 'server', 'categorias.json'),
            ];
            for (const catPath of otherPaths) {
                try {
                    fs_1.default.writeFileSync(catPath, JSON.stringify(novasCategorias, null, 2), 'utf-8');
                    console.log('[TOLEDO] Categorias sincronizadas com cópia de fallback:', catPath);
                }
                catch (e) {
                    // Ignore write failure on readonly folder
                }
            }
            // Reload in-memory mapping
            (0, toledo_watcher_1.reloadCategorias)();
            // Bônus: Atualiza as categorias dos produtos que JÁ ESTÃO no banco!
            const db = (0, database_1.getDb)();
            const updateStmt = db.prepare('UPDATE toledo_produtos SET categoria = ? WHERE plu = ?');
            const transaction = db.transaction((cats) => {
                for (const [plu, catName] of Object.entries(cats)) {
                    updateStmt.run(catName, plu);
                }
            });
            transaction(novasCategorias);
            // Sync: envia produtos com categorias atualizadas para a nuvem
            const produtosCloud = db.prepare('SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos').all();
            (0, supabase_sync_1.syncProdutos)(produtosCloud);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET categories mapping
    app.get('/api/toledo/categorias', (req, res) => {
        try {
            if (fs_1.default.existsSync(PERSISTENT_CAT_PATH)) {
                const data = JSON.parse(fs_1.default.readFileSync(PERSISTENT_CAT_PATH, 'utf-8'));
                return res.json(data);
            }
            const possiblePaths = [
                path_1.default.join(__dirname, '../../server/categorias.json'),
                path_1.default.join(__dirname, 'categorias.json'),
                path_1.default.join(process.cwd(), 'server', 'categorias.json'),
            ];
            for (const catPath of possiblePaths) {
                if (fs_1.default.existsSync(catPath)) {
                    const data = JSON.parse(fs_1.default.readFileSync(catPath, 'utf-8'));
                    // Initialize persistent file
                    try {
                        if (!fs_1.default.existsSync(PERSISTENT_DIR))
                            fs_1.default.mkdirSync(PERSISTENT_DIR, { recursive: true });
                        fs_1.default.writeFileSync(PERSISTENT_CAT_PATH, JSON.stringify(data, null, 2), 'utf-8');
                    }
                    catch (errWrite) {
                        console.error('[TOLEDO] Erro ao inicializar arquivo persistente de categorias:', errWrite);
                    }
                    return res.json(data);
                }
            }
            res.json({});
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── Ordem das categorias no portal do cliente (totalmente dinâmico do banco) ──
    app.get('/api/toledo/categorias-ordem', (_req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const rows = db.prepare("SELECT nome FROM categorias WHERE ativo = 1 ORDER BY ordem ASC, id ASC").all();
            const names = rows.map(r => r.nome);
            res.json(names);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/toledo/categorias-ordem', requireMaster, async (req, res) => {
        try {
            const ordem = req.body;
            const db = (0, database_1.getDb)();
            const updateStmt = db.prepare("UPDATE categorias SET ordem = ? WHERE nome = ?");
            const transaction = db.transaction((names) => {
                names.forEach((name, index) => {
                    updateStmt.run(index + 1, name);
                });
            });
            transaction(ordem);
            // Sync: grava a ordem no Supabase para o portal cliente (Vercel) ler
            try {
                (0, supabase_sync_1.syncConfiguracaoPublica)('categorias_ordem', JSON.stringify(ordem));
                console.log('[SYNC] ✅ Ordem de categorias enfileirada para sincronização');
            }
            catch (syncErr) {
                console.error('[SYNC] ⚠️ Erro ao enfileirar ordem (não crítico):', syncErr);
            }
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ── Funções Auxiliares do Catálogo ───────────────────────────────────────
    const generateUniqueSlug = (db, tableName, baseName, ignoreId) => {
        if (!baseName)
            return '';
        let baseSlug = baseName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
        if (!baseSlug)
            baseSlug = `${tableName.slice(0, 3)}-${Date.now()}`;
        let finalSlug = baseSlug;
        let counter = 1;
        let query = `SELECT id FROM ${tableName} WHERE slug = ?`;
        let params = [finalSlug];
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
    const registerAuditLog = (db, acao, entidade, id, details) => {
        try {
            db.prepare(`
        INSERT INTO audit_logs (acao, entidade, entidade_id, detalhes_json, criado_em)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(acao, entidade, id, JSON.stringify(details));
        }
        catch (err) {
            console.error('Falha ao gravar audit log:', err);
        }
    };
    const parseJsonField = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined)
            return null;
        if (typeof fieldValue === 'string') {
            if (fieldValue.trim() === '')
                return null; // Treat empty string as null or valid? The user said don't overwrite if not sent, but if sent as empty string, maybe it's valid? Wait, JSON.parse('') throws. Let's just JSON.parse it to validate.
            JSON.parse(fieldValue);
            return fieldValue;
        }
        return JSON.stringify(fieldValue);
    };
    // ── FASE 2: ROTAS DO CATÁLOGO DE PRODUTOS (NOVAS) ────────────────────────
    app.get('/api/catalogo/produtos', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { search, categoria_id, status, deleted } = req.query;
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.max(1, parseInt(req.query.limit) || 50);
            const offset = (page - 1) * limit;
            let baseQuery = " FROM produtos WHERE 1=1";
            const params = [];
            if (deleted !== 'true')
                baseQuery += " AND deleted_at IS NULL";
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
            if (req.query.sort && allowedSortFields.includes(req.query.sort)) {
                sortField = req.query.sort;
            }
            if (req.query.order && String(req.query.order).toUpperCase() === 'DESC') {
                sortDirection = 'DESC';
            }
            const countRow = db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(...params);
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
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.get('/api/catalogo/produtos/:id', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            const produto = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
            if (!produto)
                return res.status(404).json({ success: false, error: "Produto não encontrado" });
            res.json({ success: true, data: produto });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.post('/api/catalogo/produtos', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const body = req.body;
            if (!body.nome)
                return res.status(400).json({ success: false, error: "Nome é obrigatório" });
            const preco = Number(body.preco) || 0;
            if (isNaN(preco) || preco < 0)
                return res.status(400).json({ success: false, error: "Preço inválido" });
            const estoque = Number(body.estoque) || 0;
            if (isNaN(estoque))
                return res.status(400).json({ success: false, error: "Estoque inválido" });
            const status = body.status === undefined ? 1 : (body.status ? 1 : 0);
            let categoria_id = body.categoria_id || null;
            if (categoria_id) {
                const cat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(categoria_id);
                if (!cat)
                    return res.status(400).json({ success: false, error: "Categoria informada não existe ou está excluída." });
            }
            let links = null, imagens = null, variacoes = null, configuracoes_internas = null;
            try {
                if (body.links)
                    links = parseJsonField(body.links);
                if (body.imagens)
                    imagens = parseJsonField(body.imagens);
                if (body.variacoes)
                    variacoes = parseJsonField(body.variacoes);
                if (body.configuracoes_internas)
                    configuracoes_internas = parseJsonField(body.configuracoes_internas);
            }
            catch (e) {
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
      `).run(slug, body.nome, body.descricao || null, preco, status, estoque, categoria_id, body.categoria_legada || null, body.plu || null, Number(body.ordem) || 0, links, imagens, variacoes, configuracoes_internas);
            const novoId = result.lastInsertRowid;
            registerAuditLog(db, 'CREATE_PRODUTO', 'PRODUTO', Number(novoId), { created: body });
            (0, supabase_sync_1.syncCatalogoProdutos)();
            res.json({ success: true, data: { id: novoId }, message: "Produto criado com sucesso" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    const updateProdutoSeguro = (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            const body = req.body;
            const existing = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
            if (!existing)
                return res.status(404).json({ success: false, error: "Produto não encontrado ou excluído." });
            const updates = [];
            const params = [];
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
            if (body.descricao !== undefined) {
                updates.push("descricao = ?");
                params.push(body.descricao);
            }
            if (body.preco !== undefined) {
                const preco = Number(body.preco) || 0;
                if (isNaN(preco) || preco < 0)
                    return res.status(400).json({ success: false, error: "Preço inválido" });
                updates.push("preco = ?");
                params.push(preco);
            }
            if (body.status !== undefined) {
                updates.push("status = ?");
                params.push(body.status ? 1 : 0);
            }
            if (body.estoque !== undefined) {
                const estoque = Number(body.estoque) || 0;
                if (isNaN(estoque))
                    return res.status(400).json({ success: false, error: "Estoque inválido" });
                updates.push("estoque = ?");
                params.push(estoque);
            }
            if (body.categoria_id !== undefined) {
                let catId = body.categoria_id;
                if (catId) {
                    const cat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(catId);
                    if (!cat)
                        return res.status(400).json({ success: false, error: "Categoria informada não existe ou está excluída." });
                }
                updates.push("categoria_id = ?");
                params.push(catId || null);
            }
            if (body.categoria_legada !== undefined) {
                updates.push("categoria_legada = ?");
                params.push(body.categoria_legada);
            }
            if (body.plu !== undefined) {
                updates.push("plu = ?");
                params.push(body.plu);
            }
            if (body.ordem !== undefined) {
                updates.push("ordem = ?");
                params.push(Number(body.ordem) || 0);
            }
            // JSONs
            try {
                if (body.links !== undefined) {
                    updates.push("links = ?");
                    params.push(parseJsonField(body.links));
                }
                if (body.imagens !== undefined) {
                    updates.push("imagens = ?");
                    params.push(parseJsonField(body.imagens));
                }
                if (body.variacoes !== undefined) {
                    updates.push("variacoes = ?");
                    params.push(parseJsonField(body.variacoes));
                }
                if (body.configuracoes_internas !== undefined) {
                    updates.push("configuracoes_internas = ?");
                    params.push(parseJsonField(body.configuracoes_internas));
                }
            }
            catch (e) {
                return res.status(400).json({ success: false, error: "Campo JSON inválido" });
            }
            if (updates.length === 0)
                return res.json({ success: true, message: "Nada a atualizar." });
            updates.push("updated_at = datetime('now', 'localtime')");
            params.push(id);
            db.prepare(`UPDATE produtos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            registerAuditLog(db, 'UPDATE_PRODUTO', 'PRODUTO', Number(id), { before: existing, changed_keys: Object.keys(body) });
            (0, supabase_sync_1.syncCatalogoProdutos)();
            res.json({ success: true, message: "Produto atualizado com sucesso." });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    };
    app.put('/api/catalogo/produtos/:id', requireMaster, updateProdutoSeguro);
    app.patch('/api/catalogo/produtos/:id', requireMaster, updateProdutoSeguro);
    app.delete('/api/catalogo/produtos/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            const existing = db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
            if (!existing)
                return res.status(404).json({ success: false, error: "Produto não encontrado ou já excluído." });
            db.prepare("UPDATE produtos SET deleted_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
            registerAuditLog(db, 'SOFT_DELETE', 'PRODUTO', Number(id), { message: 'Produto movido para lixeira' });
            (0, supabase_sync_1.syncDeleteCatalogoItem)('produtos_publicos', Number(id));
            res.json({ success: true, message: "Produto movido para a lixeira." });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/produtos/:id/restaurar', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            db.prepare("UPDATE produtos SET deleted_at = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
            registerAuditLog(db, 'RESTORE', 'PRODUTO', Number(id), { message: 'Produto restaurado' });
            (0, supabase_sync_1.syncCatalogoProdutos)();
            res.json({ success: true, message: "Produto restaurado com sucesso." });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    // ── FASE 2: ROTAS DO CATÁLOGO DE CATEGORIAS (NOVAS) ──────────────────────
    app.get('/api/catalogo/categorias', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { deleted } = req.query;
            let query = "SELECT * FROM categorias WHERE 1=1";
            if (deleted !== 'true')
                query += " AND deleted_at IS NULL";
            query += " ORDER BY ordem ASC, id ASC";
            const rows = db.prepare(query).all();
            res.json({ success: true, data: rows });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.get('/api/catalogo/categorias/:id', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const cat = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
            if (!cat)
                return res.status(404).json({ success: false, error: "Categoria não encontrada" });
            res.json({ success: true, data: cat });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.post('/api/catalogo/categorias', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { nome, emoji, descricao, ordem, ativo } = req.body;
            if (!nome)
                return res.status(400).json({ success: false, error: "Nome é obrigatório" });
            const slug = generateUniqueSlug(db, 'categorias', nome);
            const isAtivo = ativo === undefined ? 1 : (ativo ? 1 : 0);
            const result = db.prepare(`
        INSERT INTO categorias (nome, slug, emoji, descricao, ordem, ativo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(nome, slug, emoji || '', descricao || '', Number(ordem) || 0, isAtivo);
            const novoId = result.lastInsertRowid;
            registerAuditLog(db, 'CREATE_CATEGORIA', 'CATEGORIA', Number(novoId), { created: req.body });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, data: { id: novoId }, message: "Categoria criada" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/categorias/ordenar', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const { ordem } = req.body; // Array de { id, ordem }
            if (!Array.isArray(ordem))
                return res.status(400).json({ success: false, error: "Formato inválido" });
            const transaction = db.transaction((itens) => {
                const stmt = db.prepare("UPDATE categorias SET ordem = ? WHERE id = ? AND deleted_at IS NULL");
                for (const item of itens) {
                    if (item.id !== undefined && item.ordem !== undefined) {
                        stmt.run(Number(item.ordem), item.id);
                    }
                }
            });
            transaction(ordem);
            registerAuditLog(db, 'REORDER', 'CATEGORIA', 0, { items: ordem.length });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, message: "Categorias reordenadas" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    const updateCategoriaSegura = (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            const body = req.body;
            const existing = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
            if (!existing)
                return res.status(404).json({ success: false, error: "Categoria não encontrada" });
            const updates = [];
            const params = [];
            if (body.nome !== undefined) {
                updates.push("nome = ?");
                params.push(body.nome);
                if (body.nome !== existing.nome && !body.slug) {
                    updates.push("slug = ?");
                    params.push(generateUniqueSlug(db, 'categorias', body.nome, existing.id));
                }
            }
            if (body.slug !== undefined) {
                updates.push("slug = ?");
                params.push(generateUniqueSlug(db, 'categorias', body.slug, existing.id));
            }
            if (body.emoji !== undefined) {
                updates.push("emoji = ?");
                params.push(body.emoji);
            }
            if (body.descricao !== undefined) {
                updates.push("descricao = ?");
                params.push(body.descricao);
            }
            if (body.ordem !== undefined) {
                updates.push("ordem = ?");
                params.push(Number(body.ordem) || 0);
            }
            if (body.ativo !== undefined) {
                updates.push("ativo = ?");
                params.push(body.ativo ? 1 : 0);
            }
            if (updates.length === 0)
                return res.json({ success: true, message: "Nada a atualizar" });
            params.push(id);
            db.prepare(`UPDATE categorias SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            registerAuditLog(db, 'UPDATE_CATEGORIA', 'CATEGORIA', Number(id), { before: existing, changed_keys: Object.keys(body) });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, message: "Categoria atualizada" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    };
    app.put('/api/catalogo/categorias/:id', requireMaster, updateCategoriaSegura);
    app.patch('/api/catalogo/categorias/:id', requireMaster, updateCategoriaSegura);
    app.delete('/api/catalogo/categorias/:id', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            const cat = db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
            if (!cat)
                return res.status(404).json({ success: false, error: "Categoria não encontrada" });
            const countRow = db.prepare("SELECT COUNT(*) as count FROM produtos WHERE categoria_id = ? AND deleted_at IS NULL").get(id);
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
            (0, supabase_sync_1.syncDeleteCatalogoItem)('categorias_publicas', Number(id));
            res.json({ success: true, message: "Categoria movida para a lixeira." });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/categorias/:id/mover-produtos', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const oldId = req.params.id;
            const { nova_categoria_id } = req.body;
            if (!nova_categoria_id)
                return res.status(400).json({ success: false, error: "nova_categoria_id é obrigatório" });
            if (String(oldId) === String(nova_categoria_id))
                return res.status(400).json({ success: false, error: "A nova categoria deve ser diferente" });
            const oldCat = db.prepare("SELECT id FROM categorias WHERE id = ?").get(oldId);
            if (!oldCat)
                return res.status(404).json({ success: false, error: "Categoria antiga não encontrada" });
            const newCat = db.prepare("SELECT id FROM categorias WHERE id = ? AND deleted_at IS NULL").get(nova_categoria_id);
            if (!newCat)
                return res.status(400).json({ success: false, error: "Nova categoria não encontrada ou está excluída" });
            const result = db.prepare("UPDATE produtos SET categoria_id = ?, updated_at = datetime('now', 'localtime') WHERE categoria_id = ? AND deleted_at IS NULL").run(nova_categoria_id, oldId);
            registerAuditLog(db, 'MOVER_PRODUTOS', 'CATEGORIA', Number(oldId), { para: nova_categoria_id, quantidade: result.changes });
            (0, supabase_sync_1.syncCatalogoProdutos)();
            res.json({ success: true, message: `${result.changes} produto(s) movidos com sucesso.` });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/categorias/:id/restaurar', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            db.prepare("UPDATE categorias SET deleted_at = NULL WHERE id = ?").run(id);
            registerAuditLog(db, 'RESTORE', 'CATEGORIA', Number(id), { message: 'Categoria restaurada' });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, message: "Categoria restaurada" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/categorias/:id/inativar', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            db.prepare("UPDATE categorias SET ativo = 0 WHERE id = ? AND deleted_at IS NULL").run(id);
            registerAuditLog(db, 'INATIVAR', 'CATEGORIA', Number(id), { message: 'Categoria inativada' });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, message: "Categoria inativada" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    app.patch('/api/catalogo/categorias/:id/ativar', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const id = req.params.id;
            db.prepare("UPDATE categorias SET ativo = 1 WHERE id = ? AND deleted_at IS NULL").run(id);
            registerAuditLog(db, 'ATIVAR', 'CATEGORIA', Number(id), { message: 'Categoria ativada' });
            (0, supabase_sync_1.syncCatalogoCategorias)();
            res.json({ success: true, message: "Categoria ativada" });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
    // ── CRUD de Categorias Dinâmicas ───────────────────────────────────────────
    // GET all categories
    app.get('/api/categorias', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const rows = db.prepare("SELECT * FROM categorias ORDER BY ordem ASC, id ASC").all();
            const mapped = rows.map((r) => ({
                id: r.id,
                nome: r.nome,
                emoji: r.emoji || '',
                descricao: r.descricao || '',
                ordem: r.ordem || 0,
                ativo: r.ativo === 1,
                setor: r.setor || 'Outros'
            }));
            res.json(mapped);
        }
        catch (err) {
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
            const db = (0, database_1.getDb)();
            const insertStmt = db.prepare(`
        INSERT INTO categorias (nome, emoji, descricao, ordem, ativo, setor)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
            const result = insertStmt.run(nome.trim(), emoji || '', descricao || '', ordem !== undefined ? Number(ordem) : 0, ativo === false ? 0 : 1, setor || 'Outros');
            res.status(201).json({ success: true, id: result.lastInsertRowid });
        }
        catch (err) {
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
            const db = (0, database_1.getDb)();
            const updateStmt = db.prepare(`
        UPDATE categorias 
        SET nome = ?, emoji = ?, descricao = ?, ordem = ?, ativo = ?, setor = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `);
            updateStmt.run(nome.trim(), emoji || '', descricao || '', ordem !== undefined ? Number(ordem) : 0, ativo === false ? 0 : 1, setor || 'Outros', id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // DELETE category
    app.delete('/api/categorias/:id', requireMaster, (req, res) => {
        try {
            const { id } = req.params;
            const db = (0, database_1.getDb)();
            const deleteStmt = db.prepare("DELETE FROM categorias WHERE id = ?");
            deleteStmt.run(id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET export categories
    app.get('/api/categorias/export', (req, res) => {
        try {
            const format = req.query.format || 'json';
            const db = (0, database_1.getDb)();
            const rows = db.prepare("SELECT * FROM categorias ORDER BY ordem ASC, id ASC").all();
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
        }
        catch (err) {
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
            let parsed = [];
            if (format === 'csv') {
                // Parser simples de CSV que lida com aspas
                const lines = data.split(/\r?\n/);
                if (lines.length > 0) {
                    const header = lines[0].toLowerCase().split(',');
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line === '')
                            continue;
                        const fields = [];
                        let current = '';
                        let inQuotes = false;
                        for (let c = 0; c < line.length; c++) {
                            const char = line[c];
                            if (char === '"') {
                                if (inQuotes && line[c + 1] === '"') {
                                    current += '"';
                                    c++;
                                }
                                else {
                                    inQuotes = !inQuotes;
                                }
                            }
                            else if (char === ',' && !inQuotes) {
                                fields.push(current);
                                current = '';
                            }
                            else {
                                current += char;
                            }
                        }
                        fields.push(current);
                        const item = {};
                        header.forEach((h, idx) => {
                            const cleanH = h.trim();
                            if (cleanH === 'nome')
                                item.nome = fields[idx]?.trim();
                            if (cleanH === 'emoji')
                                item.emoji = fields[idx]?.trim();
                            if (cleanH === 'descricao' || cleanH === 'descrição')
                                item.descricao = fields[idx]?.trim();
                            if (cleanH === 'ordem')
                                item.ordem = parseInt(fields[idx]);
                            if (cleanH === 'ativo')
                                item.ativo = fields[idx]?.toLowerCase() === 'true' || fields[idx] === '1';
                            if (cleanH === 'setor')
                                item.setor = fields[idx]?.trim();
                        });
                        if (item.nome) {
                            parsed.push(item);
                        }
                    }
                }
            }
            else {
                // JSON format
                parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (!Array.isArray(parsed)) {
                    return res.status(400).json({ error: 'O formato JSON de importação deve ser uma lista (array).' });
                }
            }
            const db = (0, database_1.getDb)();
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
                items.forEach((item) => {
                    insertOrUpdate.run(item.nome.trim(), item.emoji || '', item.descricao || '', item.ordem !== undefined ? Number(item.ordem) : 0, item.ativo === false ? 0 : 1, item.setor || 'Outros');
                });
            });
            transaction(parsed);
            res.json({ success: true, count: parsed.length });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Update product description manually (admin)
    app.put('/api/toledo/produtos/:plu', (req, res) => {
        try {
            const { plu } = req.params;
            const { descricao, unidade } = req.body;
            const db = (0, database_1.getDb)();
            if (descricao !== undefined && unidade !== undefined) {
                db.prepare(`UPDATE toledo_produtos SET descricao = ?, unidade = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
                    .run(descricao, unidade, plu);
            }
            else if (unidade !== undefined) {
                db.prepare(`UPDATE toledo_produtos SET unidade = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
                    .run(unidade, plu);
            }
            else if (descricao !== undefined) {
                db.prepare(`UPDATE toledo_produtos SET descricao = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
                    .run(descricao, plu);
            }
            else {
                return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido.' });
            }
            broadcastEvent('TOLEDO_PRECOS_ATUALIZADOS', { action: 'description_update' });
            // Sync manual change to catalog
            const updatedItem = db.prepare("SELECT plu, preco, descricao, categoria, unidade FROM toledo_produtos WHERE plu = ?").get(plu);
            if (updatedItem)
                (0, toledo_watcher_1.syncToCatalogoProduto)(db, updatedItem);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // ═══════════════════════════════════════════════════════════════════
    (0, media_indoor_1.setupMediaIndoorRoutes)(app, broadcastEvent, requireMaster);
    // Catch-all 404 handler for API
    // --- TEMPORARY TEST ENDPOINT ---
    app.get('/api/dev/test-fase2-1', (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            const plu = "5881";
            // Update custom fields in catalog to simulate manual edit
            db.prepare(`UPDATE produtos SET imagens = '["img1.png"]', tags = '["premium"]', slug = 'alho-custom' WHERE plu = ?`).run(plu);
            // Force a sync update from Toledo side
            const toledo = db.prepare("SELECT plu, preco, descricao, categoria, unidade FROM toledo_produtos WHERE plu = ?").get(plu);
            if (toledo) {
                (0, toledo_watcher_1.syncToCatalogoProduto)(db, toledo);
            }
            // Fetch result
            const prod = db.prepare("SELECT plu, nome, imagens, tags, slug, preco FROM produtos WHERE plu = ?").get(plu);
            const logs = db.prepare("SELECT acao, detalhes_json, criado_em FROM audit_logs WHERE entidade = 'produtos' AND entidade_id = (SELECT id FROM produtos WHERE plu = ?) ORDER BY id DESC LIMIT 5").all(plu);
            res.json({ prod, logs });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.use('/api', (req, res) => {
        console.warn(`404 - Not Found: ${req.method} ${req.url}`);
        res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.url}` });
    });
    // Serve Frontend to network clients
    const frontendPath = path_1.default.join(__dirname, '../../dist');
    if (fs_1.default.existsSync(frontendPath)) {
        app.use(express_1.default.static(frontendPath));
        // Middleware para SPA: se não for API, uploads ou atualizações locais, manda o index.html
        app.use((req, res, next) => {
            if (req.url.startsWith('/api') || req.url.startsWith('/uploads') || req.url.startsWith('/local-updates')) {
                return next();
            }
            res.sendFile(path_1.default.join(frontendPath, 'index.html'));
        });
    }
    // Rota para resetar as senhas manualmente
    app.post('/api/reset-senhas', requireMaster, (req, res) => {
        try {
            const db = (0, database_1.getDb)();
            // 1. Reseta os contadores de todos os balcões
            db.prepare("UPDATE balcoes SET contador_atual = 0").run();
            // 2. Limpeza total de senhas e chamadas para um reinício do zero
            db.prepare("DELETE FROM chamadas").run();
            db.prepare("DELETE FROM senhas").run();
            // Sync: limpa senhas na nuvem
            (0, supabase_sync_1.syncLimparSenhas)();
            // Notifica todos os terminais para resetarem seu estado local IMEDIATAMENTE
            broadcastEvent('SISTEMA_RESETADO', { success: true });
            broadcastEvent('CONFIG_ATUALIZADA', { reset: true });
            res.json({ success: true, message: 'Sistema resetado com sucesso!' });
        }
        catch (err) {
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
            const db = (0, database_1.getDb)();
            // Execute category migration safely on server startup
            try {
                (0, categorizador_1.migrateDatabaseAndConfigs)(db);
                (0, toledo_watcher_1.reloadCategorias)();
            }
            catch (migErr) {
                console.error('[STARTUP] Erro ao executar migração de categorias:', migErr.message);
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
            }
            catch (e) {
                console.error('[STARTUP] Erro ao criar tabela tokens_remotos:', e);
            }
            // 1. Sync public configuration options to Supabase
            const rows = db.prepare("SELECT chave, valor FROM configuracoes").all();
            const cfg = rows.reduce((acc, row) => ({ ...acc, [row.chave]: row.valor }), {});
            if (cfg['nome_estabelecimento']) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('nome_estabelecimento', cfg['nome_estabelecimento']);
            }
            if (cfg['portal_voz_alerta']) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_voz_alerta', cfg['portal_voz_alerta']);
            }
            if (cfg['portal_som_sua_vez']) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_som_sua_vez', cfg['portal_som_sua_vez']);
            }
            if (cfg['portal_som_prestes_chamar']) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('portal_som_prestes_chamar', cfg['portal_som_prestes_chamar']);
            }
            if (cfg['toledo_encarte_ativo'] !== undefined) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('toledo_encarte_ativo', cfg['toledo_encarte_ativo']);
            }
            if (cfg['toledo_ocultar_em_falta'] !== undefined) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('toledo_ocultar_em_falta', cfg['toledo_ocultar_em_falta']);
            }
            if (cfg['telao_ticker_texto'] !== undefined) {
                (0, supabase_sync_1.syncConfiguracaoPublica)('telao_ticker_texto', cfg['telao_ticker_texto']);
            }
            // Sincroniza a ordem das categorias no startup
            try {
                let ordemCategorias = [];
                if (fs_1.default.existsSync(PERSISTENT_ORDEM_PATH)) {
                    ordemCategorias = JSON.parse(fs_1.default.readFileSync(PERSISTENT_ORDEM_PATH, 'utf-8'));
                }
                else {
                    const possiblePaths = [
                        path_1.default.join(__dirname, '../../server/categorias-ordem.json'),
                        path_1.default.join(__dirname, 'categorias-ordem.json'),
                        path_1.default.join(process.cwd(), 'server', 'categorias-ordem.json'),
                    ];
                    for (const orderPath of possiblePaths) {
                        if (fs_1.default.existsSync(orderPath)) {
                            ordemCategorias = JSON.parse(fs_1.default.readFileSync(orderPath, 'utf-8'));
                            break;
                        }
                    }
                }
                if (ordemCategorias && ordemCategorias.length > 0) {
                    (0, supabase_sync_1.syncConfiguracaoPublica)('categorias_ordem', JSON.stringify(ordemCategorias));
                    console.log('[STARTUP] ✅ Ordem de categorias sincronizada com Supabase:', ordemCategorias.length, 'categorias');
                }
            }
            catch (errOrdem) {
                console.error('[STARTUP] Erro ao sincronizar ordem das categorias no startup:', errOrdem);
            }
            if (cfg['logo_cliente']) {
                const logoRelPath = cfg['logo_cliente'].replace(/^\//, ''); // remove leading slash
                const fullLogoPath = path_1.default.join(userDataPath, logoRelPath);
                if (fs_1.default.existsSync(fullLogoPath)) {
                    const base64 = fs_1.default.readFileSync(fullLogoPath, 'base64');
                    const ext = path_1.default.extname(fullLogoPath).toLowerCase().replace('.', '');
                    const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
                    const dataUrl = `data:${mimeType};base64,${base64}`;
                    (0, supabase_sync_1.syncConfiguracaoPublica)('logo_cliente_base64', dataUrl);
                    console.log('[STARTUP] ✅ Logo do estabelecimento sincronizada em base64 com Supabase');
                }
            }
            // Sincronização pendente da cor primária no startup
            try {
                const pendente = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'sync_pendente_cor_primaria'").get();
                if (pendente && pendente.valor === '1' && supabase_sync_1.isSupabaseConfigured) {
                    const cor = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'cor_primaria'").get();
                    if (cor && cor.valor) {
                        console.log('[STARTUP] Detectado cor_primaria pendente de sincronização. Tentando sincronizar com o Supabase...');
                        const { error } = await supabase_sync_1.supabase
                            .from('configuracoes_publicas')
                            .upsert({ chave: 'cor_primaria', valor: cor.valor, updated_at: new Date().toISOString() });
                        if (!error) {
                            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('sync_pendente_cor_primaria', '0', datetime('now'))").run();
                            console.log('[STARTUP] ✅ Cor primária sincronizada com sucesso e flag de pendência limpa.');
                        }
                        else {
                            throw error;
                        }
                    }
                }
            }
            catch (errColor) {
                console.warn('[STARTUP] Supabase offline — cor_primaria permanece pendente de sincronização.');
            }
            // Sincroniza todos os produtos Toledo ativos no startup para garantir que a nuvem esteja atualizada
            try {
                const produtosCloud = db.prepare('SELECT plu, descricao, preco, categoria, unidade FROM toledo_produtos').all();
                if (produtosCloud.length > 0) {
                    (0, supabase_sync_1.syncProdutos)(produtosCloud);
                    console.log('[STARTUP] ✅ Enfileirada sincronização de', produtosCloud.length, 'produtos Toledo com o Supabase');
                }
            }
            catch (errProd) {
                console.error('[STARTUP] Erro ao sincronizar produtos no startup:', errProd);
            }
            // 2. Perform daily reset if the server was off at reset time
            const configReset = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'reset_diario_automatico'").get();
            if (configReset && configReset.valor === '1') {
                const hoje = new Date().toISOString().split('T')[0];
                const ultimoResetRecord = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'ultimo_reset'").get();
                if (!ultimoResetRecord || ultimoResetRecord.valor !== hoje) {
                    console.log('[STARTUP] Detectado que o reset diário de hoje ainda não foi realizado. Executando agora...');
                    db.prepare("UPDATE balcoes SET contador_atual = 0").run();
                    db.prepare("DELETE FROM senhas WHERE status = 'aguardando'").run();
                    db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('ultimo_reset', ?, datetime('now'))").run(hoje);
                    // Clear cloud
                    (0, supabase_sync_1.syncLimparSenhas)();
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
        }
        catch (err) {
            console.error('[STARTUP] Erro no check de reset diário / sync de configurações:', err);
        }
        // Start Toledo file watcher after server is ready
        try {
            (0, toledo_watcher_1.setBroadcastFn)(broadcastEvent); // Inject SSE broadcaster (avoids circular dependency)
            toledoWatcherCleanup = (0, toledo_watcher_1.startToledoWatcher)();
        }
        catch (err) {
            console.error('[TOLEDO] Erro ao iniciar watcher (não crítico):', err);
        }
        // Start Supabase command listener for remote operator (Vercel)
        try {
            (0, supabase_sync_1.startSupabaseCommandListener)();
        }
        catch (err) {
            console.error('[SUPABASE] Erro ao iniciar command listener (não crítico):', err);
        }
        // Start Supabase sync worker (Outbox Pattern — processa fila local a cada 5s)
        try {
            (0, supabase_sync_1.startSyncWorker)();
        }
        catch (err) {
            console.error('[SUPABASE] Erro ao iniciar sync worker (não crítico):', err);
        }
    });
    serverInstance = server;
    // Heartbeat para manter as conexões SSE ativas e evitar timeouts
    heartbeatInterval = setInterval(() => {
        const pingPayload = `:\n\n`;
        sseClients.forEach(client => {
            try {
                client.write(pingPayload);
            }
            catch (e) { }
        });
        Object.keys(telaoSseClients).forEach(code => {
            telaoSseClients[code].forEach(client => {
                try {
                    client.write(pingPayload);
                }
                catch (e) { }
            });
        });
    }, 15000);
    server.on('connection', (socket) => {
        serverSockets.add(socket);
        socket.on('close', () => {
            serverSockets.delete(socket);
        });
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use.`);
        }
        else {
            console.error('Server error:', err);
        }
    });
}
// ═══════════════════════════════════════════════════════════════════
// BACKUP INTELIGENTE — Agendamento & Opt-in
// ═══════════════════════════════════════════════════════════════════
function carregarConfiguracoes() {
    try {
        const db = (0, database_1.getDb)();
        const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
        return rows.reduce((acc, row) => ({ ...acc, [row.chave]: row.valor }), {});
    }
    catch {
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
    if (cfg.backup_frequencia === 'semanal' && hoje.getDay() !== 0)
        return;
    if (cfg.backup_frequencia === 'mensal' && hoje.getDate() !== 1)
        return;
    console.log('[BACKUP] Executando backup agendado...');
    const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
    const backupDir = cfg.backup_destino && cfg.backup_destino.trim() !== ''
        ? cfg.backup_destino.trim()
        : path_1.default.join(dataDir, 'Backups');
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
async function gerarBackupZip(opts) {
    const { execSync } = require('child_process');
    const crypto = require('crypto');
    const db = (0, database_1.getDb)();
    const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
    const uploadsDir = path_1.default.join(dataDir, 'uploads');
    if (!fs_1.default.existsSync(opts.destino)) {
        fs_1.default.mkdirSync(opts.destino, { recursive: true });
    }
    const dataStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timestamp = Date.now();
    const zipFile = path_1.default.join(opts.destino, `backup_${dataStr}_${timestamp}.zip`);
    const tempDir = path_1.default.join(opts.destino, `_temp_${timestamp}`);
    if (!fs_1.default.existsSync(tempDir)) {
        fs_1.default.mkdirSync(tempDir, { recursive: true });
    }
    try {
        const backupData = {};
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
        const dbJsonPath = path_1.default.join(tempDir, 'database.json');
        fs_1.default.writeFileSync(dbJsonPath, JSON.stringify(backupData, null, 2), 'utf-8');
        // Copiar arquivos físicos de mídia se solicitado
        if (opts.incluirMidias && fs_1.default.existsSync(uploadsDir)) {
            const uploadsBackupDir = path_1.default.join(tempDir, 'uploads');
            fs_1.default.mkdirSync(uploadsBackupDir, { recursive: true });
            const files = fs_1.default.readdirSync(uploadsDir);
            for (const file of files) {
                const src = path_1.default.join(uploadsDir, file);
                const dst = path_1.default.join(uploadsBackupDir, file);
                if (fs_1.default.statSync(src).isFile()) {
                    fs_1.default.copyFileSync(src, dst);
                }
            }
        }
        // Gerar manifest com SHA-256
        const manifest = {};
        const walkDir = (dir, prefix = '') => {
            const entries = fs_1.default.readdirSync(dir);
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry);
                const relPath = prefix ? `${prefix}/${entry}` : entry;
                if (fs_1.default.statSync(fullPath).isDirectory()) {
                    walkDir(fullPath, relPath);
                }
                else {
                    const hash = crypto.createHash('sha256').update(fs_1.default.readFileSync(fullPath)).digest('hex');
                    manifest[relPath] = hash;
                }
            }
        };
        walkDir(tempDir);
        fs_1.default.writeFileSync(path_1.default.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
        // Compactar em ZIP usando PowerShell
        execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFile}' -Force"`, { timeout: 120000 });
        console.log(`[BACKUP] ✅ Arquivo ZIP gerado: ${zipFile}`);
        // --- VALIDAÇÃO DO BACKUP (Compactação e Descompactação) ---
        console.log(`[BACKUP] 🔍 Iniciando validação do backup gerado...`);
        const validationDir = path_1.default.join(opts.destino, `_val_${timestamp}`);
        try {
            fs_1.default.mkdirSync(validationDir, { recursive: true });
            execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipFile}' -DestinationPath '${validationDir}' -Force"`, { timeout: 120000 });
            const dbJsonValPath = path_1.default.join(validationDir, 'database.json');
            if (!fs_1.default.existsSync(dbJsonValPath)) {
                throw new Error("Arquivo database.json não encontrado após descompactação da validação.");
            }
            const valHash = crypto.createHash('sha256').update(fs_1.default.readFileSync(dbJsonValPath)).digest('hex');
            const originalHash = manifest['database.json'];
            if (valHash !== originalHash) {
                throw new Error(`Checksum SHA256 inválido para database.json. Esperado: ${originalHash}, Obtido: ${valHash}`);
            }
            console.log(`[BACKUP] ✅ Validação concluída. O backup está íntegro.`);
        }
        catch (valErr) {
            console.error(`[BACKUP] ❌ Falha na validação do backup: ${valErr.message}`);
            throw new Error(`Validação de integridade do backup falhou: ${valErr.message}`);
        }
        finally {
            try {
                fs_1.default.rmSync(validationDir, { recursive: true, force: true });
            }
            catch (e) { }
        }
        // -------------------------------------------------------------
        return zipFile;
    }
    finally {
        // Limpar pasta temporária
        try {
            fs_1.default.rmSync(tempDir, { recursive: true, force: true });
        }
        catch (e) {
            console.error('[BACKUP] ⚠️ Erro ao limpar pasta temporária:', e);
        }
    }
}
async function restoreBackupZip(zipFilePath) {
    const { execSync } = require('child_process');
    const crypto = require('crypto');
    const db = (0, database_1.getDb)();
    const dataDir = process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi';
    const uploadsDir = path_1.default.join(dataDir, 'uploads');
    const tempDir = path_1.default.join(dataDir, 'Backups', `_extract_${Date.now()}`);
    let actualZipPath = zipFilePath;
    const needsRename = !zipFilePath.toLowerCase().endsWith('.zip');
    if (needsRename) {
        actualZipPath = zipFilePath + '.zip';
        if (fs_1.default.existsSync(zipFilePath)) {
            // Pequeno atraso para garantir liberação do descriptor do multer antes do rename se necessário
            await new Promise(resolve => setTimeout(resolve, 200));
            fs_1.default.renameSync(zipFilePath, actualZipPath);
        }
    }
    // Atraso de segurança de 500ms para Windows liberar qualquer lock de leitura no arquivo
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
        fs_1.default.mkdirSync(tempDir, { recursive: true });
        // Extrai o ZIP via PowerShell nativo (protegendo caminhos contra aspas simples)
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${actualZipPath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force"`, { timeout: 120000 });
        // Valida o Manifest
        const manifestPath = path_1.default.join(tempDir, 'manifest.json');
        if (!fs_1.default.existsSync(manifestPath)) {
            throw new Error('Arquivo manifest.json ausente. Backup corrompido, inválido ou criado em versão antiga.');
        }
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        const tempUploads = path_1.default.join(tempDir, 'uploads');
        // Checa a integridade via SHA-256 de todos os arquivos
        for (const [relPath, expectedHash] of Object.entries(manifest)) {
            if (typeof expectedHash !== 'string')
                continue;
            const fullPath = path_1.default.join(tempDir, relPath);
            if (!fs_1.default.existsSync(fullPath))
                throw new Error(`Arquivo faltante no pacote de backup: ${relPath}`);
            const hash = crypto.createHash('sha256').update(fs_1.default.readFileSync(fullPath)).digest('hex');
            if (hash !== expectedHash)
                throw new Error(`Hash inválido (corrupção detectada) para: ${relPath}`);
        }
        // Lê os dados do banco SQLite em JSON
        const dbJsonPath = path_1.default.join(tempDir, 'database.json');
        if (!fs_1.default.existsSync(dbJsonPath))
            throw new Error('Arquivo database.json ausente no backup.');
        const backupData = JSON.parse(fs_1.default.readFileSync(dbJsonPath, 'utf-8'));
        // Inicia a restauração atômica do SQLite
        const tables = ['configuracoes', 'balcoes', 'midias', 'operadores'];
        db.prepare('PRAGMA foreign_keys = OFF').run();
        try {
            const transaction = db.transaction((data) => {
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
        }
        finally {
            db.prepare('PRAGMA foreign_keys = ON').run();
        }
        // Apenas após o sucesso atômico do banco de dados, prosseguimos para copiar os arquivos de mídia.
        // Isso previne que arquivos antigos sejam perdidos se o banco falhar.
        if (fs_1.default.existsSync(tempUploads)) {
            if (!fs_1.default.existsSync(uploadsDir))
                fs_1.default.mkdirSync(uploadsDir, { recursive: true });
            const files = fs_1.default.readdirSync(tempUploads);
            for (const file of files) {
                fs_1.default.copyFileSync(path_1.default.join(tempUploads, file), path_1.default.join(uploadsDir, file));
            }
        }
    }
    finally {
        // Restaura o nome original para que o caller possa deletar/gerenciar o arquivo corretamente
        if (needsRename && fs_1.default.existsSync(actualZipPath)) {
            try {
                fs_1.default.renameSync(actualZipPath, zipFilePath);
            }
            catch (e) {
                console.error('[RESTORE] Erro ao restaurar nome do arquivo original:', e);
            }
        }
        // Limpeza da extração
        try {
            fs_1.default.rmSync(tempDir, { recursive: true, force: true });
        }
        catch (e) { }
    }
}
async function limparBackupsAntigos(backupDir, diasReter) {
    try {
        if (!fs_1.default.existsSync(backupDir))
            return;
        const agora = Date.now();
        const arquivos = fs_1.default.readdirSync(backupDir);
        for (const arquivo of arquivos) {
            if (!arquivo.startsWith('backup_') || !arquivo.endsWith('.zip'))
                continue;
            const filePath = path_1.default.join(backupDir, arquivo);
            const stats = fs_1.default.statSync(filePath);
            const idadeDias = (agora - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (idadeDias > diasReter) {
                fs_1.default.unlinkSync(filePath);
                console.log(`[BACKUP] 🗑️ Backup antigo removido (${Math.floor(idadeDias)} dias): ${arquivo}`);
            }
        }
    }
    catch (e) {
        console.error('[BACKUP] ⚠️ Erro ao limpar backups antigos:', e);
    }
}
function broadcastEvent(event, data) {
    const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
    // Envia para os clientes SSE globais
    sseClients.forEach(client => {
        try {
            client.write(payload);
        }
        catch (e) {
            console.error('[SSE] Erro ao enviar evento para cliente global:', e);
        }
    });
    // Envia para os telões específicos
    Object.keys(telaoSseClients).forEach(code => {
        telaoSseClients[code].forEach(client => {
            try {
                client.write(payload);
            }
            catch (e) {
                console.error(`[SSE] Erro ao enviar evento para telão ${code}:`, e);
            }
        });
    });
}
let udpSocket = null;
let udpBroadcastInterval = null;
function getLocalIp() {
    const nets = os_1.default.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
                    return net.address;
                }
            }
        }
    }
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
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
            try {
                udpSocket.close();
            }
            catch (e) { }
            udpSocket = null;
        }
        if (udpBroadcastInterval) {
            clearInterval(udpBroadcastInterval);
            udpBroadcastInterval = null;
        }
        udpSocket = dgram_1.default.createSocket('udp4');
        udpSocket.bind(() => {
            if (udpSocket) {
                try {
                    udpSocket.setBroadcast(true);
                    console.log('[UDP] Socket de broadcast habilitado.');
                }
                catch (e) {
                    console.error('[UDP] Erro ao habilitar setBroadcast:', e);
                }
            }
        });
        // Envia o primeiro anúncio imediatamente
        setTimeout(() => {
            enviarAnuncio();
        }, 500);
        udpBroadcastInterval = setInterval(enviarAnuncio, 5000);
    }
    catch (err) {
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
    }
    catch (err) {
        console.error('[UDP] Erro na serialização/envio do broadcast:', err);
    }
}
let serverInstance = null;
const serverSockets = new Set();
let toledoWatcherCleanup = null;
function stopServer() {
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
            }
            catch (e) {
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
                }
                catch (e) {
                    console.error('Erro ao fechar conexão SSE:', e);
                }
            });
            sseClients = [];
        }
        // Fechar todos os sockets HTTP/TCP ativos
        if (serverSockets.size > 0) {
            console.log(`[SERVER] Destruindo ${serverSockets.size} sockets ativos...`);
            for (const socket of serverSockets) {
                try {
                    socket.destroy();
                }
                catch (e) {
                    console.error('Erro ao destruir socket:', e);
                }
            }
            serverSockets.clear();
        }
        if (toledoWatcherCleanup) {
            try {
                toledoWatcherCleanup();
                toledoWatcherCleanup = null;
            }
            catch (e) {
                console.error('Erro ao parar Toledo watcher', e);
            }
        }
        try {
            (0, supabase_sync_1.stopSupabaseCommandListener)();
        }
        catch (e) {
            console.error('Erro ao parar Supabase listener', e);
        }
        try {
            (0, supabase_sync_1.stopSyncWorker)();
        }
        catch (e) {
            console.error('Erro ao parar Sync worker', e);
        }
        try {
            const db = (0, database_1.getDb)();
            if (db)
                db.close();
            console.log('[SERVER] SQLite fechado.');
        }
        catch (e) {
            console.error('Erro ao fechar DB', e);
        }
        if (serverInstance) {
            serverInstance.close(() => {
                console.log('[SERVER] Servidor HTTP Express encerrado.');
                resolve();
            });
        }
        else {
            resolve();
        }
    });
}
