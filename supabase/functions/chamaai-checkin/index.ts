/**
 * CHAMA AÍ - Edge Function de Check-in
 * FASE 5C
 *
 * Atualiza o status do dispositivo, valida se o device_token
 * continua ativo e retorna o status atualizado da licença.
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
    
    const { data: deviceRow, error: deviceError } = await adminClient
      .from('device_tokens')
      .select('status, expires_at, device_id')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('installation_id', installationId)
      .eq('token_hash', tokenHash)
      .single();

    if (deviceError || !deviceRow) {
      return new Response(JSON.stringify({ error: 'Dispositivo não autorizado ou token inválido.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deviceRow.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Dispositivo revogado ou inativo.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deviceRow.expires_at && new Date(deviceRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token expirado. Reative a licença.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Extrair dados de saúde do body
    const body = await req.json();
    const { app_version, db_version, hostname, local_ip, status } = body;

    const nowIso = new Date().toISOString();

    // 3. Atualizar data de último uso do token
    await adminClient.from('device_tokens').update({ last_used_at: nowIso })
      .eq('installation_id', installationId)
      .eq('token_hash', tokenHash);

    // 4. Atualizar registro do Device
    if (deviceRow.device_id) {
      await adminClient.from('devices').update({
        app_version: app_version || null,
        db_version: db_version || null,
        hostname: hostname || null,
        local_ip: local_ip || null,
        status: status || 'online',
        last_seen_at: nowIso
      }).eq('id', deviceRow.device_id);
    }

    // 5. Buscar Licença atual (opcionalmente atualizar last_checkin_at)
    const { data: license } = await adminClient
      .from('licenses')
      .select('id, status, plan, modules, expires_at')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .limit(1)
      .single();

    if (license) {
      await adminClient.from('licenses').update({ last_checkin_at: nowIso }).eq('id', license.id);
    }

    const { data: portalRow } = await adminClient
      .from('store_public_portals')
      .select('portal_public_token')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();

    return new Response(JSON.stringify({
      ok: true,
      portal_public_token: portalRow?.portal_public_token || null,
      license: license ? {
        status: license.status,
        plan: license.plan,
        modules: license.modules || {},
        expires_at: license.expires_at
      } : {
        status: 'active',
        plan: 'professional',
        modules: {},
        expires_at: null
      },
      next_checkin_seconds: 3600
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Exceção no check-in:", error);
    return new Response(JSON.stringify({ error: 'Erro interno no check-in.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
