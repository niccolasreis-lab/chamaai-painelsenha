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

import { 
  isSupabaseConfigured, 
  getSupabaseDisabledReason, 
  createSupabaseAnonClient 
} from './services/supabase-config.service';
import { getCloudIdentity, getDeviceToken } from './services/cloud-identity.service';
import { getCloudIngestionConfig, sendCloudIngestionBatch } from './services/cloud-ingestion.service';

// ── Multi-Tenant Context Helpers ──────────────────────────────────────────────

export function getRequiredCloudContext() {
  const identity = getCloudIdentity();
  const isSupabaseConfig = isSupabaseConfigured();
  
  const device_token = getDeviceToken();
  const ingestConfig = getCloudIngestionConfig();
  
  if (!identity.cloud_enabled || !identity.tenant_id || !identity.store_id) {
    return {
      enabled: false,
      tenant_id: identity.tenant_id,
      store_id: identity.store_id,
      installation_id: identity.installation_id,
      device_token: device_token,
      disabledReason: !identity.cloud_enabled ? 'cloud_enabled = false' :
                      !identity.tenant_id ? 'tenant_id ausente' :
                      !identity.store_id ? 'store_id ausente' : 'Erro de identidade cloud'
    };
  }

  // Se a Cloud Ingestion estiver configurada, exige device_token
  if (ingestConfig.url && !device_token) {
    console.warn('[CLOUD INGESTION] ⚠️ Pausado: device_token ausente. Ative a licença/cloud para provisionar o token.');
    return {
      enabled: false,
      tenant_id: identity.tenant_id,
      store_id: identity.store_id,
      installation_id: identity.installation_id,
      device_token: null,
      disabledReason: 'device_token ausente'
    };
  }

  // Se a Cloud Ingestion NÃO estiver configurada, exige a flag legado habilitada OU Supabase Configurado
  if (!ingestConfig.url) {
    if (!ingestConfig.allowDirectSupabaseSync) {
      console.warn('[CLOUD INGESTION] ⚠️ Pausado: CHAMAAI_CLOUD_INGEST_URL ausente e CHAMAAI_ALLOW_DIRECT_SUPABASE_SYNC não habilitado.');
      return {
        enabled: false,
        tenant_id: identity.tenant_id,
        store_id: identity.store_id,
        installation_id: identity.installation_id,
        device_token: device_token,
        disabledReason: 'ingestion cloud ausente'
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        enabled: false,
        tenant_id: identity.tenant_id,
        store_id: identity.store_id,
        installation_id: identity.installation_id,
        device_token: device_token,
        disabledReason: 'Supabase não configurado'
      };
    }
  }

  return {
    enabled: true,
    tenant_id: identity.tenant_id,
    store_id: identity.store_id,
    installation_id: identity.installation_id,
    device_token: device_token,
  };
}

export function withTenantStoreContext(payload: any, context: any): any {
  if (!payload) return payload;
  
  // Se o payload for um array (upsert em lote)
  if (Array.isArray(payload)) {
    return payload.map(item => withTenantStoreContext(item, context));
  }

  // Se o payload original já tiver tenant_id ou store_id, valida se bate
  if (payload.tenant_id && payload.tenant_id !== context.tenant_id) {
    throw new Error(`Divergência de tenant_id no payload: esperado ${context.tenant_id}`);
  }
  if (payload.store_id && payload.store_id !== context.store_id) {
    throw new Error(`Divergência de store_id no payload: esperado ${context.store_id}`);
  }

  return {
    ...payload,
    tenant_id: context.tenant_id,
    store_id: context.store_id,
    installation_id: context.installation_id
  };
}

// Exportando como função para compatibilidade e verificação dinâmica
export { isSupabaseConfigured };

// ── Fila Local de Sincronização (Outbox Pattern) ────────────────────────────────

/**
 * Enfileira uma operação de sincronização no SQLite local.
 * Execução síncrona (<1ms) — nunca bloqueia o fluxo principal.
 */
function enqueueSyncOp(tabela: string, acao: string, payload: any) {
  if (getSupabaseDisabledReason() !== null) return;
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
export function syncNovaSenha(id: number | bigint, numero: number, status: string = 'aguardando', preferencial = false) {
  enqueueSyncOp('senhas_publicas', 'upsert', {
    id: Number(id),
    numero,
    status,
    preferencial,
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
    
    const context = getRequiredCloudContext();
    if (!context.enabled) {
      console.log(`[SYNC WORKER] Sincronização pausada: cloud identity incompleta (${context.disabledReason}).`);
      isSyncRunning = false;
      return;
    }

    const ingestConfig = getCloudIngestionConfig();
    let client: any = null;

    // Só cria o client se formos usar o sync legado e ele estiver permitido
    if (!ingestConfig.url && ingestConfig.allowDirectSupabaseSync) {
      client = createSupabaseAnonClient();
      if (!client) {
        isSyncRunning = false;
        return;
      }
    }

    if (ingestConfig.url) {
      if (!context.device_token) {
        console.warn('[CLOUD INGESTION] Pausado: device_token ausente. Ative a licença/cloud para provisionar o token.');
        isSyncRunning = false;
        return;
      }

      // Prepara batch no formato esperado
      const itemsToIngest = items.map((item: any) => {
        let payload = JSON.parse(item.payload);
        return {
          queue_id: item.id,
          tabela: item.tabela,
          acao: item.acao,
          payload: withTenantStoreContext(payload, context)
        };
      });

      try {
        const res = await sendCloudIngestionBatch(
          context.tenant_id as string, 
          context.store_id as string, 
          context.installation_id as string, 
          context.device_token as string, 
          itemsToIngest
        );

        if (res.status === 200 || res.status === 207 || res.status === 400) {
          try {
            const data = await res.json();
            if (data && Array.isArray(data.results)) {
              for (const r of data.results) {
                if (r.ok) {
                  processedIds.push(r.queue_id);
                } else {
                  failedIds.push(r.queue_id);
                }
              }
            } else {
              failedIds.push(...items.map((i: any) => i.id));
            }
          } catch (e) {
            failedIds.push(...items.map((i: any) => i.id));
          }
        } else if (res.status === 401 || res.status === 403) {
          console.error(`[CLOUD INGESTION] ❌ Falha de Autenticação (${res.status}). Device Token inválido ou revogado. Pausando fila...`);
          networkErrorOccurred = true; // Para não expirar itens injustamente
        } else if (res.status === 409) {
          console.error(`[CLOUD INGESTION] ❌ Divergência de Identidade (${res.status}). Verifique o tenant e store.`);
          networkErrorOccurred = true;
        } else {
          console.error(`[CLOUD INGESTION] ⚠️ Erro inesperado: ${res.status} ${res.statusText}`);
          if (res.status >= 500 || res.status === 429) {
            networkErrorOccurred = true;
          } else {
            failedIds.push(...items.map((i: any) => i.id));
          }
        }
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        const errCode = err?.code || '';
        const isNetworkError = errMessage.includes('fetch failed') || errMessage.includes('NetworkError') || errMessage.includes('Failed to fetch') || errCode === 'UND_ERR_CONNECT_TIMEOUT' || errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errCode === 'ETIMEDOUT';
        
        if (isNetworkError) {
          console.warn('[CLOUD INGESTION] 🌐 Falha de rede detectada (Endpoint Indisponível). Pausando fila temporariamente...');
          networkErrorOccurred = true;
        } else {
          console.error('[CLOUD INGESTION] ⚠️ Falha na execução da requisição:', errMessage);
          failedIds.push(...items.map((i: any) => i.id));
        }
      }
    } 
    // Modo 2: Fallback (Inseguro - Legacy - Somente se explícito via ENV)
    else if (client) {
      for (const item of items) {
        try {
          const payload = JSON.parse(item.payload);
          let error: any = null;

          if (item.acao === 'upsert') {
            const tenantPayload = withTenantStoreContext(payload, context);
            const conflictTarget = item.tabela === 'senhas_publicas'
              ? 'tenant_id,store_id,id'
              : item.tabela === 'toledo_produtos_publicos'
                ? 'tenant_id,store_id,plu'
                : 'tenant_id,store_id,chave';
            const result = await client.from(item.tabela).upsert(tenantPayload, { onConflict: conflictTarget });
            error = result.error;
          } else if (item.acao === 'update') {
            const { id, ...updateData } = payload;
            const tenantUpdateData = withTenantStoreContext(updateData, context);
            const result = await client.from(item.tabela).update(tenantUpdateData)
              .eq('id', id)
              .eq('tenant_id', context.tenant_id)
              .eq('store_id', context.store_id);
            error = result.error;
          } else if (item.acao === 'delete') {
            const { id } = payload;
            const result = await client.from(item.tabela).delete()
              .eq('id', id)
              .eq('tenant_id', context.tenant_id)
              .eq('store_id', context.store_id);
            error = result.error;
          } else if (item.acao === 'delete_all') {
            let result;
            if (item.tabela === 'toledo_produtos_publicos') {
              result = await client.from(item.tabela).delete()
                .neq('plu', '')
                .eq('tenant_id', context.tenant_id)
                .eq('store_id', context.store_id);
            } else {
              result = await client.from(item.tabela).delete()
                .gte('id', 0)
                .eq('tenant_id', context.tenant_id)
                .eq('store_id', context.store_id);
            }
            error = result.error;
          }

          if (error) throw error;
          processedIds.push(item.id);
        } catch (err: any) {
          const errMessage = err?.message || String(err);
          const errCode = err?.code || '';
          
          const isNetworkError = errMessage.includes('fetch failed') || errMessage.includes('NetworkError') || errMessage.includes('Failed to fetch') || errCode === 'UND_ERR_CONNECT_TIMEOUT' || errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errCode === 'ETIMEDOUT';

          if (isNetworkError) {
            console.warn('[SYNC WORKER] 🌐 Falha de rede detectada no modo legado. Pausando fila temporariamente...');
            networkErrorOccurred = true;
            break;
          }
          failedIds.push(item.id);
        }
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
  const ingestConfig = getCloudIngestionConfig();
  if (!ingestConfig.url && ingestConfig.allowDirectSupabaseSync) {
    console.warn('[SYNC WORKER] ⚠️ AVISO: A sincronização direta com o Supabase está ativada. Isso NUNCA deve ser usado em produção!');
  }

  const disabledReason = getSupabaseDisabledReason();
  if (disabledReason) {
    console.log(`[SYNC WORKER] Sincronização inativa: ${disabledReason}`);
    return;
  }
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
export function getLoopbackToken(): string {
  return loopbackToken;
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
    const client = createSupabaseAnonClient();
    if (client) {
      await client.from('comandos_operador').update({ status: 'processando' })
        .eq('id', data.id)
        .eq('tenant_id', data.tenant_id)
        .eq('store_id', data.store_id);
    }

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
      if (client) await client.from('comandos_operador').update({ status: 'processado' })
        .eq('id', data.id)
        .eq('tenant_id', data.tenant_id)
        .eq('store_id', data.store_id);
      console.log(`[SUPABASE CMD] ✅ Comando ${data.id} processado com sucesso.`);
    } else {
      if (client) await client.from('comandos_operador').update({ status: 'erro' })
        .eq('id', data.id)
        .eq('tenant_id', data.tenant_id)
        .eq('store_id', data.store_id);
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
    const client = createSupabaseAnonClient();
    if (!client) return;

    const context = getRequiredCloudContext();
    if (!context.enabled) return;

    const { data, error } = await client
      .from('comandos_operador')
      .select('*')
      .eq('status', 'pendente')
      .eq('tenant_id', context.tenant_id)
      .eq('store_id', context.store_id)
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
  const allowLegacy = process.env.CHAMAAI_ALLOW_LEGACY_SUPABASE_COMMANDS === 'true';
  if (!allowLegacy) {
    console.log('[COMMANDS] Listener Supabase Realtime legado desativado. Usando Cloud Commands Polling.');
    return;
  }

  console.warn('[SUPABASE CMD] ⚠️ AVISO: O listener Realtime do Supabase legado está ativo! Isso não é recomendado para produção.');

  const disabledReason = getSupabaseDisabledReason();
  if (disabledReason) {
    console.log(`[SUPABASE CMD] Listener inativo: ${disabledReason}`);
    return;
  }
  
  const client = createSupabaseAnonClient();
  if (!client) return;
  console.log('[SUPABASE CMD] 🎧 Iniciando listener Realtime de comandos...');

  // Limpa listeners anteriores
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
  }

  // Canal Realtime — recebe INSERT na tabela comandos_operador com status 'pendente'
  realtimeChannel = client
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
        const context = getRequiredCloudContext();
        
        // Verifica na chegada do websocket se o comando pertence a este tenant/store
        if (!context.enabled || data.tenant_id !== context.tenant_id || data.store_id !== context.store_id) {
          return;
        }

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
  const client = createSupabaseAnonClient();
  if (realtimeChannel && client) {
    try {
      client.removeChannel(realtimeChannel);
    } catch (e) {}
    realtimeChannel = null;
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  
  // Desconectar explicitamente o WebSocket do Supabase para evitar manter o event loop ativo
  try {
    if (client && client.realtime && typeof client.realtime.disconnect === 'function') {
      client.realtime.disconnect();
      console.log('[SUPABASE CMD] Conexão WebSocket Realtime desconectada.');
    }
  } catch (e) {
    console.error('Erro ao desconectar Realtime do Supabase:', e);
  }

  console.log('[SUPABASE CMD] Listener Realtime encerrado.');
}
