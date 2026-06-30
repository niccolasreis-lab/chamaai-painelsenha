# Migração Multi-Tenant do Supabase — ChamaAí Cloud Control (FASE 2)

Este diretório contém a primeira migration SQL para preparar a nuvem do ChamaAí (`ChamaAí Cloud Control`) para gerenciar múltiplos inquilinos e lojas.

## Objetivo da Migration
Estruturar o banco de dados Supabase/PostgreSQL para suportar:
1. **Inquilinos (Tenants):** Entidade principal de agrupamento de dados corporativos (ex: redes de supermercados).
2. **Lojas (Stores):** Filiais de atendimento vinculadas a um inquilino.
3. **Licenças (Licenses):** Controle de validade e limites operacionais (ex: máximo de operadores e totens permitidos).
4. **Dispositivos (Devices):** Registro de terminais de telão, totens e operadores vinculados de forma unívoca a uma loja e identificados localmente pelo `installation_id`.

---

## Como Aplicar no Supabase

1. Acesse o **Supabase Dashboard** do seu projeto.
2. Navegue até o menu **SQL Editor**.
3. Crie um novo script de consulta (New Query).
4. Copie todo o conteúdo do arquivo [001_multitenant_base.sql](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/supabase/migrations/001_multitenant_base.sql) e cole no editor.
5. Clique em **Run** para aplicar.

---

## Estrutura Criada

### Novas Tabelas Cloud
* **`tenants`:** Clientes corporativos do SaaS.
* **`stores`:** Filiais de cada inquilino.
* **`licenses`:** Chaves de ativação vinculadas a limites operacionais por loja.
* **`devices`:** Registro dos dispositivos vinculados a cada loja, permitindo que a nuvem saiba quais telões e totens estão online (identificados via `installation_id`).

### Tabelas Alteradas (Sincronização Pública)
Adicionadas as colunas `tenant_id` e `store_id` para filtragem:
* `senhas_publicas`
* `toledo_produtos_publicos`
* `configuracoes_publicas`
* `comandos_operador`

---

## Decisões Importantes de Arquitetura

### 1. Preservação de Chaves Primárias
* **Decisão:** Não alteramos as chaves primárias das tabelas existentes no Supabase para chaves compostas (como `(store_id, id)`).
* **Motivo:** Alterar chaves primárias causaria incompatibilidade com instalações existentes (retrocompatibilidade) e quebraria os fluxos de consulta legados no banco local SQLite, além de complicar a integridade referencial atual. As colunas `tenant_id` e `store_id` foram adicionadas como opcionais para garantir o isolamento sem impactos nas PKs originais.

### 2. Segurança de Credenciais Administrativas (`service_role`)
* **Decisão:** A chave `SUPABASE_SERVICE_ROLE_KEY` (chave com bypass total de segurança de RLS) **NUNCA** deve ser inserida, configurada ou distribuída dentro do aplicativo Electron instalado nas lojas.
* **Motivo:** Ao distribuir o instalador do Electron ao cliente, qualquer pessoa com ferramentas básicas de depuração (DevTools, inspecionar rede) poderia extrair a chave `service_role` e obter controle absoluto sobre os dados de todas as outras lojas de outros clientes no Supabase.
* **Solução:** O app local usa chaves restritas/anônimas. Se operações administrativas com bypass de RLS forem estritamente necessárias na nuvem, elas devem ser expostas por uma API Cloud central e segura (como Supabase Edge Functions), que executa no lado do servidor e valida o token do usuário ou a licença antes de realizar a alteração.

### 3. Políticas Iniciais de RLS (Row Level Security)
* O RLS está **habilitado** em todas as tabelas.
* Para leitura pública no Portal do Cliente (como fila de senhas e catálogo de produtos), as políticas de select exigem filtros estritos: a requisição cliente (via browser/Vercel) deve especificar obrigatoriamente o `store_id` e `tenant_id` da consulta.
* Políticas de modificação de dados anônimas estão bloqueadas, assegurando que totens locais não possam alterar dados de outros estabelecimentos indevidamente.

---

## Próximos Passos (FASE 3)
Na próxima fase, iremos desacoplar as credenciais Supabase do código no backend local Express e permitir que o sistema decida dinamicamente se a sincronização está ativa com base na identidade local da instalação.
