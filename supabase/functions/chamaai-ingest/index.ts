/**
 * CHAMA AÍ - Edge Function para Ingestão de Dados (Cloud Ingestion)
 * FASE 5A-FINAL — Cloud Ingestion End-to-End
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const allowedOriginsStr = Deno.env.get("ALLOWED_ADMIN_ORIGINS") || "";

function getCorsHeaders(reqOrigin: string) {
  let allowedOrigin = "";
  if (allowedOriginsStr === "*") {
    allowedOrigin = "*";
  } else if (allowedOriginsStr) {
    const list = allowedOriginsStr.split(",").map(o => o.trim());
    if (list.includes(reqOrigin)) {
      allowedOrigin = reqOrigin;
    }
  }
  return {
    'Access-Control-Allow-Origin': allowedOrigin || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-store-id, x-installation-id, x-device-token',
  };
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_TABLES = ['senhas_publicas', 'toledo_produtos_publicos', 'configuracoes_publicas'];
const ALLOWED_ACTIONS = ['upsert', 'update', 'delete', 'delete_all'];

function scopePayload(
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  tenantId: string,
  storeId: string,
  installationId: string,
) {
  const applyScope = (row: Record<string, unknown>) => ({
    ...row,
    tenant_id: tenantId,
    store_id: storeId,
    installation_id: installationId,
  });
  return Array.isArray(payload) ? payload.map(applyScope) : applyScope(payload);
}

serve(async (req) => {
  const reqOrigin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(reqOrigin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const tenantId = req.headers.get('x-tenant-id');
    const storeId = req.headers.get('x-store-id');
    const installationId = req.headers.get('x-installation-id');
    const deviceToken = req.headers.get('x-device-token');

    if (!tenantId || !storeId || !installationId || !deviceToken) {
      return new Response(JSON.stringify({ error: 'Identidade ou token ausentes nos headers.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Erro de configuração no servidor.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // 1. Validar Token do Dispositivo
    const tokenHash = await sha256(deviceToken);
    
    const { data: tokenRow, error: tokenError } = await adminClient
      .from('device_tokens')
      .select('status, expires_at, id')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('installation_id', installationId)
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Token inválido ou não autorizado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (tokenRow.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Dispositivo inativo ou revogado.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expirado. Reative a licença.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Atualiza last_used_at do token
    await adminClient.from('device_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    // 2. Validar Body
    const body = await req.json();
    const { tenant_id: bodyTenantId, store_id: bodyStoreId, installation_id: bodyInstallationId, items } = body;

    if (bodyTenantId !== tenantId || bodyStoreId !== storeId || bodyInstallationId !== installationId) {
      return new Response(JSON.stringify({ error: 'Divergência de Tenant, Loja ou Instalação entre headers e body.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!items || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'Lote de itens inválido.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];
    let allOk = true;

    for (const item of items) {
      const { queue_id, tabela, acao, payload } = item;

      if (!queue_id || !tabela || !acao || !payload) {
        results.push({ queue_id: queue_id || 0, ok: false, status: 'failed', error_code: 'INVALID_STRUCTURE' });
        allOk = false;
        continue;
      }

      if (!ALLOWED_TABLES.includes(tabela)) {
        results.push({ queue_id, ok: false, status: 'failed', error_code: 'TABLE_NOT_ALLOWED' });
        allOk = false;
        continue;
      }

      if (!ALLOWED_ACTIONS.includes(acao)) {
        results.push({ queue_id, ok: false, status: 'failed', error_code: 'ACTION_NOT_ALLOWED' });
        allOk = false;
        continue;
      }

      // Validar payload e injetar dados de tenant/store
      if (acao === 'upsert' || acao === 'update') {
        const payloadRows = Array.isArray(payload) ? payload : [payload];
        const invalidPayload = payloadRows.length === 0
          || payloadRows.some(row => !row || typeof row !== 'object' || Array.isArray(row))
          || (acao !== 'upsert' && Array.isArray(payload));
        if (invalidPayload) {
          results.push({ queue_id, ok: false, status: 'failed', error_code: 'INVALID_PAYLOAD' });
          allOk = false;
          continue;
        }
        const hasScopeMismatch = payloadRows.some(row =>
          (row.tenant_id && row.tenant_id !== tenantId)
          || (row.store_id && row.store_id !== storeId)
        );
        if (hasScopeMismatch) {
          results.push({ queue_id, ok: false, status: 'failed', error_code: 'TENANT_STORE_MISMATCH' });
          allOk = false;
          continue;
        }
      }

      try {
        let dbError = null;

        if (acao === 'upsert') {
          // Garante que o payload tenha tenant_id e store_id e installation_id correto
          const finalPayload = scopePayload(payload, tenantId, storeId, installationId);
          const conflictTarget = tabela === 'senhas_publicas'
            ? 'tenant_id,store_id,id'
            : tabela === 'toledo_produtos_publicos'
              ? 'tenant_id,store_id,plu'
              : 'tenant_id,store_id,chave';
          const { error } = await adminClient.from(tabela).upsert(finalPayload, { onConflict: conflictTarget });
          dbError = error;
        } 
        else if (acao === 'update') {
          // Identificador seguro exigido
          let queryId = null;
          let idField = '';

          if (tabela === 'senhas_publicas') {
            queryId = payload.id || payload.senha_id;
            idField = payload.id ? 'id' : 'senha_id';
          } else if (tabela === 'toledo_produtos_publicos') {
            queryId = payload.plu;
            idField = 'plu';
          } else if (tabela === 'configuracoes_publicas') {
            queryId = payload.chave;
            idField = 'chave';
          }

          if (!queryId) {
            results.push({ queue_id, ok: false, status: 'failed', error_code: 'MISSING_SECURE_IDENTIFIER' });
            allOk = false;
            continue;
          }

          const finalPayload = scopePayload(payload, tenantId, storeId, installationId);

          const { error } = await adminClient.from(tabela).update(finalPayload)
            .eq(idField, queryId)
            .eq('tenant_id', tenantId)
            .eq('store_id', storeId);
          
          dbError = error;
        } 
        else if (acao === 'delete') {
          let queryId = null;
          let idField = '';

          if (tabela === 'senhas_publicas') {
            queryId = payload.id || payload.senha_id;
            idField = payload.id ? 'id' : 'senha_id';
          } else if (tabela === 'toledo_produtos_publicos') {
            queryId = payload.plu;
            idField = 'plu';
          } else if (tabela === 'configuracoes_publicas') {
            queryId = payload.chave;
            idField = 'chave';
          }

          if (!queryId) {
            results.push({ queue_id, ok: false, status: 'failed', error_code: 'MISSING_SECURE_IDENTIFIER' });
            allOk = false;
            continue;
          }

          const { error } = await adminClient.from(tabela).delete()
            .eq(idField, queryId)
            .eq('tenant_id', tenantId)
            .eq('store_id', storeId);

          dbError = error;
        } 
        else if (acao === 'delete_all') {
          // Filtro estrito obrigatório
          let query = adminClient.from(tabela).delete()
            .eq('tenant_id', tenantId)
            .eq('store_id', storeId);

          if (tabela === 'toledo_produtos_publicos') {
            query = query.neq('plu', '');
          } else if (tabela === 'senhas_publicas') {
            query = query.gte('id', 0);
          } else {
            query = query.neq('chave', '');
          }

          const { error } = await query;
          dbError = error;
        }

        if (dbError) {
          console.error(`Erro ao gravar ${tabela} no db:`, dbError);
          results.push({ queue_id, ok: false, status: 'failed', error_code: 'DATABASE_ERROR' });
          allOk = false;
        } else {
          results.push({ queue_id, ok: true, status: 'processed' });
        }
      } catch (err: any) {
        console.error("Exceção processando item:", err);
        results.push({ queue_id, ok: false, status: 'failed', error_code: 'SERVER_EXCEPTION' });
        allOk = false;
      }
    }

    const responseStatus = allOk ? 200 : (results.some(r => r.ok) ? 207 : 400);

    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: responseStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Exceção:", error);
    return new Response(JSON.stringify({ error: 'Erro interno no servidor de ingestão.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
