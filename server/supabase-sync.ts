/**
 * Supabase Cloud Sync — Ponte de dados para o Portal do Cliente
 * 
 * Sincroniza senhas e produtos Toledo com tabelas públicas no Supabase,
 * permitindo que o app do cliente (Vercel) leia os dados via 4G
 * sem necessidade de tunnel (Cloudflare/Ngrok).
 * 
 * REGRA DE OURO: Todas as operações são fire-and-forget.
 * Se o Supabase estiver fora do ar, o sistema local continua funcionando normalmente.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://npfqnsgjicmxwmurwosu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnFuc2dqaWNteHdtdXJ3b3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODQyNDQsImV4cCI6MjA5MjM2MDI0NH0.wLIFMxZkE9rjGQjZF7eFi0dyDioOGQfg1jfhRy32O90';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Senhas ──────────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza uma senha na tabela pública do Supabase.
 * Chamado quando uma nova senha é emitida no totem.
 */
export async function syncNovaSenha(id: number | bigint, numero: number, status: string = 'aguardando') {
  try {
    const { error } = await supabase
      .from('senhas_publicas')
      .upsert({
        id: Number(id),
        numero,
        status,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
    console.log(`[SUPABASE SYNC] ✅ Senha ${numero} sincronizada (status: ${status})`);
  } catch (err) {
    console.error('[SUPABASE SYNC] ⚠️ Erro ao sincronizar senha (não crítico):', err);
  }
}

/**
 * Atualiza apenas o status de uma senha existente.
 * Chamado quando uma senha é chamada, estornada, etc.
 */
export async function syncStatusSenha(id: number | bigint, status: string, guiche?: string) {
  try {
    const payload: any = {
      status,
      updated_at: new Date().toISOString()
    };
    if (guiche) payload.guiche = guiche;

    const { error } = await supabase
      .from('senhas_publicas')
      .update(payload)
      .eq('id', Number(id));

    if (error) throw error;
    console.log(`[SUPABASE SYNC] ✅ Status da senha ${id} atualizado para: ${status} ${guiche ? `(${guiche})` : ''}`);
  } catch (err) {
    console.error('[SUPABASE SYNC] ⚠️ Erro ao atualizar status (não crítico):', err);
  }
}

/**
 * Limpa todas as senhas públicas.
 * Chamado no reset diário ou reset manual.
 */
export async function syncLimparSenhas() {
  try {
    const { error } = await supabase
      .from('senhas_publicas')
      .delete()
      .gte('id', 0); // Deleta tudo (Supabase exige um filtro)

    if (error) throw error;
    console.log('[SUPABASE SYNC] ✅ Senhas públicas limpas');
  } catch (err) {
    console.error('[SUPABASE SYNC] ⚠️ Erro ao limpar senhas (não crítico):', err);
  }
}

// ── Produtos Toledo ─────────────────────────────────────────────────────────────

/**
 * Sincroniza a lista completa de produtos Toledo com o Supabase.
 * Chamado após cada atualização do arquivo de preços da balança.
 */
export async function syncProdutos(produtos: Array<{ plu: string; descricao: string; preco: number; categoria: string }>) {
  try {
    if (!produtos || produtos.length === 0) return;

    // Supabase tem limite de ~1000 rows por upsert, fazemos em lotes
    const BATCH_SIZE = 500;
    for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
      const batch = produtos.slice(i, i + BATCH_SIZE).map(p => ({
        plu: p.plu,
        descricao: p.descricao,
        preco: p.preco,
        categoria: p.categoria || 'Outros',
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('toledo_produtos_publicos')
        .upsert(batch);

      if (error) throw error;
    }

    console.log(`[SUPABASE SYNC] ✅ ${produtos.length} produtos sincronizados com a nuvem`);
  } catch (err) {
    console.error('[SUPABASE SYNC] ⚠️ Erro ao sincronizar produtos (não crítico):', err);
  }
}

// ── Comandos Remotos (Operador Nuvem) ──────────────────────────────────────────

/**
 * Inicia o loop de monitoramento de comandos enviados pelo Operador Web (Vercel).
 */
export function startSupabaseCommandListener() {
  console.log('[SUPABASE SYNC] 🎧 Iniciando listener de comandos do Operador Nuvem...');
  
  setInterval(async () => {
    try {
      // Busca 1 comando pendente mais antigo
      const { data, error } = await supabase
        .from('comandos_operador')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error || !data) return; // Nenhum comando pendente

      console.log(`[SUPABASE SYNC] 📥 Comando recebido: ${data.comando}`, data.payload);

      // Marca imediatamente como processando para evitar duplicidade
      await supabase.from('comandos_operador').update({ status: 'processando' }).eq('id', data.id);

      // Processa o comando simulando uma requisição local
      const apiUrl = 'http://localhost:3000';
      let res;

      if (data.comando === 'CHAMAR_PROXIMA') {
        res = await fetch(`${apiUrl}/api/chamar-proxima`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.payload)
        });
      } else if (data.comando === 'REPETIR') {
        res = await fetch(`${apiUrl}/api/chamadas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.payload)
        });
      } else if (data.comando === 'ESTORNAR') {
        res = await fetch(`${apiUrl}/api/senhas/estornar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.payload)
        });
      }

      if (res && res.ok) {
        await supabase.from('comandos_operador').update({ status: 'processado' }).eq('id', data.id);
        console.log(`[SUPABASE SYNC] ✅ Comando ${data.id} processado com sucesso.`);
      } else {
        await supabase.from('comandos_operador').update({ status: 'erro' }).eq('id', data.id);
        console.log(`[SUPABASE SYNC] ❌ Comando ${data.id} falhou na execução local.`);
      }

    } catch (e) {
      // Erro silencioso de rede, ignora e tenta no próximo ciclo
    }
  }, 2000); // Poll a cada 2 segundos
}

// ── Configurações Públicas (Portal do Cliente) ────────────────────────────────

export async function syncConfiguracaoPublica(chave: string, valor: string) {
  try {
    const { error } = await supabase
      .from('configuracoes_publicas')
      .upsert({
        chave,
        valor,
        updated_at: new Date().toISOString()
      });
    if (error) throw error;
  } catch (err) {
    console.error(`[SUPABASE SYNC] ⚠️ Erro ao sincronizar configuração ${chave}:`, err);
  }
}
