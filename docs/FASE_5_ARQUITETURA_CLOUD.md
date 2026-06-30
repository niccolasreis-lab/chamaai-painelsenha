# FASE 5: Arquitetura Segura de Cloud Ingestion, Portal do Cliente e Licenciamento

## 1. Objetivo da FASE 5
Estabelecer um canal definitivo e seguro de comunicação entre o aplicativo desktop (ChamaAí Local Master) e a nuvem (Supabase), permitindo:
- **Cloud Ingestion:** Inserção e atualização de dados no Supabase.
- **Portal do Cliente:** Leitura segura de dados públicos por loja sem vazamentos.
- **Licenciamento:** Ativação, validação contínua e gerenciamento de dispositivos de cada cliente de forma escalável.

## 2. Contexto e Risco Atual
- **Fluxo Atual:** O ChamaAí prepara payloads multi-tenant perfeitamente e os insere numa fila `outbox` local no SQLite. Contudo, ele utiliza as bibliotecas cliente do Supabase com a `anon_key`.
- **Risco Atual:** Usar apenas a `anon_key` para gravar requer que as políticas RLS permitam a escrita, o que é muito inseguro (qualquer um que roubasse a `anon_key` poderia forjar `tenant_id` e escrever dados falsos de outras lojas). Por restrições estritas do projeto, a `service_role` (que desvia a proteção) nunca deve ser embarcada no Electron localmente. Logo, a inserção direta vai falhar nas configurações atuais (já que não há policies `USING (true)`).

## 3. Arquitetura Recomendada: Cloud API (Supabase Edge Functions)
A estratégia mais limpa e escalável para o ecossistema atual do Supabase é a adoção de **Supabase Edge Functions**.
- O ChamaAí Local enviará payloads via HTTP genérico para as *Edge Functions*.
- A *Edge Function* funcionará como uma API isolada. Ela receberá o request, extrairá a identidade (`installation_id`, `tenant_id`, `store_id`), e um `device_token` seguro para comprovar autenticidade.
- Se autorizado, a própria *Edge Function* usará a `service_role` em ambiente de backend isolado, realizando inserções diretas no banco relacional PostgreSQL contornando a RLS anônima com extrema segurança.

### Por que não enviar a `service_role` no Electron?
A chave `service_role` pode realizar operações em tabelas administrativas e reescrever lógicas e esquemas. Caso estivesse no executável do Electron, hackers ou concorrentes fariam engenharia reversa para extraí-la e comprometer a base de dados central do SaaS.

## 4. Diagrama Textual do Fluxo

```text
===================================================
1. LICENCIAMENTO (Ativação e Boot)
===================================================
ChamaAí Local Master
  ↓ POST license_key + installation_id
Cloud Activation Endpoint (Edge Function)
  ↓ valida license e verifica tabelas do SaaS
Supabase/Postgres
  ↓ retorna tenant/store/device_token_hash
ChamaAí Local salva identidade e inicia o loop

===================================================
2. CLOUD INGESTION (Outbox Sync)
===================================================
Outbox SQLite (Loop de Sync Local)
  ↓ POST payload + device_token
Cloud Ingestion Endpoint (Edge Function)
  ↓ valida device_token + tenant_id + store_id
Supabase/Postgres (Backend admin c/ Service Role)
  ↓ grava senhas_publicas/produtos/configs
  ✅ Retorna HTTP 200 OK

===================================================
3. PORTAL DO CLIENTE (Leitura)
===================================================
Cliente no Supermercado lê QR Code
  ↓ Acessa URL: /portal/pub_****_final (portal_public_token)
Cloud Public Portal Endpoint (Edge Function ou Edge Config)
  ↓ pesquisa token em `store_public_portals`
  ↓ retorna APENAS dados públicos filtrados por store_id
Cliente acompanha fila
```

## 5. Endpoints Propostos

- **`POST /functions/v1/chamaai-activate-license`**
  - **Finalidade:** Validar uma chave de licença nova ou reativar.
  - **Auth:** Nenhuma (recebe `license_key` + `installation_id`).
  - **Payload:** `{ license_key: 'CH-****-ABCD', installation_id: '...' }`
  - **Resposta (200):** `{ tenant_id, store_id, device_token: 'dev_****_final', next_checkin }`
  
- **`POST /functions/v1/chamaai-checkin`**
  - **Finalidade:** Heartbeat do sistema para constatar saúde do sistema e renovar sessões.
  - **Auth:** Cabeçalho com `x-device-token = dev_****_final` + `x-tenant-id` + `x-store-id`.
  - **Resposta (200):** `{ status: 'active', modules_enabled: [...] }`

- **`POST /functions/v1/chamaai-ingest`**
  - **Finalidade:** Endpoints receptores dos eventos de Outbox (senhas, catálogos, configurações).
  - **Auth:** Cabeçalho com `x-device-token = dev_****_final` + `x-tenant-id` + `x-store-id`.
  - **Payload:** `{ action: 'upsert', table: 'senhas_publicas', data: { ... } }`
  - **Resposta (200):** `{ success: true }`

- **`GET /functions/v1/chamaai-portal/?token=pub_****_final`**
  - **Finalidade:** Buscar informações públicas limitadas (senhas em tela e cores/nomes do mercado) para consumidores finais.
  - **Auth:** O próprio `portal_public_token` (`pub_****_final`) no query param funciona como autenticação passiva.
  - **Resposta:** Dados mastigados de filas e senhas.

## 6. Tabelas Envolvidas
Nesta fase, a implementação necessitará de no mínimo duas novas tabelas:
- `store_public_portals`: Dedicada a mapear as URLs públicas (os QR codes impressos) para a respectiva loja, isolando e permitindo revogação caso o token vaze.
- `device_tokens`: Tabela para armazenar os hashes dos dispositivos validados, provendo segurança criptográfica.

## 7. Riscos Pendentes e Conduta Offline
- **Risco:** Falhas ou bugs de rede podem fazer o envio na Ingestion Cloud demorar.
- **Offline First:** O ChamaAí local não usará endpoints síncronos na operação crítica. O *Outbox* (Worker) deve tratar chamadas para `/functions/v1/chamaai-ingest` isoladamente; se houver instabilidade ou timeout de internet, a fila entra em pausa momentânea sem derrubar a usabilidade principal da loja. Se a `device_token` for revogada via SaaS, o aplicativo tenta reativar de fundo, notificando o administrador.

## 8. Plano de Implementação (Subfases da FASE 5)

- **FASE 5A — Cloud Ingestion:** Criação e deploy da `Supabase Edge Function` primária (`chamaai-ingest`) ou uma API node cloud paralela. Adaptação do `supabase-sync.ts` para bater neste endpoint usando o cliente REST (ex: axios/fetch) no lugar de usar diretamente a SDK do Supabase com o cliente `anon`.
- **FASE 5B — Portal do Cliente:** Definição da tabela e endpoint de visualização web (`/portal/:token`).
- **FASE 5C — Licenciamento:** Criação de `activate-license` e `checkin`, amarrando permanentemente a ativação ao Outbox.

## 9. Novo Fluxo do Outbox (FASE 5A)
O Outbox Worker não escreve mais diretamente no banco com `anon_key`.
- Se `CHAMAAI_CLOUD_INGEST_URL` estiver presente, ele fará HTTP POST em lote para a Edge Function.
- Se a Edge Function retornar 401/403/409, ele entende como falha grave de credenciais e pausa a rede.
- Se retornar erro de rede, ele retém para tentativa futura.
- Sem `CHAMAAI_CLOUD_INGEST_URL`, ele pausa silenciosamente (sem consumir as tentativas). O fluxo legado pode ser ligado explicitamente por `CHAMAAI_ALLOW_DIRECT_SUPABASE_SYNC`.

## 10. `installation_id` vs `device_token`
- **`installation_id`**: Um UUID público gerado na primeira inicialização que identifica o PDV na frota do franqueado. Não é um segredo. Pode vazar em logs sem grandes problemas.
- **`device_token`**: É uma chave simétrica segura (segredo de autenticação). **Por que o `installation_id` não é token?** Se usarmos um identificador previsível como token, um atacante só precisaria saber o ID de uma instalação para enviar falsos dados. O `device_token` fica oculto no SQLite e trafegado via Header HTTPS.

## 11. Como Testar
- **Sem Endpoint**: Limpe `CHAMAAI_CLOUD_INGEST_URL`. O log dirá `Pausado: CHAMAAI_CLOUD_INGEST_URL ausente`.
- **Endpoint Fake (Retornando 200)**: Aponte para um mock no Postman/Beeceptor. Ele limpará a fila.
- **Endpoint Fake (Retornando 401)**: Aponte para mock retornando 401. O worker pausará acusando revogação.
- **Endpoint Indisponível**: Aponte para localhost porta errada. O worker não vai gastar "tentativas", ele entenderá como falha de rede.

## 12. Ativação e Check-in (FASE 5C) [CONCLUÍDA]
- A ativação (`POST /functions/v1/chamaai-activate-license`) devolve o `device_token` gerado em texto claro **apenas uma vez**.
- O ChamaAí Local salva esse token internamente e usa para se identificar no Check-in e no Ingestion.
- A Nuvem salva o **Hash** do token (`token_hash`) na tabela `device_tokens`, como fazemos com senhas.
- O **Check-in** (`POST /functions/v1/chamaai-checkin`) roda periodicamente para reportar a saúde da máquina, atualizar versão do App, IP local e receber eventuais revogações (status 401/403).

## 13. Ingestão Real do Outbox (FASE 5A-FINAL) [CONCLUÍDA]
- O Worker do Outbox (`supabase-sync.ts`) envia os lotes para a Edge Function `chamaai-ingest`.
- A Edge Function valida a identidade com o `device_token` (`token_hash`), confere se os IDs batem e aplica os registros de forma atômica no PostgreSQL usando as tabelas permitidas (`senhas_publicas`, `toledo_produtos_publicos`, `configuracoes_publicas`).

## 14. Portal do Cliente Seguro (FASE 5B) [CONCLUÍDA]
- As leituras públicas do portal do cliente são efetuadas exclusivamente pela Edge Function `chamaai-portal` com base no `portal_public_token`.
- O frontend público (`ClientePortal.tsx`) não armazena ou acessa a `SUPABASE_SERVICE_ROLE_KEY` e não recebe `tenant_id` ou `store_id` diretamente do usuário para consultas na nuvem.
- Os dados sensíveis como operadores, logs, licenças, credenciais ou IDs de instalação são estritamente ocultados nas respostas.
- O limite máximo de últimas chamadas é fixado em 5, e a listagem de produtos é paginada a cada 50 itens.

## 15. Comandos Remotos Seguros (FASE 6) [CONCLUÍDA]
- Substituído o listener direto WebSocket do Supabase Realtime por um mecanismo seguro de polling autenticado via `chamaai-commands` Edge Function.
- Os comandos recebidos localmente passam por uma **Allowlist** rígida, de modo que injeções remotas perigosas (como execução de shell script ou comandos SQL) sejam imediatamente rejeitadas antes de qualquer execução.
- O loopback das requisições Express locais é autenticado usando o `x-loopback-token` seguro, mantendo a coerência com a lógica de negócio offline do Caixa Master.



