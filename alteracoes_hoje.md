# Relatório de Alterações - 10 de Junho de 2026

Este documento resume todas as alterações e melhorias implementadas no projeto **ChamaAI** no dia de hoje (10/06/2026). As modificações abrangem a arquitetura do banco de dados, novos endpoints no servidor, melhorias de sincronização em tempo real, novas telas no painel administrativo (como o gerenciamento inteligente de mídia indoor e o assistente de onboarding) e configurações de infraestrutura/portas.

---

## 📁 Resumo de Arquivos Alterados ou Criados

### 🖥️ Backend & Banco de Dados
* **[NEW]** [`server/media-indoor.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/media-indoor.ts) - Implementação de toda a lógica de negócio, APIs e cache meteorológico para o sistema de Mídia Indoor.
* **[MODIFY]** [`server/index.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/index.ts) - Integração das novas rotas de mídia indoor e alteração da porta padrão do Express para **3001**.
* **[MODIFY]** [`server/supabase-sync.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/supabase-sync.ts) - Otimização de latência na fila de sincronização (Supabase Outbox), disparando o worker em background imediatamente com delay de 50ms.
* **[MODIFY]** [`electron/services/database.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/electron/services/database.ts) - Migrações de banco de dados SQLite para criar as novas tabelas e lidar com arquivos corrompidos automaticamente.
* **[NEW]** [`reset-admin.js`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/reset-admin.js) - Script utilitário para restaurar a senha do usuário `admin` para o padrão.

### 🎨 Frontend & Telão
* **[NEW]** [`src/telao/SmartMediaLayer.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/telao/SmartMediaLayer.tsx) - Componente inteligente que renderiza mídias de acordo com o layout ativo (lateral, rodapé, plano de fundo, tela cheia) e gerencia carrossel/SSE.
* **[MODIFY]** [`src/telao/MediaIndoor.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/telao/MediaIndoor.tsx) - Integração do `SmartMediaLayer` com a exibição do Telão principal.
* **[NEW]** [`src/admin/MediaIndoorAdmin.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/MediaIndoorAdmin.tsx) - Painel administrativo completo para controle de configurações, carregamento de itens, criação de campanhas e aplicação de temas visuais.
* **[NEW]** [`src/admin/OnboardingWizard.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/OnboardingWizard.tsx) - Assistente de configuração inicial com passo a passo interativo para cadastrar estabelecimento, CNPJ e cor da marca.
* **[MODIFY]** [`src/App.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/App.tsx) - Inclusão da rota administrativa `/admin/media-indoor`.
* **[MODIFY]** [`src/admin/Dashboard.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/Dashboard.tsx) & [`src/admin/AdminLayout.tsx`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/AdminLayout.tsx) - Ajustes visuais e inclusão de atalhos rápidos de navegação.

### ⚙️ Empacotamento, Electron & Android
* **[MODIFY]** [`electron/main.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/electron/main.ts) - Desativação de aceleração de hardware e sandbox para permitir que o aplicativo Electron funcione a partir de drives de rede mapeados (ex: `Z:\`) ou ambientes sem driver de GPU (VMs). Ajuste de porta zumbi e dev server fallback para **3001/5175**.
* **[MODIFY]** [`vite.config.ts`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/vite.config.ts) - Configurações do servidor Vite de desenvolvimento para a porta 5175.
* **[MODIFY]** [`android/app/build.gradle`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/android/app/build.gradle) & [`android/app/src/main/AndroidManifest.xml`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/android/app/src/main/AndroidManifest.xml) - Atualizações de empacotamento nativo.
* **[MODIFY]** [`android/app/src/main/java/com/chamaai/app/MainActivity.java`](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/android/app/src/main/java/com/chamaai/app/MainActivity.java) - Limpeza de código legado.

---

## 🛠️ Detalhes das Implementações

### 1. Novo Sistema de Mídia Indoor Inteligente
Diferente das mídias básicas anteriores, agora o ChamaAI possui um motor completo de exibição:
* **Tipos de Conteúdo Suportados**: Imagens Locais (com upload), Vídeos (com upload), Vídeos do YouTube (via link incorporado), Previsão do Clima (Open-Meteo) e Páginas Web (URLs).
* **Filtro de Exibição Dinâmico**: Os itens respeitam datas de início e término (`start_at` / `end_at`), dias da semana permitidos (`weekdays`) e prioridade de exibição.
* **Campanhas**: Agrupamento de itens de mídia para exibição sazonal (ex: "Campanha de Natal"). Uma campanha pode ter prioridade maior e substituir toda a programação padrão (`replace_default_schedule`).
* **Temas Visuais**: Possibilidade de criar temas que mudam as cores primárias/secundárias, plano de fundo e folhas de estilo customizadas (`custom_css`) associados a campanhas ou globais.
* **Previsão do Tempo**: API de previsão climática do Open-Meteo com sistema inteligente de cache local SQLite de 30 minutos, economizando tráfego de internet e prevenindo falhas de conexão.
* **Layouts no Telão**:
  * **Lateral**: Mídia ocupa 30% da tela na direita, e as senhas 70%.
  * **Rodapé**: Mídia fica em uma barra inferior de 256px.
  * **Background**: Mídia fica como plano de fundo semitransparente (opacity 30%) atrás das senhas.
  * **Full Screen**: Tela cheia de mídia, reduzindo opacidade apenas no instante em que uma nova senha é chamada.

### 2. Painel de Controle Administrativo (`MediaIndoorAdmin`)
Interface de usuário moderna com as seguintes abas de gestão:
1. **Configurações**: Ativação/Desativação da mídia indoor e seleção visual do Layout de Exibição.
2. **Conteúdos**: Lista inteligente exibindo crachás coloridos de cada tipo de mídia, ordenação, chave liga/desliga rápida, e modal para criação/edição.
3. **Campanhas**: Lista de campanhas ativas/inativas com campos de agendamento e priorização.
4. **Temas**: Visualização e cadastro de cores primárias/secundárias, logotipo e arquivos de estilos customizados.

### 3. Assistente de Onboarding (`OnboardingWizard`)
* Guia passo a passo intuitivo para novos usuários do sistema.
* **Passo 1 (O Negócio)**: Nome do Estabelecimento (obrigatório), CNPJ (opcional) e Categoria de Atuação.
* **Passo 2 (Personalização)**: Paleta de cores com sugestões (Azul, Verde, Vermelho, Amarelo, Roxo, Preto) ou entrada de código HEX personalizado.
* **Passo 3 (Tudo Pronto!)**: Checklist com os próximos passos recomendados:
  1. Conectar o Telão;
  2. Cadastrar Operadores;
  3. Personalizar Balcões.
* Os dados parciais são salvos dinamicamente no `localStorage` do navegador para evitar perda de dados caso a página seja recarregada no meio do fluxo.

### 4. Melhorias Técnicas e de Resiliência
* **Sincronização em Tempo Real**: Otimização do Supabase Sync para disparar o worker em background imediatamente com timer de 50ms, melhorando a resposta do telão a alterações no painel admin de 10s para frações de segundo.
* **Porta de Rede**: Transição da porta do Express para **3001** (evitando conflitos com aplicações locais na porta 3000) e do Vite de desenvolvimento para **5175**.
* **Electron Resiliente**: Adicionados os switches `no-sandbox`, `disable-gpu` e `disable-gpu-sandbox`, além da desativação da aceleração de hardware. Isso resolve erros comuns de tela branca e falhas de processo do Chromium quando o executável do ChamaAI é aberto diretamente de compartilhamentos de rede do Windows (ex: mapeamento `Z:\`) ou em máquinas virtuais.
* **Automação de Banco Corrompido**: Ao inicializar, se o SQLite encontrar um arquivo corrompido (`SQLITE_NOTADB`), o sistema renomeia o arquivo antigo com um sufixo de backup e recria um banco limpo automaticamente, evitando travamento total na inicialização do cliente.
