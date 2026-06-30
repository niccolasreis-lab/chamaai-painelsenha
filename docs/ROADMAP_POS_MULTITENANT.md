# Roadmap Pós-Implementação Multi-Tenant

> [!NOTE]
> **Arquitetura multi-tenant concluída.**  
> **Status:** pronto para homologação/staging.  
> **Produção:** dependente de validação E2E.

Este documento descreve os próximos passos técnicos recomendados para evolução, endurecimento e otimização da arquitetura multi-tenant híbrida do ChamaAí.

---

## 1. Segurança & Hardening Avançado

- **Assinatura HMAC SHA-256**: Substituir a verificação de hash SHA-256 simples do `device_token` por assinaturas baseadas em HMAC SHA-256 em todas as requisições enviadas pelo Caixa Master. O master local assinará o payload da requisição usando o token como chave secreta, eliminando o trânsito do token na rede (mesmo sob HTTPS).
- **Criptografia de SQLite local**: Adotar criptografia de banco de dados SQLite no Caixa Master local (ex: SQLCipher) para garantir que arquivos de backup ou dados locais do SQLite não possam ser inspecionados ou editados manualmente se o computador for roubado ou acessado indevidamente.
- **Rotação de Device Token**: Implementar a rotação programada automática dos tokens de dispositivos (ex: a cada 7 dias) diretamente via Edge Function de check-in, invalidando credenciais antigas dinamicamente e minimizando a janela de exposição de tokens vazados.

---

## 2. Infraestrutura Cloud & Admin Console

- **Painel Cloud Admin (SaaS Console)**: Criar uma interface web administrativa centralizada para controle corporativo dos tenants. A interface permitirá provisionar e bloquear licenças, inspecionar dispositivos ativos e monitorar a saúde dos Caixas Master de forma visual.
- **Métricas e Observabilidade**: Implementar a coleta de métricas de uso e performance nas Edge Functions, integrando com serviços como Grafana/Prometheus ou Datadog para monitorar latências de ingestão, quantidade de requisições de portais públicos e taxas de erro das APIs.
- **Alertas Automatizados de Queda de Caixa Master**: Implementar um worker na nuvem que analisa a data de `last_seen_at` da tabela de `devices` e dispara alertas automatizados (Slack, Telegram, E-mail) para a equipe de suporte se um Caixa Master de uma loja crítica parar de fazer check-in por mais de 5 minutos.

---

## 3. Qualidade & Integração Contínua (CI/CD)

- **Testes de Integração Automatizados (E2E)**: Implementar uma suite de testes de integração automatizados rodando sob Docker (por exemplo, simulando um master local em NodeJS e mockando o banco Supabase) para validar fluxos de Outbox e ativação em pipelines de CI/CD.
- **Redução e Refactoring do `server/index.ts`**: Fazer a quebra modular do arquivo principal `server/index.ts` em rotas dedicadas (controller/service pattern) para melhorar a legibilidade, facilidade de manutenção e testes unitários.
- **Remoção de Código Legado**: Desativar por completo as dependências do listener Supabase Realtime legado e conexões diretas ao Supabase quando a arquitetura Edge Function estiver consolidada em 100% dos clientes reais de produção.
