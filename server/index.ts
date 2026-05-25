import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cron from 'node-cron';
import { getDb } from '../electron/services/database';
import { startToledoWatcher, forceToledoRefresh, reloadCategorias, setBroadcastFn } from './toledo-watcher';
import { syncNovaSenha, syncStatusSenha, syncLimparSenhas, syncProdutos, startSupabaseCommandListener, stopSupabaseCommandListener, syncConfiguracaoPublica, startSyncWorker, stopSyncWorker } from './supabase-sync';
import { migrateDatabaseAndConfigs } from './categorizador';

const app = express();

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

// Middleware: injeta header X-Is-Master em todas as respostas
function injectMasterHeader(req: express.Request, res: express.Response, next: express.NextFunction) {
  const isMaster = isRequestLocal(req);
  res.setHeader('X-Is-Master', isMaster ? 'true' : 'false');
  next();
}

// Middleware guard: bloqueia escrita administrativa de clientes remotos
function requireMaster(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isRequestLocal(req)) {
    console.warn(`[SECURITY] ⛔ Tentativa de escrita admin bloqueada do IP: ${req.ip}`);
    return res.status(403).json({ 
      error: 'Acesso negado. Alterações administrativas só podem ser feitas no Servidor Master.',
      isMaster: false 
    });
  }
  next();
}

app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['X-Is-Master']
}));
app.use(injectMasterHeader);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let sseClients: express.Response[] = [];

export function startServer() {
  const PORT = 3000;
  
  // Resolve o caminho para uma pasta local visível e fácil de gerenciar
  const userDataPath = 'C:\\ChamaAi';
  const UPLOADS_DIR = path.join(userDataPath, 'uploads');

  // Ensure uploads directory exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

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

  // Upload configurado especificamente para arquivos de backup grandes
  const backupUpload = multer({ 
    dest: path.join(process.env.CHAMAAI_DATA_DIR ?? 'C:\\ChamaAi', 'Backups', '_temp'),
    limits: { fileSize: 500 * 1024 * 1024 } // Limite rígido de 500MB
  });

  // Serve static files from uploads folder
  app.use('/uploads', express.static(UPLOADS_DIR));

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

  });
  // -----------------

  // --- Admin Status Endpoint ---
  app.get('/api/admin/status', (req, res) => {
    const isMaster = isRequestLocal(req);
    res.json({ isMaster, clientIP: req.ip });
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  app.get('/api/senhas', (req, res) => {
    try {
      const db = getDb();
      const senhas = db.prepare('SELECT * FROM senhas ORDER BY id DESC LIMIT 50').all();
      res.json(senhas);
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
      const { balcao_id, preferencial } = req.body;
      const db = getDb();
      console.log('Emitindo senha para balcão:', balcao_id, 'Preferencial:', preferencial);
      
      const balcaoIdNum = Number(balcao_id);
      
      // Increment counter with reset at 999
      const updateBalcao = db.prepare(`
        UPDATE balcoes 
        SET contador_atual = CASE 
          WHEN contador_atual >= 999 THEN 0 
          ELSE contador_atual + 1 
        END 
        WHERE id = ?
      `);
      updateBalcao.run(balcaoIdNum);
      
      const balcao = db.prepare('SELECT contador_atual FROM balcoes WHERE id = ?').get(balcaoIdNum) as any;
      console.log('Dados do balcão após incremento:', balcao);
      
      if (!balcao) throw new Error('Balcão não encontrado');
      
      // Bala de prata: Captura o número independente de maiúsculo/minúsculo ou se é nulo
      const numero = (balcao.contador_atual !== undefined ? balcao.contador_atual : balcao.CONTADOR_ATUAL) ?? 0;

      const insertSenha = db.prepare('INSERT INTO senhas (balcao_id, numero, preferencial, status) VALUES (?, ?, ?, ?)');
      const result = insertSenha.run(balcaoIdNum, numero, preferencial ? 1 : 0, 'aguardando');

      const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get() as any;

      const novaSenha = {
        id: result.lastInsertRowid,
        balcao_id: balcaoIdNum,
        numero,
        preferencial: preferencial ? 1 : 0,
        status: 'aguardando',
        aguardando_count: aguardandoCount.count
      };

      broadcastEvent('NOVA_SENHA_EMITIDA', novaSenha);

      // Sync: espelha a nova senha na nuvem para o Portal do Cliente
      syncNovaSenha(novaSenha.id, numero, 'aguardando');

      res.status(201).json(novaSenha);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // OPERADORES ROUTES
  app.post('/api/login', (req, res) => {
    try {
      const { login, senha } = req.body;
      const db = getDb();
      const user = db.prepare('SELECT id, nome, perfil, login FROM operadores WHERE login = ? AND senha_hash = ? AND ativo = 1').get(login, senha) as any;
      
      if (!user) {
        return res.status(401).json({ error: 'Login ou senha incorretos' });
      }
      
      // Token simples para uso local
      const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
      
      res.json({ token, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/operadores', (req, res) => {
    try {
      const db = getDb();
      const operadores = db.prepare('SELECT id, nome, login, perfil, ativo FROM operadores').all();
      res.json(operadores);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/operadores', requireMaster, (req, res) => {
    try {
      const { nome, login, senha, perfil } = req.body;
      const db = getDb();
      const stmt = db.prepare('INSERT INTO operadores (nome, login, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)');
      const result = stmt.run(nome, login, senha, perfil || 'operador');
      res.status(201).json({ id: result.lastInsertRowid, nome, login, perfil });
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

  // NOVA ROTA: O servidor decide atomicamente quem é o próximo da fila
  app.post('/api/chamar-proxima', (req: express.Request, res: express.Response) => {
    try {
      const { operador_id, guiche } = req.body;
      const db = getDb();
      
      console.log(`[ChamarProxima] operador=${operador_id} guiche=${guiche}`);

      // 1. Busca a próxima senha DIRETO DO BANCO (preferencial primeiro, depois por ordem de chegada)
      const proxima = db.prepare(
        `SELECT s.*, b.nome as balcao_nome 
         FROM senhas s 
         JOIN balcoes b ON s.balcao_id = b.id 
         WHERE s.status = 'aguardando' 
         ORDER BY s.preferencial DESC, s.id ASC 
         LIMIT 1`
      ).get() as any;

      if (!proxima) {
        return res.status(404).json({ error: 'Nenhuma senha aguardando na fila.' });
      }

      console.log(`[ChamarProxima] Próxima senha encontrada: id=${proxima.id} numero=${proxima.numero}`);

      // 2. Marca como chamada
      db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?").run(proxima.id);

      // 3. Registra a chamada
      db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, ?, ?)').run(proxima.id, operador_id, guiche);

      // 4. Conta aguardando
      const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get() as any;

      const payload = {
        ...proxima,
        status: 'chamada',
        guiche,
        aguardando_count: aguardandoCount.count
      };

      broadcastEvent('NOVA_SENHA_CHAMADA', payload);

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
  app.post('/api/chamadas', (req: express.Request, res: express.Response) => {
    try {
      const { senha_id, operador_id, guiche } = req.body;
      const db = getDb();
      
      console.log(`[Chamada] senha_id=${senha_id} operador=${operador_id} guiche=${guiche}`);

      // 1. Update ticket status
      const updateSenha = db.prepare("UPDATE senhas SET status = 'chamada', chamada_em = datetime('now') WHERE id = ?");
      updateSenha.run(senha_id);

      // 2. Record the call
      const insertChamada = db.prepare('INSERT INTO chamadas (senha_id, operador_id, guiche) VALUES (?, ?, ?)');
      insertChamada.run(senha_id, operador_id, guiche);

      // 3. Get the ticket details to broadcast
      const senhaInfo = db.prepare(`
        SELECT s.*, b.nome as balcao_nome 
        FROM senhas s 
        JOIN balcoes b ON s.balcao_id = b.id 
        WHERE s.id = ?
      `).get(senha_id) as any;

      console.log('[Chamada] Senha info:', senhaInfo);

      const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get() as any;

      const payload = {
        ...senhaInfo,
        guiche,
        aguardando_count: aguardandoCount.count
      };

      broadcastEvent('NOVA_SENHA_CHAMADA', payload);

      // Sync: atualiza status na nuvem
      syncStatusSenha(senha_id, 'chamada', guiche);

      console.log('[Chamada] Broadcast enviado com sucesso');
      res.json({ success: true, data: payload });
    } catch (err: any) {
      console.error('[Chamada] ERRO:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/senhas/estornar', (req, res) => {
    try {
      const { senha_id } = req.body;
      const db = getDb();
      db.prepare("UPDATE senhas SET status = 'aguardando', chamada_em = NULL WHERE id = ?").run(senha_id);
      
      const aguardandoCount = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'aguardando'").get() as any;
      
      // Notifica todos os painéis
      broadcastEvent('SENHA_ESTORNADA', { id: senha_id, aguardando_count: aguardandoCount.count });

      // Sync: volta status na nuvem
      syncStatusSenha(senha_id, 'aguardando');

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/midias', (req, res) => {
    try {
      const db = getDb();
      const midias = db.prepare('SELECT * FROM midias ORDER BY ordem ASC, id DESC').all();
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

      console.log('Inserting media into DB:', { nome, caminho });

      const stmt = db.prepare('INSERT INTO midias (nome, caminho, tipo, ordem, ativo) VALUES (?, ?, ?, ?, 1)');
      const result = stmt.run(nome || req.file.originalname, caminho, tipo || (req.file.mimetype.startsWith('video') ? 'video' : 'imagem'), ordem || 0);

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

      // Get file path before deleting from DB
      const midia = db.prepare('SELECT caminho FROM midias WHERE id = ?').get(id) as any;
      
      if (midia) {
        const filePath = path.join(process.cwd(), midia.caminho.replace(/^\//, ''));
        console.log('Deleting file:', filePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      db.prepare('DELETE FROM midias WHERE id = ?').run(id);
      broadcastEvent('MIDIAS_ATUALIZADAS', { action: 'delete' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error in DELETE /api/midias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/fila', (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const fila = db.prepare('SELECT * FROM senhas WHERE status = "aguardando" ORDER BY id ASC').all();
      res.json(fila);
    } catch (err: any) {
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

  app.post('/api/configuracoes', requireMaster, (req: express.Request, res: express.Response) => {
    try {
      const configuracoes = req.body;
      const db = getDb();

      // Validação de tamanhos de fonte CSS
      const cssSize = /^(\d+(\.\d+)?)(rem|em|px|vw|vh|%)$/;
      const fontKeys = ['toledo_fonte_descricao', 'toledo_fonte_preco'];
      for (const key of fontKeys) {
        if (configuracoes[key] && !cssSize.test(configuracoes[key])) {
          return res.status(400).json({ error: `Tamanho de fonte inválido para ${key}: ${configuracoes[key]}` });
        }
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
        const filePath = path.join(process.cwd(), req.file.path);
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
      if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/')) {
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
      if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip') || filename.includes('..') || filename.includes('/')) {
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
      const canceladas = db.prepare("SELECT COUNT(*) as count FROM senhas WHERE status = 'nao_compareceu' AND criado_em BETWEEN ? AND ?").get(dateStart, dateEnd) as any;

      // Cálculo de tempo médio de espera em minutos
      // julianday retorna a fração de dias. Multiplicamos por 1440 para converter em minutos (24*60)
      const espera = db.prepare(`
        SELECT AVG((julianday(chamada_em) - julianday(criado_em)) * 1440) as media 
        FROM senhas 
        WHERE status IN ('chamada', 'atendida', 'nao_compareceu') 
        AND chamada_em IS NOT NULL
        AND criado_em BETWEEN ? AND ?
      `).get(dateStart, dateEnd) as any;

      res.json({
        total: total.count || 0,
        atendidas: atendidas.count || 0,
        canceladas: canceladas.count || 0,
        tempoMedioEspera: espera.media || 0
      });
    } catch (err: any) {
      console.error('Relatorio error:', err);
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
      const produtos = db.prepare(
        'SELECT plu, descricao, preco, categoria, atualizado_em FROM toledo_produtos WHERE preco > 0 ORDER BY categoria ASC, descricao ASC'
      ).all();
      res.json(produtos);
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
          'SELECT plu, descricao, preco, categoria FROM toledo_produtos WHERE preco > 0'
        ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string }>;
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
        'SELECT plu, descricao, preco, categoria FROM toledo_produtos WHERE preco > 0'
      ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string }>;
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

  // ── Ordem das categorias no portal do cliente ──────────────────────────────

  app.get('/api/toledo/categorias-ordem', (_req: express.Request, res: express.Response) => {
    try {
      if (fs.existsSync(PERSISTENT_ORDEM_PATH)) {
        const data = JSON.parse(fs.readFileSync(PERSISTENT_ORDEM_PATH, 'utf-8'));
        return res.json(data);
      }

      // Check fallbacks if persistent doesn't exist
      const possiblePaths = [
        path.join(__dirname, '../../server/categorias-ordem.json'),
        path.join(__dirname, 'categorias-ordem.json'),
        path.join(process.cwd(), 'server', 'categorias-ordem.json'),
      ];

      for (const orderPath of possiblePaths) {
        if (fs.existsSync(orderPath)) {
          const data = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
          try {
            if (!fs.existsSync(PERSISTENT_DIR)) fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
            fs.writeFileSync(PERSISTENT_ORDEM_PATH, JSON.stringify(data, null, 2), 'utf-8');
          } catch (e) {}
          return res.json(data);
        }
      }

      res.json([]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/toledo/categorias-ordem', requireMaster, async (req: express.Request, res: express.Response) => {
    try {
      const ordem: string[] = req.body;
      
      if (!fs.existsSync(PERSISTENT_DIR)) {
        fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
      }

      // Write to persistent path
      fs.writeFileSync(PERSISTENT_ORDEM_PATH, JSON.stringify(ordem, null, 2), 'utf-8');

      // Attempt fallbacks
      const possiblePaths = [
        path.join(__dirname, '../../server/categorias-ordem.json'),
        path.join(__dirname, 'categorias-ordem.json'),
        path.join(process.cwd(), 'server', 'categorias-ordem.json'),
      ];
      for (const orderPath of possiblePaths) {
        try {
          fs.writeFileSync(orderPath, JSON.stringify(ordem, null, 2), 'utf-8');
        } catch (e) {}
      }

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

  // Update product description manually (admin)
  app.put('/api/toledo/produtos/:plu', (req, res) => {
    try {
      const { plu } = req.params;
      const { descricao } = req.body;
      const db = getDb();
      
      db.prepare(`UPDATE toledo_produtos SET descricao = ?, atualizado_em = datetime('now', 'localtime') WHERE plu = ?`)
        .run(descricao, plu);
      
      broadcastEvent('TOLEDO_PRECOS_ATUALIZADOS', { action: 'description_update' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════

  // Catch-all 404 handler for API
  app.use('/api', (req, res) => {
    console.warn(`404 - Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.url}` });
  });

  // Serve Frontend to network clients
  const frontendPath = path.join(__dirname, '../../dist');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    // Middleware para SPA: se não for API ou uploads, manda o index.html
    app.use((req, res, next) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
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



  const server = app.listen(PORT, () => {
    console.log('========================================');
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log('========================================');

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
        const logoRelPath = cfg['logo_cliente'].replace(/^\//, ''); // remove leading slash
        const fullLogoPath = path.join(userDataPath, logoRelPath);
        if (fs.existsSync(fullLogoPath)) {
          const base64 = fs.readFileSync(fullLogoPath, 'base64');
          const ext = path.extname(fullLogoPath).toLowerCase().replace('.', '');
          const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const dataUrl = `data:${mimeType};base64,${base64}`;
          syncConfiguracaoPublica('logo_cliente_base64', dataUrl);
          console.log('[STARTUP] ✅ Logo do estabelecimento sincronizada em base64 com Supabase');
        }
      }

      // Sincroniza todos os produtos Toledo ativos no startup para garantir que a nuvem esteja atualizada
      try {
        const produtosCloud = db.prepare(
          'SELECT plu, descricao, preco, categoria FROM toledo_produtos WHERE preco > 0'
        ).all() as Array<{ plu: string; descricao: string; preco: number; categoria: string }>;
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
    } catch (err) {
      console.error('[SUPABASE] Erro ao iniciar sync worker (não crítico):', err);
    }
  });

  serverInstance = server;

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
    console.log(`[BACKUP] ✅ Backup gerado com sucesso: ${zipFile}`);

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
      fs.renameSync(zipFilePath, actualZipPath);
    }
  }

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
  sseClients.forEach(client => client.write(payload));
}

let serverInstance: any = null;
let toledoWatcherCleanup: (() => void) | null | undefined = null;

export function stopServer() {
  console.log('[SERVER] Iniciando desligamento gracioso...');
  
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
    const db = getDb();
    if (db) db.close();
    console.log('[SERVER] SQLite fechado.');
  } catch(e) {
    console.error('Erro ao fechar DB', e);
  }

  if (serverInstance) {
    serverInstance.close(() => {
      console.log('[SERVER] Servidor HTTP Express encerrado.');
    });
  }
}
