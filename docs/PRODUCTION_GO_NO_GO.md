# Critérios de Go / No-Go para Produção

Este documento estabelece as condições obrigatórias para autorizar a implantação da arquitetura multi-tenant do ChamaAí em ambiente de produção real.

---

## 1. Critérios de GO (Aprovação)

A implantação em produção está **AUTORIZADA** somente se todos os pontos a seguir forem plenamente validados e atestados em homologação:

- [ ] **Compilação TS**: O projeto local TypeScript compila completamente sem erros via `npx tsc --noEmit -p tsconfig.electron.json`.
- [ ] **Migrations Limpas**: Todas as migrations (`001`, `002` e `003`) aplicam de primeira e sem erros estruturais em uma base Supabase limpa.
- [ ] **Edge Functions Deploy**: Todas as Edge Functions sobem com sucesso e operam corretamente com as secrets `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` configuradas em nuvem.
- [ ] **Ativação Funcional**: O fluxo de licenciamento permite que novos masters locais se registrem e provisionem suas identidades na nuvem sem falhas.
- [ ] **Log de Tokens Bloqueados**: O `device_token` local **não** é gravado ou exibido em logs locais, logs de rede ou erros no terminal.
- [ ] **Outbox Integrado**: As alterações locais (senhas, produtos e configurações) são devidamente persistidas no Supabase pelo worker Outbox.
- [ ] **Isolamento de Portais**: O Portal do Cliente exibe dados apenas da loja correspondente ao token informado, impossibilitando a leitura de outros estabelecimentos do mesmo tenant ou inquilinos distintos.
- [ ] **Comandos Seguros**: Os comandos remotos são baixados apenas pela respectiva instalação e executados no loopback Express de forma isolada, não interferindo em outros tenants ou lojas.
- [ ] **Robustez Offline**: O sistema local (SSE, emissão de senhas, Toledo, impressão) continua funcionando sem qualquer degradação ou lentidão em caso de queda de internet.
- [ ] **Backup/Restore Local**: A rotina local de backup inteligente e restauração de banco SQLite local continua operacional.
- [ ] **Desativação de Legado**: As flags legadas de desenvolvimento (`CHAMAAI_ALLOW_DIRECT_SUPABASE_SYNC` e `CHAMAAI_ALLOW_LEGACY_SUPABASE_COMMANDS`) estão explicitamente definidas como `false` em produção.
- [ ] **Isolamento de Service Role**: A chave administrativa `SUPABASE_SERVICE_ROLE_KEY` **não** consta de forma alguma no código, bundles ou instaladores locais do Electron.
- [ ] **Segredos Mascarados**: Todos os exemplos contidos na documentação técnica usam dados mascarados (`CH-****-ABCD`, `dev_****_final`, `pub_****_final`).

---

## 2. Critérios de NO-GO (Bloqueio)

A implantação em produção está **SUMARIAMENTE REJEITADA** se qualquer um dos pontos abaixo for detectado:

- [ ] **Exposição de Service Role**: O aplicativo local Electron necessita ou contém a chave administrativa `service_role`.
- [ ] **Vulnerabilidade de Autoridade de Ingress**: Qualquer Edge Function de ingestão aceita campos de identificação (como `tenant_id` ou `store_id`) vindos livremente no corpo da requisição sem confrontar com as credenciais do `device_token` validado.
- [ ] **Queries Inseguras na Nuvem**: Operações de `update`, `delete` ou `delete_all` são disparadas por Edge Functions sem aplicar filtros explícitos de isolamento de inquilino (`tenant_id = X AND store_id = Y`).
- [ ] **Vazamento no Portal**: O Portal do Cliente permite a indexação ou varredura de dados públicos de outras lojas através de alterações arbitrárias na URL de consulta.
- [ ] **Execução Remota Indevida**: Comandos que não constam na **Allowlist** oficial são executados pelo servidor local Master ou são aceitos na Edge Function de comandos.
- [ ] **Dependência Crítica de Rede**: A falha ou timeout de rede com a nuvem causa lentidão ou interrupção nas operações internas da loja (SSE local, totem, telão ou impressão).
- [ ] **Tokens em Texto Claro**: Presença de `device_token` ou `portal_public_token` reais em texto claro expostos em logs locais ou no console do navegador.
