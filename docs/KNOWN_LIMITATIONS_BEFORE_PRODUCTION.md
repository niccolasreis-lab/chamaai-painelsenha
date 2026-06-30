# Limitações Conhecidas antes da Produção

Este documento lista as limitações de arquitetura aceitas para esta versão do ChamaAí Multi-Tenant Híbrido, que serão mitigadas de forma evolutiva pós-produção.

---

## 1. Segurança & Criptografia

- **SHA-256 Simples para Dispositivos**: A autenticação local-cloud é efetuada comparando a hash SHA-256 direta do `device_token`. A implementação de assinaturas criptográficas **HMAC SHA-256** (onde o token assina a requisição e nunca transita na rede) fica agendada como prioridade no roadmap pós-produção.
- **Banco SQLite Local sem Criptografia**: O arquivo do banco de dados SQLite local no Caixa Master (`C:\ChamaAi\chamaai.db`) não possui criptografia em disco. Caso um terminal físico seja roubado ou acessado fisicamente, os dados locais (senhas daquela loja e produtos) podem ser copiados. A migração para **SQLCipher** será avaliada em fases futuras.
- **Rotação Manual de Tokens**: A rotação de tokens públicos de portais e tokens de dispositivos é feita manualmente por comandos SQL no banco de dados. Mecanismos automatizados e periódicos de rotação via Edge Functions estão agendados no roadmap.

---

## 2. Operação & Provisionamento

- **Falta de Painel Administrador Cloud**: Atualmente não existe um painel administrativo SaaS web para gerenciar os inquilinos e licenças. O provisionamento de novos lojistas, lojas, licenças e portais é efetuado diretamente via console ou scripts SQL no banco de dados Supabase.
- **`server/index.ts` Monolítico**: O servidor local Express centraliza quase todas as lógicas de rotas de negócio no arquivo `server/index.ts` (monólito de ~4500 linhas). O refactor para controllers modulares não foi efetuado para mitigar riscos de quebra na compatibilidade de totem e impressão nesta versão de release.
- **Testes Automatizados Limitados**: O projeto possui testes unitários escassos, dependendo massivamente da validação E2E manual e homologação em staging para validar a integridade dos cenários.
