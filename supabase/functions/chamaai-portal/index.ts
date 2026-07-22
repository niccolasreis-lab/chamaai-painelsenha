/**
 * CHAMA AÍ - Edge Function para Portal do Cliente Seguro
 * FASE 5B — Portal do Cliente Seguro com portal_public_token
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const allowedOriginsStr = Deno.env.get("ALLOWED_PORTAL_ORIGINS") || "*";

function getCorsHeaders(reqOrigin: string) {
  let allowedOrigin = "*";
  if (allowedOriginsStr !== "*") {
    const list = allowedOriginsStr.split(",").map(o => o.trim());
    if (list.includes(reqOrigin)) {
      allowedOrigin = reqOrigin;
    } else {
      allowedOrigin = list[0] || "null"; // fallback/block
    }
  }
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  };
}

serve(async (req) => {
  const reqOrigin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(reqOrigin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Permite GET ou POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'token é obrigatório.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

    // 1. Validar portal_public_token
    const { data: portalRow, error: portalError } = await adminClient
      .from('store_public_portals')
      .select('*')
      .eq('portal_public_token', token)
      .single();

    if (portalError || !portalRow) {
      return new Response(JSON.stringify({ error: 'Portal não encontrado ou token inválido.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!portalRow.enabled) {
      return new Response(JSON.stringify({ error: 'Portal desativado.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (portalRow.expires_at && new Date(portalRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token do portal expirado.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { tenant_id, store_id, allowed_features } = portalRow;

    // Evita uma escrita a cada polling de 2s; o timestamp é operacional, não
    // participa da consistência da fila.
    const lastUsedAt = portalRow.last_used_at ? new Date(portalRow.last_used_at).getTime() : 0;
    if (!Number.isFinite(lastUsedAt) || Date.now() - lastUsedAt > 5 * 60 * 1000) {
      await adminClient.from('store_public_portals')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', portalRow.id);
    }

    // 2. Determinar o Modo com base nos parâmetros
    const senhaId = url.searchParams.get('ticket') || url.searchParams.get('senha_id');
    const resource = url.searchParams.get('resource');

    if (resource === 'events' && req.method === 'POST') {
      const body = await req.json();
      const ticketId = Number(body.ticket_id);
      const allowedTypes = ['analytics', 'feedback'];
      const allowedEvents = ['visualizacao', 'pdf_download', 'whatsapp_share', 'emoji_rating'];
      if (!Number.isInteger(ticketId)
        || !allowedTypes.includes(body.tipo_evento)
        || !allowedEvents.includes(body.evento)) {
        return new Response(JSON.stringify({ error: 'Evento inválido.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: scopedTicket } = await adminClient
        .from('senhas_publicas')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('store_id', store_id)
        .eq('id', ticketId)
        .maybeSingle();
      if (!scopedTicket) {
        return new Response(JSON.stringify({ error: 'Senha não encontrada para esta loja.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: eventError } = await adminClient.from('feedbacks').insert({
        tenant_id,
        store_id,
        ticket_id: ticketId,
        tipo_evento: body.tipo_evento,
        evento: body.evento,
        valor: typeof body.valor === 'string' ? body.valor : null,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
      });
      if (eventError) {
        return new Response(JSON.stringify({ error: 'Erro ao registrar evento.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // MODO B: status de uma senha específica
    if (senhaId) {
      if (!/^\d+$/.test(senhaId)) {
        return new Response(JSON.stringify({ error: 'Identificador da senha inválido.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const parsedId = Number(senhaId);
      if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
        return new Response(JSON.stringify({ error: 'Identificador da senha inválido.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { data: ticket, error: ticketError } = await adminClient
        .from('senhas_publicas')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('store_id', store_id)
        .eq('id', parsedId)
        .limit(1)
        .maybeSingle();

      if (ticketError || !ticket) {
        return new Response(JSON.stringify({ error: 'Senha não encontrada.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let position = null;
      if (ticket.status === 'aguardando') {
        let ahead = 0;
        const { count: priorityAhead, error: priorityError } = await adminClient
          .from('senhas_publicas')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
          .eq('store_id', store_id)
          .eq('status', 'aguardando')
          .eq('preferencial', true)
          .lt('id', ticket.preferencial ? ticket.id : Number.MAX_SAFE_INTEGER);

        if (!priorityError) {
          ahead += priorityAhead || 0;
          if (!ticket.preferencial) {
            const { count: normalAhead, error: normalError } = await adminClient
              .from('senhas_publicas')
              .select('*', { count: 'exact', head: true })
              .eq('tenant_id', tenant_id)
              .eq('store_id', store_id)
              .eq('status', 'aguardando')
              .eq('preferencial', false)
              .lt('id', ticket.id);
            if (!normalError) position = ahead + (normalAhead || 0) + 1;
          } else {
            position = ahead + 1;
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        ticket: {
          id: ticket.id,
          numero: ticket.numero?.toString() || ticket.id.toString(),
          status: ticket.status,
          position,
          guiche: ticket.guiche || null,
          last_update: ticket.updated_at || ticket.created_at
        }
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // MODO C: produtos públicos Toledo
    if (resource === 'products') {
      const features = allowed_features || {};
      if (!features.products) {
        return new Response(JSON.stringify({ error: 'Visualização de produtos desabilitada para esta loja.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = (page - 1) * limit;

      const { data: products, error: prodError, count } = await adminClient
        .from('toledo_produtos_publicos')
        .select('plu, descricao, preco, categoria', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .eq('store_id', store_id)
        .range(offset, offset + limit - 1)
        .order('descricao', { ascending: true });

      if (prodError) {
        return new Response(JSON.stringify({ error: 'Erro ao buscar catálogo de produtos.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        page,
        limit,
        total: count || 0,
        products
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (resource === 'configs') {
      const { data: configs, error: configError } = await adminClient
        .from('configuracoes_publicas')
        .select('chave, valor')
        .eq('tenant_id', tenant_id)
        .eq('store_id', store_id);

      if (configError) {
        return new Response(JSON.stringify({ error: 'Erro ao buscar configurações públicas.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const configMap = (configs || []).reduce((acc, row) => {
        acc[row.chave] = row.valor;
        return acc;
      }, {} as Record<string, string>);
      return new Response(JSON.stringify({ ok: true, configs: configMap }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // MODO A: resumo da loja / fila
    // Obter dados da loja
    const { data: storeRow } = await adminClient
      .from('stores')
      .select('name')
      .eq('id', store_id)
      .single();

    // Obter configurações públicas (como tema)
    const { data: configs } = await adminClient
      .from('configuracoes_publicas')
      .select('chave, valor')
      .eq('tenant_id', tenant_id)
      .eq('store_id', store_id);

    const themeConfig = configs?.find(c => c.chave === 'tema')?.valor || '{}';
    let theme = { primary_color: '#3B82F6', logo_url: null };
    try {
      theme = { ...theme, ...JSON.parse(themeConfig) };
    } catch (e) {}

    // Obter últimas senhas chamadas (máximo 5)
    const { data: lastCalled } = await adminClient
      .from('senhas_publicas')
      .select('id, numero, guiche, updated_at')
      .eq('tenant_id', tenant_id)
      .eq('store_id', store_id)
      .eq('status', 'chamada')
      .order('updated_at', { ascending: false })
      .limit(5);

    // Obter contagem de senhas aguardando
    const { count: waitingCount } = await adminClient
      .from('senhas_publicas')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('store_id', store_id)
      .eq('status', 'aguardando');

    return new Response(JSON.stringify({
      ok: true,
      store: {
        name: storeRow?.name || 'ChamaAí Loja',
        theme
      },
      queue: {
        last_called: lastCalled?.map(ticket => ({
          id: ticket.id,
          senha_id: ticket.numero?.toString() || ticket.id.toString(),
          guiche: ticket.guiche || '',
          last_update: ticket.updated_at
        })) || [],
        waiting_count: waitingCount || 0
      },
      features: allowed_features || {}
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Exceção no portal:", error);
    return new Response(JSON.stringify({ error: 'Erro interno no portal.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
