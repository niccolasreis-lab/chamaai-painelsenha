# Plano de Testes Ponta a Ponta (E2E) — Multi-Tenant Híbrido

Este documento descreve as etapas de verificação e os cenários de teste necessários para homologar o ChamaAí Multi-Tenant Híbrido antes da implantação final em produção.

---

## Cenário Geral de Homologação

```text
  [Supermercado Local Master]  ◄── Polling (10s) ──►  [Supabase Cloud API]
              │                                                │
       Outbox Sync (5s)                                   Edge Ingest
              │                                                │
              ▼                                                ▼
       (SQLite Local)                                   (Postgres Cloud)
```

---

## 1. Massa de Dados Básica (Nuvem)

Execute os comandos SQL a seguir no banco central do Supabase para provisionar o ambiente de testes:

```sql
-- 1. Criação do Tenant
INSERT INTO tenants (id, name, document, plan, status)
VALUES ('e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b', 'Rede de Testes E2E', '99.999.999/0001-99', 'premium', 'active');

-- 2. Criação da Store (Loja 01)
INSERT INTO stores (id, tenant_id, name, city, state, status)
VALUES ('7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d', 'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b', 'Loja Homologação 01', 'São Paulo', 'SP', 'active');

-- 3. Criação da Licença de Testes
INSERT INTO licenses (tenant_id, store_id, license_key, status, plan, expires_at)
VALUES (
  'e8f9b2a1-c3b4-4e5f-8a2b-9c7d8e9f0a1b',
  '7a6b5c4d-3e2f-1a0b-9c8d-7e6f5a4b3c2d',
  'CH-****-ABCD', -- EXEMPLO MASCARADO (Em produção, cadastrar a licença real gerada)
  'active',
  'premium',
  now() + interval '30 days'
);

-- 4. Criação do Portal do Cliente Público
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

## 2. Roteiro de Testes Passo a Passo

### Caso 1: Inicialização Inicial e Ativação da Licença
1. Limpe o banco de dados SQLite local ou remova a tabela `cloud_installation`.
2. Inicie o ChamaAí Local Master. Verifique os logs e note que um `installation_id` foi gerado automaticamente.
3. Chame a rota local `/api/cloud/activate` via cURL ou ferramenta REST:
   ```bash
   curl -X POST http://localhost:3001/api/cloud/activate \
     -H "Content-Type: application/json" \
     -d '{"license_key": "CH-****-ABCD"}'
   ```
4. Certifique-se de que a resposta HTTP 200 retornou `has_device_token: true`, e que os campos `device_token`, `portal_public_token` e `license_key` originais **não** constam da resposta (ou constam apenas mascarados).

### Caso 2: Emissão Local e Sincronização Outbox
1. Acesse o Totem local e emita uma nova senha de teste.
2. Certifique-se de que a senha foi impressa e emitida localmente sem lentidão.
3. Consulte o banco SQLite local (`supabase_sync_queue`) e verifique que uma operação `upsert` com a tabela `senhas_publicas` foi inserida.
4. Em menos de 5 segundos, verifique os logs do servidor:
   ```text
   [SYNC WORKER] 🚀 Processando lote de 1 operações...
   [SYNC WORKER] ✅ Lote processado com sucesso.
   ```
5. Acesse o banco de dados no Supabase e valide se a senha consta na tabela `senhas_publicas` carimbada com `tenant_id` e `store_id` correspondentes.

### Caso 3: Portal do Cliente (QR Code)
1. Verifique que a impressora gerou um QR Code contendo a URL:
   `https://portal.chamaai.com.br/cliente?token=pub_****_final&senha_id=XX`
2. Acesse a URL simulada em um navegador.
3. Valide se a Edge Function `/chamaai-portal` retorna as últimas senhas chamadas e informações exclusivas da Loja 01 sem expor outros tenants do banco.

### Caso 4: Polling e Execução de Comandos
1. Insira um comando na nuvem (Supabase):
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
2. Em até 30 segundos, observe os logs locais do Caixa Master:
   ```text
   [CLOUD COMMANDS] 📥 Recebidos 1 comandos remotos para processar.
   [CLOUD COMMANDS] ✅ ACK de 1 comandos enviado com sucesso.
   ```
3. Verifique que no Supabase o status da linha mudou para `executed` e o campo `result` contém o retorno do ping.

---

## 3. Testes de Resiliência (Robustez)

### Caso 5: Simulação de Internet Fora (Queda de Conectividade)
1. Desative a conexão de rede da máquina local ou altere o host de `CHAMAAI_CLOUD_INGEST_URL` para uma porta inexistente.
2. Emita senhas localmente.
3. Confirme que o sistema de senhas **continua funcionando normalmente**.
4. Observe os logs de sincronização indicando falha de rede e note que a fila de sincronização entra em pausa mantendo os itens intactos na fila sem estourar o limite de tentativas.
5. Reative a rede e confirme que todas as senhas pendentes foram transmitidas atômica e gradualmente.

### Caso 6: Tentativa com Token Inválido ou Divergência de Tenant
1. Modifique o SQLite local inserindo um `device_token` falso ou divergente de tenant/store.
2. Observe que a Edge Function `chamaai-ingest` e `chamaai-commands` retornam códigos HTTP `401 Unauthorized` ou `409 Conflict`.
3. Verifique que a fila e o loop de comandos do master local entram em pausa de segurança e imprimem logs claros sobre o erro de autorização sem derrubar a usabilidade da loja.
