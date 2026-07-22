/**
 * CHAMA AÍ - Edge Function para Comandos Remotos Seguros
 * FASE 6 — chamaai-commands
 * FASE 7 — Hardening (Allowlist estrita no poll e ack, e CORS controlado)
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

const ALLOWED_COMMANDS = [
  'CALL_NEXT',
  'REPEAT_LAST',
  'RETURN_TICKET',
  'FINISH_TICKET',
  'CANCEL_TICKET',
  'REFRESH_CONFIG',
  'PING'
];

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

    // 1. Validar o Device Token
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
      return new Response(JSON.stringify({ error: 'Dispositivo não autorizado ou token inválido.' }), {
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

    // 2. Processar Body
    const body = await req.json();
    const { action } = body;

    if (action === 'poll') {
      const limit = Math.min(20, Math.max(1, body.limit || 5));
      const staleClaimCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await adminClient.from('comandos_operador')
        .update({ status: 'pending', claimed_at: null })
        .eq('tenant_id', tenantId)
        .eq('store_id', storeId)
        .eq('status', 'claimed')
        .lt('claimed_at', staleClaimCutoff);

      // Busca comandos pendentes para essa loja/tenant que estão na allowlist
      // Também verifica se a installation_id do comando é nula ou igual a do dispositivo
      const { data: commands, error: fetchError } = await adminClient
        .from('comandos_operador')
        .select('id, command_type, payload, installation_id')
        .eq('tenant_id', tenantId)
        .eq('store_id', storeId)
        .eq('status', 'pending')
        .in('command_type', ALLOWED_COMMANDS)
        .or(`installation_id.is.null,installation_id.eq."${installationId}"`)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (fetchError) {
        console.error("Erro ao buscar comandos:", fetchError);
        return new Response(JSON.stringify({ error: 'Erro ao buscar comandos no banco.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (commands && commands.length > 0) {
        const commandIds = commands.map(c => c.id);
        
        // Marca comandos como claimed
        await adminClient
          .from('comandos_operador')
          .update({
            status: 'claimed',
            claimed_at: new Date().toISOString()
          })
          .in('id', commandIds);
      }

      return new Response(JSON.stringify({
        ok: true,
        commands: commands || []
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } 
    else if (action === 'ack') {
      const { results } = body;

      if (!results || !Array.isArray(results)) {
        return new Response(JSON.stringify({ error: 'Resultados inválidos para ACK.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const allowedFinalStatuses = ['executed', 'failed', 'rejected'];

      for (const res of results) {
        const { id, status, result, error_message } = res;

        if (!id || !allowedFinalStatuses.includes(status)) {
          continue;
        }

        // Executa atualização garantindo tenant/store do token e allowlist do tipo de comando
        await adminClient
          .from('comandos_operador')
          .update({
            status,
            result: result || {},
            error_message: error_message || null,
            executed_at: new Date().toISOString()
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .eq('store_id', storeId)
          .in('command_type', ALLOWED_COMMANDS);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } 
    else {
      return new Response(JSON.stringify({ error: 'Ação inválida.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error("Exceção:", error);
    return new Response(JSON.stringify({ error: 'Erro interno no servidor de comandos.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
