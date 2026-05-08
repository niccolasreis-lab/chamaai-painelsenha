import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { getDb } from '../electron/services/database';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let sseClients: express.Response[] = [];

export function startServer() {
  const PORT = 3000;
  
  // Resolve o caminho de uploads para a pasta de dados do usuário do Electron (persistente)
  let userDataPath: string;
  try {
    const { app: electronApp } = require('electron');
    userDataPath = electronApp.getPath('userData');
  } catch (e) {
    userDataPath = process.cwd(); // Fallback para ambiente puramente Node
  }
  
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

  // Serve static files from uploads folder
  app.use('/uploads', express.static(UPLOADS_DIR));

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

    // --- BACKUP DIÁRIO DE SEGURANÇA (ZIP + Auto-limpeza 5 dias) ---
    try {
      const { execSync } = require('child_process');
      const backupDir = path.join('\\\\serverad\\Santa Paula\\10 - TI', 'ChamaAi_Backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const dataStr = new Date().toISOString().split('T')[0];
      const zipFile = path.join(backupDir, `backup_${dataStr}.zip`);
      
      // Só faz backup se o ZIP do dia ainda não existir
      if (!fs.existsSync(zipFile)) {
        // Cria pasta temporária para montar o conteúdo
        const tempDir = path.join(backupDir, `_temp_${dataStr}`);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Copia o Banco de Dados
        const dbPath = path.join(userDataPath, 'database.sqlite');
        if (fs.existsSync(dbPath)) {
          fs.copyFileSync(dbPath, path.join(tempDir, 'database.sqlite'));
        }
        
        // Copia a pasta de Uploads (Mídias, Logos, etc)
        if (fs.existsSync(UPLOADS_DIR)) {
          fs.cpSync(UPLOADS_DIR, path.join(tempDir, 'uploads'), { recursive: true });
        }
        
        // Compacta em ZIP usando PowerShell nativo do Windows
        try {
          execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFile}' -Force"`, { timeout: 60000 });
          console.log(`[CRON] 📦 Backup diário compactado com sucesso: ${zipFile}`);
        } catch (zipErr) {
          console.error('[CRON] ❌ Erro ao compactar backup:', zipErr);
        }
        
        // Remove a pasta temporária
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanErr) {
          console.error('[CRON] ⚠️ Erro ao limpar pasta temporária:', cleanErr);
        }
      }
      
      // --- AUTO-LIMPEZA: Remove backups com mais de 5 dias ---
      const DIAS_RETER = 5;
      const agora = Date.now();
      const arquivos = fs.readdirSync(backupDir);
      
      for (const arquivo of arquivos) {
        if (!arquivo.startsWith('backup_') || !arquivo.endsWith('.zip')) continue;
        
        const filePath = path.join(backupDir, arquivo);
        const stats = fs.statSync(filePath);
        const idadeDias = (agora - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        
        if (idadeDias > DIAS_RETER) {
          fs.unlinkSync(filePath);
          console.log(`[CRON] 🗑️ Backup antigo removido (${Math.floor(idadeDias)} dias): ${arquivo}`);
        }
      }
    } catch (err) {
      console.error('[CRON] ❌ Erro ao realizar backup diário:', err);
    }
    // ----------------------------------

  });
  // -----------------

  app.get('/api/network-info', (req, res) => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results: string[] = [];

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

  app.post('/api/operadores', (req, res) => {
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

  app.delete('/api/operadores/:id', (req, res) => {
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

  app.post('/api/balcoes', (req, res) => {
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

  app.delete('/api/balcoes/:id', (req, res) => {
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

  app.post('/api/midias', upload.single('file'), (req, res) => {
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

  app.delete('/api/midias/:id', (req, res) => {
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

  app.post('/api/configuracoes', (req: express.Request, res: express.Response) => {
    try {
      const configuracoes = req.body;
      const db = getDb();
      
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
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error saving configs:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // LOGO UPLOAD
  app.post('/api/configuracoes/logo', upload.single('logo'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum logo enviado' });
      
      const db = getDb();
      const logoPath = `/uploads/${req.file.filename}`;
      
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))")
        .run('logo_cliente', logoPath);
        
      broadcastEvent('CONFIG_ATUALIZADA', { logo_cliente: logoPath });
      res.json({ success: true, logoPath });
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // SOM UPLOAD
  app.post('/api/configuracoes/som', upload.single('som'), (req, res) => {
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

  // BACKUP
  app.get('/api/admin/backup', (req, res) => {
    try {
      const db = getDb();
      const tables = ['configuracoes', 'balcoes', 'midias', 'operadores'];
      const backupData: any = {};
      
      for (const table of tables) {
        backupData[table] = db.prepare(`SELECT * FROM ${table}`).all();
      }
      
      res.json(backupData);
    } catch (err: any) {
      console.error('Backup error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RESTORE
  app.post('/api/admin/restore', (req, res) => {
    try {
      const backupData = req.body;
      const db = getDb();
      
      const tables = ['configuracoes', 'balcoes', 'midias', 'operadores'];
      
      const transaction = db.transaction((data: any) => {
        for (const table of tables) {
          if (data[table]) {
            // Sempre limpa a tabela antes de restaurar
            db.prepare(`DELETE FROM ${table}`).run();
            
            // Só tenta inserir se houver dados
            if (data[table].length > 0) {
              const columns = Object.keys(data[table][0]);
              const placeholders = columns.map(() => '?').join(',');
              const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
              
              for (const row of data[table]) {
                stmt.run(Object.values(row));
              }
            }
          }
        }
      });
      
      transaction(backupData);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Restore error:', err);
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
  app.post('/api/reset-senhas', (req, res) => {
    try {
      const db = getDb();
      // 1. Reseta os contadores de todos os balcões
      db.prepare("UPDATE balcoes SET contador_atual = 0").run();
      
      // 2. Limpeza total de senhas e chamadas para um reinício do zero
      db.prepare("DELETE FROM chamadas").run();
      db.prepare("DELETE FROM senhas").run();
      
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
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

export function broadcastEvent(event: string, data: any) {
  const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
  sseClients.forEach(client => client.write(payload));
}
