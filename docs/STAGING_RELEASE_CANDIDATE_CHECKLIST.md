# Checklist de Homologação em Staging e Release Candidate

Este checklist serve para homologar a versão **Release Candidate (RC)** da arquitetura multi-tenant do ChamaAí em ambiente de Staging (ambiente idêntico à produção).

---

## 1. Configuração do Ambiente Cloud (Supabase Staging)

- [ ] **Aplicar Migrations**: Executar no SQL Editor (ou via CLI de Staging) as migrations:
  - [ ] `001_multitenant_base.sql`
  - [ ] `002_fase5_arquitetura.sql`
  - [ ] `003_comandos_remotos_seguros.sql`
- [ ] **Deploy das Edge Functions**: Executar o deploy das 5 funções no Supabase:
  - `supabase functions deploy chamaai-activate-license`
  - `supabase functions deploy chamaai-checkin`
  - `supabase functions deploy chamaai-ingest`
  - `supabase functions deploy chamaai-portal`
  - `supabase functions deploy chamaai-commands`
- [ ] **Configurar Secrets de Ambiente**:
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (Chave administrativa real do projeto de staging)
  - [ ] `SUPABASE_URL` (URL real do projeto de staging)
  - [ ] `ALLOWED_PORTAL_ORIGINS` (Origem do portal público para controle de CORS, ex: `https://staging-portal.chamaai.com.br`)
  - [ ] `ALLOWED_ADMIN_ORIGINS` (Deixar vazio para bloquear CORS de navegadores nas funções administrativas em staging/produção)

---

## 2. Provisionamento do Tenant de Testes

- [ ] **Criar Tenant**: Inserir uma linha na tabela `tenants`.
- [ ] **Criar Loja (Store)**: Inserir uma linha na tabela `stores` apontando para o tenant criado.
- [ ] **Criar Licença**: Inserir uma licença ativa em `licenses` apontando para tenant/store, com chave `CH-****-ABCD` (exemplificada).
- [ ] **Criar Portal do Cliente**: Inserir um portal em `store_public_portals` gerando o token `pub_****_final`.

---

## 3. Configuração e Ativação do Caixa Master Local

- [ ] **Configurar `.env` local**:
  - `CHAMAAI_CLOUD_INGEST_URL=https://<id-staging>.functions.supabase.co/chamaai-ingest`
  - `CHAMAAI_CLOUD_ACTIVATE_URL=https://<id-staging>.functions.supabase.co/chamaai-activate-license`
  - `CHAMAAI_CLOUD_CHECKIN_URL=https://<id-staging>.functions.supabase.co/chamaai-checkin`
  - `CHAMAAI_CLOUD_COMMANDS_URL=https://<id-staging>.functions.supabase.co/chamaai-commands`
  - `CHAMAAI_CLOUD_COMMANDS_INTERVAL_SECONDS=10`
  - `CHAMAAI_ALLOW_DIRECT_SUPABASE_SYNC=false`
  - `CHAMAAI_ALLOW_LEGACY_SUPABASE_COMMANDS=false`
- [ ] **Executar Ativação de Licença**: Chamar `POST /api/cloud/activate` com a chave de teste cadastrada.
- [ ] **Validar Recebimento de Token**:
  - [ ] O token `device_token` local foi salvo no SQLite `cloud_installation`.
  - [ ] A resposta do endpoint retornou `has_device_token: true` e **não** expôs o token puro ou license key em texto claro.
- [ ] **Auditar Logs de Ativação**: Verificar que em nenhum arquivo de log ou saída do console constam a chave de licença ou o token puro gerado.

---

## 4. Fluxo de Dados e Portal do Cliente

- [ ] **Emitir Senha**: Emitir uma senha local de teste no Totem.
- [ ] **Validar Outbox**:
  - [ ] Senha entra em `supabase_sync_queue` no SQLite local.
  - [ ] Registro some do SQLite local em até 5 segundos.
- [ ] **Validar Ingestão Cloud**:
  - [ ] A senha aparece na tabela `senhas_publicas` do Supabase de staging.
  - [ ] O registro está devidamente carimbado com os UUIDs corretos de `tenant_id` e `store_id`.
- [ ] **Validar Portal do Cliente**:
  - [ ] O ticket impresso exibe o QR Code correto contendo `token=pub_****_final`.
  - [ ] Acessar o Portal do Cliente simulado informando o token.
  - [ ] O portal renderiza o status da senha com sucesso sem vazar informações de outros inquilinos.

---

## 5. Fluxo de Comandos Remotos

- [ ] **Validar Comando PING**:
  - [ ] Cadastrar comando `PING` na nuvem com status `pending`.
  - [ ] Validar que o Caixa Master baixa o comando em até 10 segundos.
  - [ ] Validar que o comando muda para `executed` na nuvem e o resultado contém `{ "pong": true }`.
- [ ] **Validar Comando Permitido (CALL_NEXT)**:
  - [ ] Cadastrar comando `CALL_NEXT` na nuvem.
  - [ ] Validar execução local (operador chama senha).
  - [ ] Confirmar o `ack` de status `executed` enviado à nuvem.
- [ ] **Validar Comando Bloqueado (Allowlist)**:
  - [ ] Inserir um comando malicioso fictício na nuvem (ex: `DROP TABLE` ou `RUN_SCRIPT`).
  - [ ] Validar que o Caixa Master local recusa a execução de imediato e responde no `ack` com status `rejected`.
  - [ ] Validar que a Edge Function `chamaai-commands` também filtrou e rejeitou o comando com base na allowlist.

---

## 6. Resiliência Offline (Offline-First)

- [ ] **Validar Queda de Internet**:
  - [ ] Desconectar o cabo de rede ou parar o endpoint de staging.
  - [ ] Emitir e chamar senhas localmente.
  - [ ] Validar que o painel e totem locais **funcionam normalmente** sem travamentos.
  - [ ] Validar que o outbox do SQLite local retém as operações e o worker entra em pausa graciosamente.
- [ ] **Validar Retorno da Internet**:
  - [ ] Reconectar a rede/endpoint.
  - [ ] Validar que o worker retoma a sincronização automaticamente e processa os dados acumulados.
- [ ] **Auditar Vazamento de Tokens**:
  - [ ] Fazer uma varredura completa nos logs locais e garantir que **nenhum** `device_token`, `portal_public_token` ou `x-loopback-token` real conste nos logs de erro ou de rede.
