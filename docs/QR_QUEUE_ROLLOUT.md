# Rollout seguro do QR Code e fila cloud

## Condições obrigatórias

- A instalação local deve possuir `tenant_id`, `store_id`, `device_token` e `portal_public_token`.
- `CHAMAAI_CLOUD_ACTIVATE_URL`, `CHAMAAI_CLOUD_CHECKIN_URL`, `CHAMAAI_CLOUD_INGEST_URL` e `CHAMAAI_PUBLIC_PORTAL_BASE_URL` devem estar configuradas.
- A URL pública deve usar HTTPS. A impressora omite o QR quando faltar URL, token ou ticket.
- A conta do painel administrativo deve possuir `tenant_id` e `store_id` em `app_metadata`.

## Sequência de homologação

1. Aplicar as migrações `001` a `004` em branch ou projeto de homologação.
2. Criar tenant, loja, licença e portal, sem reutilizar IDs de outra instalação.
3. Implantar `chamaai-activate-license`, `chamaai-checkin`, `chamaai-ingest`, `chamaai-commands` e `chamaai-portal`.
4. Ativar a instalação e confirmar que os quatro identificadores obrigatórios foram persistidos.
5. Aguardar o esvaziamento de `supabase_sync_queue` e validar a separação entre duas lojas.
6. Implantar o ChamaCliente configurado para `chamaai-portal`.
7. Executar emissão, leitura do QR, chamada, repetição, conclusão, cancelamento e estorno.
8. Somente após o aceite, aplicar `005_lock_down_public_mirrors.sql` para remover acessos anônimos legados.

## Critérios de rollback

- Não aplicar `005` enquanto qualquer navegador depender de acesso direto às tabelas.
- Não implantar o novo ChamaCliente antes de existir `portal_public_token` para a loja.
- Se a ingestão falhar, manter a outbox local; não habilitar escrita anônima como contorno.
- Falha transitória de rede deve aparecer como offline e recuperar pelo polling sem recarga manual.
