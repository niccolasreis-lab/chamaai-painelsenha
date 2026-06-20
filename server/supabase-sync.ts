/**
 * Supabase Cloud Sync — Ponte de dados para o Portal do Cliente
 * 
 * Sincroniza senhas e produtos Toledo com tabelas públicas no Supabase,
 * permitindo que o app do cliente (Vercel) leia os dados via 4G
 * sem necessidade de tunnel (Cloudflare/Ngrok).
 * 
 * ARQUITETURA (Outbox Pattern):
 * 1. As funções públicas (syncNovaSenha, syncStatusSenha, etc.) gravam na
 *    tabela local `supabase_sync_queue` do SQLite — operação síncrona e instantânea.
 * 2. Um worker em background (`startSyncWorker`) consome essa fila a cada 5 segundos,
 *    enviando os dados para o Supabase em lotes.
 * 3. Se a internet estiver offline, os dados ficam seguros no SQLite até reconectar.
 * 
 * COMANDOS REMOTOS (Realtime):
 * O listener de comandos usa Supabase Realtime (WebSocket) para receber
 * comandos do operador na nuvem instantaneamente, com fallback de polling a cada 30s.
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load default .env from current working directory
dotenv.config();

// Try loading from the persistent data directory C:\ChamaAi\.env
const prodEnvPath = 'C:\\ChamaAi\\.env';
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath });
}

// Chaves padrão do Supabase de fallback caso não estejam configuradas no .env
const DEFAULT_SUPABASE_URL = 'https://npfqnsgjicmxwmurwosu.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnFuc2dqaWNteHdtdXJ3b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODQyNDQsImV4cCI6MjA5MjM2MDI0NH0.wLIFMxZkE9rjGQjZF7eFi0dyDioOGQfg1jfhRy32O90';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || DEFAULT_SUPABASE_KEY;

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

// Inicializa o cliente com as credenciais válidas ou padrão
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Fila Local de Sincronização (Outbox Pattern) ────────────────────────────────

/**
 * Enfileira uma operação de sincronização no SQLite local.
 * Execução síncrona (<1ms) — nunca bloqueia o fluxo principal.
 */
function enqueueSyncOp(tabela: string, acao: string, payload: any) {
  if (!isSupabaseConfigured) return;
  try {
    const { getDb } = require('../electron/services/database');
    const db = getDb();
    db.prepare(
      'INSERT INTO supabase_sync_queue (tabela, acao, payload) VALUES (?, ?, ?)'
    ).run(tabela, acao, JSON.stringify(payload));

    // Executa o sync worker imediatamente em background para latência próxima a zero
    setTimeout(() => {
      processSyncQueue().catch(err => console.error('[SYNC QUEUE] ⚠️ Erro no processamento imediato:', err));
    }, 50);
  } catch (err) {
    console.error('[SYNC QUEUE] ⚠️ Erro ao enfileirar operação (não crítico):', err);
  }
}

// ── Funções Públicas (gravam na fila local) ─────────────────────────────────────

/**
 * Cria ou atualiza uma senha na tabela pública do Supabase.
 * Chamado quando uma nova senha é emitida no totem.
 */
export function syncNovaSenha(id: number | bigint, numero: number, status: string = 'aguardando') {
  enqueueSyncOp('senhas_publicas', 'upsert', {
    id: Number(id),
    numero,
    status,
    updated_at: new Date().toISOString()
  });
  console.log(`[SYNC QUEUE] 📥 Senha ${numero} enfileirada para sync (status: ${status})`);
}

/**
 * Atualiza apenas o status de uma senha existente.
 * Chamado quando uma senha é chamada, estornada, etc.
 */
export function syncStatusSenha(id: number | bigint, status: string, guiche?: string) {
  const payload: any = {
    id: Number(id),
    status,
    updated_at: new Date().toISOString()
  };
  if (guiche) payload.guiche = guiche;

  enqueueSyncOp('senhas_publicas', 'update', payload);
  console.log(`[SYNC QUEUE] 📥 Status senha ${id} → ${status} enfileirado`);
}

/**
 * Limpa todas as senhas públicas.
 * Chamado no reset diário ou reset manual.
 */
export function syncLimparSenhas() {
  enqueueSyncOp('senhas_publicas', 'delete_all', {});
  console.log('[SYNC QUEUE] 📥 Limpeza de senhas enfileirada');
}

/**
 * Sincroniza a lista completa de produtos Toledo com o Supabase.
 * Chamado após cada atualização do arquivo de preços da balança.
 */
export function syncProdutos(produtos: Array<{ plu: string; descricao: string; preco: number; categoria: string }>) {
  if (!produtos || produtos.length === 0) return;

  // Enfileira a limpeza de produtos para garantir sincronização limpa (apenas itens locais ativos)
  enqueueSyncOp('toledo_produtos_publicos', 'delete_all', {});

  // Enfileira em lotes de 500 para respeitar limites do Supabase
  const BATCH_SIZE = 500;
  for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
    const batch = produtos.slice(i, i + BATCH_SIZE).map(p => ({
      plu: p.plu,
      descricao: p.descricao,
      preco: p.preco,
      categoria: p.categoria || 'Outros',
      updated_at: new Date().toISOString()
    }));
    enqueueSyncOp('toledo_produtos_publicos', 'upsert', batch);
  }
  console.log(`[SYNC QUEUE] 📥 ${produtos.length} produtos enfileirados para sync (com limpeza prévia)`);
}

/**
 * Sincroniza uma configuração pública (portal do cliente).
 */
export function syncConfiguracaoPublica(chave: string, valor: string) {
  enqueueSyncOp('configuracoes_publicas', 'upsert', {
    chave,
    valor,
    updated_at: new Date().toISOString()
  });
}

/**
 * Sincroniza a tabela inteira de categorias com o Supabase.
 */
export function syncCatalogoCategorias() {
  try {
    const { getDb } = require('../electron/services/database');
    const db = getDb();
    const categorias = db.prepare(
      "SELECT id, nome, slug, emoji, ordem, ativo FROM categorias WHERE deleted_at IS NULL"
    ).all() as any[];

    enqueueSyncOp('categorias_publicas', 'delete_all', {});

    const BATCH_SIZE = 500;
    for (let i = 0; i < categorias.length; i += BATCH_SIZE) {
      const batch = categorias.slice(i, i + BATCH_SIZE).map(c => ({
        id: c.id,
        nome: c.nome,
        slug: c.slug,
        emoji: c.emoji || '',
        ordem: c.ordem || 0,
        ativo: c.ativo ? 1 : 0,
        updated_at: new Date().toISOString()
      }));
      enqueueSyncOp('categorias_publicas', 'upsert', batch);
    }
    console.log(`[SYNC QUEUE] 📥 ${categorias.length} categorias enfileiradas para sync`);
  } catch (err) {
    console.error('[SYNC QUEUE] Erro ao sincronizar categorias:', err);
  }
}

/**
 * Sincroniza a tabela inteira de produtos com o Supabase.
 */
export function syncCatalogoProdutos() {
  try {
    const { getDb } = require('../electron/services/database');
    const db = getDb();
    const produtos = db.prepare(
      "SELECT id, plu, nome, slug, preco, unidade, categoria_id, status, ordem, tags FROM produtos WHERE deleted_at IS NULL"
    ).all() as any[];

    enqueueSyncOp('produtos_publicos', 'delete_all', {});

    const BATCH_SIZE = 500;
    for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
      const batch = produtos.slice(i, i + BATCH_SIZE).map(p => ({
        id: p.id,
        plu: p.plu || null,
        nome: p.nome,
        slug: p.slug || null,
        preco: p.preco || 0,
        unidade: p.unidade || 'kg',
        categoria_id: p.categoria_id || null,
        status: p.status ? 1 : 0,
        ordem: p.ordem || 0,
        tags: p.tags || null,
        updated_at: new Date().toISOString()
      }));
      enqueueSyncOp('produtos_publicos', 'upsert', batch);
    }
    console.log(`[SYNC QUEUE] 📥 ${produtos.length} produtos enfileirados para sync`);
  } catch (err) {
    console.error('[SYNC QUEUE] Erro ao sincronizar produtos:', err);
  }
}

/**
 * Enfileira a exclusão de um produto ou categoria na nuvem.
 */
export function syncDeleteCatalogoItem(tabela: 'produtos_publicos' | 'categorias_publicas', id: number) {
  enqueueSyncOp(tabela, 'delete', { id });
  console.log(`[SYNC QUEUE] 📥 Item ${id} da tabela ${tabela} enfileirado para exclusão`);
}

// ── Sync Worker (consome a fila e envia para o Supabase) ────────────────────────

let syncWorkerTimer: NodeJS.Timeout | null = null;
let isSyncRunning = false;

async function processSyncQueue() {
  if (isSyncRunning) return; // Evita execuções paralelas
  isSyncRunning = true;

  try {
    const { getDb } = require('../electron/services/database');
    const db = getDb();

    // Busca até 20 itens pendentes (FIFO)
    const items = db.prepare(
      'SELECT * FROM supabase_sync_queue WHERE tentativas < max_tentativas ORDER BY id ASC LIMIT 20'
    ).all() as any[];

    if (items.length === 0) {
      isSyncRunning = false;
      return;
    }

    const processedIds: number[] = [];
    const failedIds: number[] = [];
    let networkErrorOccurred = false;

    for (const item of items) {
      try {
        const payload = JSON.parse(item.payload);
        let error: any = null;

        if (item.acao === 'upsert') {
          const result = await supabase.from(item.tabela).upsert(payload);
          error = result.error;
        } else if (item.acao === 'update') {
          // Para updates, extraímos o id do payload e atualizamos
          const { id, ...updateData } = payload;
          const result = await supabase.from(item.tabela).update(updateData).eq('id', id);
          error = result.error;
        } else if (item.acao === 'delete') {
          const { id } = payload;
          const result = await supabase.from(item.tabela).delete().eq('id', id);
          error = result.error;
        } else if (item.acao === 'delete_all') {
          let result;
          if (item.tabela === 'toledo_produtos_publicos') {
            result = await supabase.from(item.tabela).delete().neq('plu', '');
          } else {
            result = await supabase.from(item.tabela).delete().gte('id', 0);
          }
          error = result.error;
        }

        if (error) {
          throw error;
        }

        processedIds.push(item.id);
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        const errCode = err?.code || '';
        
        // Detecta falhas de infraestrutura (rede, timeout, dns)
        const isNetworkError = 
          errMessage.includes('fetch failed') ||
          errMessage.includes('NetworkError') ||
          errMessage.includes('Failed to fetch') ||
          errCode === 'UND_ERR_CONNECT_TIMEOUT' ||
          errCode === 'ENOTFOUND' ||
          errCode === 'ECONNREFUSED' ||
          errCode === 'ETIMEDOUT';

        if (isNetworkError) {
          console.warn('[SYNC WORKER] 🌐 Falha de rede detectada. Pausando fila temporariamente...');
          networkErrorOccurred = true;
          break; // Sai do loop para não penalizar as outras mensagens e pausa a fila
        }

        // Outros erros (ex: erro de schema, permissão, etc) — incrementa tentativas do item específico
        failedIds.push(item.id);
      }
    }

    // Remove itens processados com sucesso
    if (processedIds.length > 0) {
      const placeholders = processedIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM supabase_sync_queue WHERE id IN (${placeholders})`).run(...processedIds);
      console.log(`[SYNC WORKER] ✅ ${processedIds.length} operações sincronizadas com sucesso`);
    }

    // Incrementa tentativas dos que falharam
    if (failedIds.length > 0) {
      const placeholders = failedIds.map(() => '?').join(',');
      db.prepare(`UPDATE supabase_sync_queue SET tentativas = tentativas + 1 WHERE id IN (${placeholders})`).run(...failedIds);
      console.log(`[SYNC WORKER] ⚠️ ${failedIds.length} operações falharam (tentando novamente depois)`);
    }

    // Evita expirar itens se o problema for de rede, pois as tentativas falsamente aumentaram em sessões passadas.
    // Assim que a rede voltar, networkErrorOccurred será false e os descartes corretos acontecerão.
    if (!networkErrorOccurred) {
      // Remove itens que excederam o limite de tentativas (evita acúmulo infinito)
      const expired = db.prepare(
        'DELETE FROM supabase_sync_queue WHERE tentativas >= max_tentativas RETURNING id, tabela, acao'
      ).all() as any[];
      if (expired.length > 0) {
        console.error(`[SYNC WORKER] ❌ ${expired.length} operações descartadas após exceder tentativas:`, 
          expired.map((e: any) => `${e.tabela}/${e.acao}`).join(', '));
      }
    }

  } catch (err) {
    // Erro geral (ex: banco inacessível) — silencioso
    console.error('[SYNC WORKER] Erro geral ao processar fila:', err);
  } finally {
    isSyncRunning = false;
  }
}

export function startSyncWorker() {
  if (!isSupabaseConfigured) return;
  console.log('[SYNC WORKER] 🚀 Worker de sincronização iniciado (intervalo: 5s)');
  if (syncWorkerTimer) clearInterval(syncWorkerTimer);
  
  // Processa imediatamente ao iniciar (caso haja itens pendentes de antes)
  processSyncQueue();
  
  syncWorkerTimer = setInterval(processSyncQueue, 5000);
}

export function stopSyncWorker() {
  if (syncWorkerTimer) {
    clearInterval(syncWorkerTimer);
    syncWorkerTimer = null;
    console.log('[SYNC WORKER] Worker de sincronização parado.');
  }
}

// ── Comandos Remotos (Operador Nuvem via Realtime + Fallback Poll) ──────────────

let loopbackToken = '';
export function setLoopbackToken(token: string) {
  loopbackToken = token;
}

let realtimeChannel: any = null;
let fallbackTimer: NodeJS.Timeout | null = null;

/**
 * Processa um comando recebido do Supabase (usado tanto pelo Realtime quanto pelo fallback poll).
 */
async function processarComandoRemoto(data: any) {
  try {
    console.log(`[SUPABASE CMD] 📥 Comando recebido: ${data.comando}`, data.payload);

    // Marca imediatamente como processando para evitar duplicidade
    await supabase.from('comandos_operador').update({ status: 'processando' }).eq('id', data.id);

    // Processa o comando simulando uma requisição local
    const apiUrl = 'http://localhost:3001';
    let res;

    if (data.comando === 'CHAMAR_PROXIMA') {
      res = await fetch(`${apiUrl}/api/chamar-proxima`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-loopback-token': loopbackToken
        },
        body: JSON.stringify(data.payload)
      });
    } else if (data.comando === 'REPETIR') {
      res = await fetch(`${apiUrl}/api/chamadas`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-loopback-token': loopbackToken
        },
        body: JSON.stringify(data.payload)
      });
    } else if (data.comando === 'ESTORNAR') {
      res = await fetch(`${apiUrl}/api/senhas/estornar`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-loopback-token': loopbackToken
        },
        body: JSON.stringify(data.payload)
      });
    }

    if (res && res.ok) {
      await supabase.from('comandos_operador').update({ status: 'processado' }).eq('id', data.id);
      console.log(`[SUPABASE CMD] ✅ Comando ${data.id} processado com sucesso.`);
    } else {
      await supabase.from('comandos_operador').update({ status: 'erro' }).eq('id', data.id);
      console.log(`[SUPABASE CMD] ❌ Comando ${data.id} falhou na execução local.`);
    }
  } catch (e) {
    console.error('[SUPABASE CMD] Erro ao processar comando:', e);
  }
}

/**
 * Fallback poll — busca comandos pendentes a cada 30s.
 * Garante que nenhum comando fique "preso" caso o WebSocket desconecte.
 */
async function fallbackPollComandos() {
  try {
    const { data, error } = await supabase
      .from('comandos_operador')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error || !data || data.length === 0) return;

    for (const cmd of data) {
      await processarComandoRemoto(cmd);
    }
  } catch (e) {
    // Erro silencioso de rede — tenta no próximo ciclo
  }
}

/**
 * Inicia o listener de comandos usando Supabase Realtime (WebSocket).
 * Com fallback de polling a cada 30 segundos.
 */
export function startSupabaseCommandListener() {
  if (!isSupabaseConfigured) return;
  console.log('[SUPABASE CMD] 🎧 Iniciando listener Realtime de comandos...');

  // Limpa listeners anteriores
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
  }

  // Canal Realtime — recebe INSERT na tabela comandos_operador com status 'pendente'
  realtimeChannel = supabase
    .channel('comandos-locais')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comandos_operador',
        filter: 'status=eq.pendente'
      },
      async (payload: any) => {
        const data = payload.new;
        console.log(`[SUPABASE CMD] ⚡ Comando recebido via Realtime: ${data.comando}`);
        await processarComandoRemoto(data);
      }
    )
    .subscribe((status: string) => {
      console.log(`[SUPABASE CMD] Canal Realtime status: ${status}`);
    });

  // Fallback poll — a cada 30s verifica se há comandos "presos"
  fallbackPollComandos(); // Executa imediatamente ao iniciar
  fallbackTimer = setInterval(fallbackPollComandos, 30000);

  console.log('[SUPABASE CMD] ✅ Listener Realtime + Fallback (30s) ativados.');
}

export function stopSupabaseCommandListener() {
  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch (e) {}
    realtimeChannel = null;
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  
  // Desconectar explicitamente o WebSocket do Supabase para evitar manter o event loop ativo
  try {
    if (supabase && supabase.realtime && typeof supabase.realtime.disconnect === 'function') {
      supabase.realtime.disconnect();
      console.log('[SUPABASE CMD] Conexão WebSocket Realtime desconectada.');
    }
  } catch (e) {
    console.error('Erro ao desconectar Realtime do Supabase:', e);
  }

  console.log('[SUPABASE CMD] Listener Realtime encerrado.');
}
