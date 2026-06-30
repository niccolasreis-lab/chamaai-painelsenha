# Supabase Deploy Checklist

Este checklist orienta a equipe de infraestrutura e DevOps sobre como configurar e implantar com segurança o ChamaAí Cloud Control multi-tenant em um novo ambiente Supabase.

---

## 1. Ordem de Execução de Migrations (SQL)

As migrations devem ser aplicadas sequencialmente na base de dados de produção do Supabase (seja via Supabase CLI com `supabase db push` ou inseridas manualmente no editor SQL do painel administrativo):

1. **`001_multitenant_base.sql`**: Inicializa as tabelas core (`tenants`, `stores`, `licenses`, `devices`), estende as tabelas públicas existentes adicionando as colunas `tenant_id` e `store_id`, e habilita a segurança a nível de linha (RLS) globalmente.
2. **`002_fase5_arquitetura.sql`**: Adiciona as tabelas de gerenciamento de tokens (`store_public_portals` e `device_tokens`) e colunas de controle extras de dispositivos.
3. **`003_comandos_remotos_seguros.sql`**: Adapta a tabela `comandos_operador` adicionando suporte a concorrência e auditoria de comandos.

---

## 2. RLS & Segurança Crítica (Importante)

> [!WARNING]
> **Segredo Administrativo (Service Role Key)**:
> A chave `SUPABASE_SERVICE_ROLE_KEY` bypassa completamente todas as regras de segurança RLS (Row Level Security).
> - **NUNCA** incorpore ou distribua a `service_role` dentro do aplicativo cliente Electron ou frontend Vite.
> - Ela deve residir exclusivamente no ambiente seguro das **Edge Functions** do Supabase ou em backends de infraestrutura isolados.

- A chave pública (`VITE_SUPABASE_KEY` / `anon_key`) é segura para distribuição **apenas** quando o RLS está ativo em todas as tabelas e não existem políticas públicas inseguras (`USING (true)`).
- Como as políticas públicas RLS foram comentadas intencionalmente para evitar vazamentos, o app local interage com a nuvem apenas através de chamadas HTTPS seguras autenticadas via Edge Functions.

---

## 3. Configuração de Secrets das Edge Functions

As Edge Functions do Deno em nuvem precisam ter acesso a secrets de ambiente. Configure-as executando o comando da CLI do Supabase para cada função ou no painel do projeto em **Settings > API > Edge Function Secrets**:

```bash
# Define secrets em produção
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_real
supabase secrets set SUPABASE_URL=sua_supabase_url_real

# Configuração de CORS das Edge Functions
# ALLOWED_ADMIN_ORIGINS controla quem pode acionar chamadas às APIs de Ingestão/Licenciamento
# Em produção, deixe em branco para bloquear chamadas de navegadores (sistema-a-sistema)
supabase secrets set ALLOWED_ADMIN_ORIGINS=

# ALLOWED_PORTAL_ORIGINS controla as origens do portal público conhecidas
supabase secrets set ALLOWED_PORTAL_ORIGINS=https://portal.chamaai.com.br
```

---

## 4. Cadastro de Entidades Core (Exemplo)

Para iniciar uma operação de testes ou onboarding de uma nova filial, execute o provisionamento na nuvem via SQL Editor:

### Passo 4.1: Cadastrar Tenant e Loja
```sql
INSERT INTO tenants (id, name, document, plan, status)
VALUES ('e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b', 'Supermercado Exemplo Ltda', '12.345.678/0001-90', 'premium', 'active');

INSERT INTO stores (id, tenant_id, name, city, state, status)
VALUES ('7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d', 'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b', 'Filial Centro', 'Belo Horizonte', 'MG', 'active');
```

### Passo 4.2: Cadastrar Licença
```sql
INSERT INTO licenses (tenant_id, store_id, license_key, status, plan, expires_at)
VALUES (
  'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b',
  '7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d',
  'CH-****-ABCD', -- Use uma chave mascarada nos logs e BD real
  'active',
  'premium',
  now() + interval '1 year'
);
```

### Passo 4.3: Cadastrar e Rotacionar Portal Token
```sql
INSERT INTO store_public_portals (tenant_id, store_id, portal_public_token, enabled, allowed_features)
VALUES (
  'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b',
  '7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d',
  'pub_****_final',
  true,
  '{"products": true, "queue": true}'::jsonb
);
```

---

## 5. Como Testar Conexões e Ingestão

### Testar Ingestão (Outbox)
Verifique o log do worker local do caixa master. Ao emitir uma senha na loja, ela deve ser inserida na tabela local `supabase_sync_queue` e, em até 5 segundos, enviada para a Edge Function `/chamaai-ingest` autenticada com `x-device-token = dev_****_final`.

### Testar Comandos Remotos (Polling)
Envie um comando pendente na nuvem para a loja correspondente:
```sql
INSERT INTO comandos_operador (tenant_id, store_id, command_type, payload, status)
VALUES (
  'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b',
  '7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d',
  'PING',
  '{}'::jsonb,
  'pending'
);
```
O master local deve baixar o comando em seu próximo ciclo de polling, executar internamente e enviar o ACK atualizando o status para `executed` com o payload de resposta `{ "pong": true }`.

---

## 6. Procedimento de Rollback Básico

Se houver uma falha crítica ao implantar uma nova migration em produção:

1. Desative temporariamente a sincronização local limpando `CHAMAAI_CLOUD_INGEST_URL` no `.env` das lojas afetadas. A operação da loja continuará funcionando offline sem lentidão.
2. Restaure o estado da tabela removendo as últimas alterações via SQL ou restaurando o backup pontual do banco do Supabase.
3. Se um token público de portal for vazado, rotacione-o imediatamente executando:
   ```sql
   UPDATE store_public_portals 
   SET portal_public_token = 'pub_****_nova' 
   WHERE store_id = 'SUA_STORE_UUID';
   ```
