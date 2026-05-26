# Requirements Document

## Introduction

Este documento especifica os requisitos para o sistema de analytics e feedback do ChamaAI, uma aplicação de gestão de senhas e pré-seleção de produtos. O sistema permitirá rastrear interações dos clientes (visualizações, downloads de PDF, compartilhamentos via WhatsApp) e coletar feedback através de emojis, armazenando todos os dados em uma tabela única no Supabase com Row Level Security (RLS) apropriado. Um painel administrativo protegido por autenticação exibirá métricas e gráficos interativos.

## Glossary

- **Sistema_Analytics**: Módulo responsável por rastrear e registrar eventos de interação do usuário
- **Sistema_Feedback**: Módulo responsável por coletar e armazenar avaliações dos clientes através de emojis
- **Overlay_Feedback**: Interface modal que solicita feedback do cliente
- **Painel_Admin**: Interface administrativa protegida para visualização de métricas e dados
- **Tabela_Feedbacks**: Tabela única no Supabase que armazena eventos de analytics e feedback
- **Cliente_Supabase**: Instância do cliente Supabase já configurada em App.tsx (linhas 80-84)
- **Evento_Trigger**: Condição que dispara a exibição do overlay de feedback
- **RLS**: Row Level Security, mecanismo de segurança do Supabase para controle de acesso a dados
- **Ticket_Expirado**: Estado da senha quando ticketStatus === 'expirado'
- **Itens_Carrinho**: Produtos selecionados pelo cliente armazenados no estado carrinho

## Requirements

### Requirement 1: Estrutura de Dados Unificada

**User Story:** Como desenvolvedor, eu quero uma estrutura de dados unificada para analytics e feedback, para que a gestão e consulta dos dados seja simplificada.

#### Acceptance Criteria

1. THE Sistema_Analytics SHALL criar a Tabela_Feedbacks no Supabase com os seguintes campos:
   - id (uuid, primary key, auto-gerado)
   - created_at (timestamp with time zone, auto-gerado)
   - ticket_id (integer, referência à tabela senhas_publicas)
   - tipo_evento (text, valores: 'analytics' ou 'feedback')
   - evento (text, para analytics: 'visualizacao', 'pdf_download', 'whatsapp_share'; para feedback: 'emoji_rating')
   - valor (text, para analytics: null; para feedback: emoji selecionado)
   - metadata (jsonb, opcional, para dados adicionais)

2. THE Sistema_Analytics SHALL configurar RLS na Tabela_Feedbacks permitindo:
   - INSERT público (anon) para registrar eventos
   - SELECT restrito apenas para usuários autenticados (authenticated role)

3. THE Sistema_Analytics SHALL utilizar o Cliente_Supabase existente para todas as operações de banco de dados

### Requirement 2: Rastreamento de Interações

**User Story:** Como administrador, eu quero rastrear todas as interações dos clientes com o sistema, para que eu possa analisar o comportamento e engajamento dos usuários.

#### Acceptance Criteria

1. WHEN um cliente visualiza a página com ticket válido, THE Sistema_Analytics SHALL registrar um evento tipo_evento='analytics' e evento='visualizacao' na Tabela_Feedbacks

2. WHEN um cliente clica no botão "GERAR PDF DA LISTA", THE Sistema_Analytics SHALL registrar um evento tipo_evento='analytics' e evento='pdf_download' na Tabela_Feedbacks

3. WHEN um cliente clica no botão de compartilhar via WhatsApp, THE Sistema_Analytics SHALL registrar um evento tipo_evento='analytics' e evento='whatsapp_share' na Tabela_Feedbacks

4. THE Sistema_Analytics SHALL incluir o ticket_id correspondente em todos os eventos registrados

5. IF o registro de evento falhar, THEN THE Sistema_Analytics SHALL registrar o erro no console sem interromper a experiência do usuário

### Requirement 3: Sistema de Feedback com Emojis

**User Story:** Como cliente, eu quero avaliar minha experiência através de emojis, para que eu possa expressar minha satisfação de forma rápida e intuitiva.

#### Acceptance Criteria

1. THE Sistema_Feedback SHALL exibir o Overlay_Feedback com 5 opções de emoji: 😡 (muito insatisfeito), 😕 (insatisfeito), 😐 (neutro), 🙂 (satisfeito), 😄 (muito satisfeito)

2. THE Overlay_Feedback SHALL incluir um título descritivo e um botão de fechar (X) no canto superior direito

3. WHEN o cliente seleciona um emoji, THE Sistema_Feedback SHALL registrar um evento tipo_evento='feedback' e evento='emoji_rating' com o emoji no campo valor

4. WHEN o cliente seleciona um emoji, THE Sistema_Feedback SHALL fechar o Overlay_Feedback automaticamente

5. WHEN o cliente clica no botão fechar (X), THE Sistema_Feedback SHALL fechar o Overlay_Feedback sem registrar feedback

6. THE Sistema_Feedback SHALL exibir os emojis com tamanho mínimo de 48px para facilitar a interação em dispositivos móveis

### Requirement 4: Triggers de Exibição do Feedback

**User Story:** Como administrador, eu quero que o feedback seja solicitado em momentos estratégicos, para que eu maximize a taxa de resposta sem prejudicar a experiência do usuário.

#### Acceptance Criteria

1. WHEN ticketStatus muda para 'expirado', THE Sistema_Feedback SHALL exibir o Overlay_Feedback após 2 segundos

2. WHEN o cliente adiciona o primeiro item ao carrinho (transição de 0 para 1 item), THE Sistema_Feedback SHALL exibir o Overlay_Feedback após 3 segundos

3. THE Sistema_Feedback SHALL garantir que o Overlay_Feedback seja exibido no máximo uma vez por sessão para cada Evento_Trigger

4. THE Sistema_Feedback SHALL armazenar no sessionStorage a informação de que o feedback já foi solicitado para evitar repetições

### Requirement 5: Painel Administrativo de Analytics

**User Story:** Como administrador, eu quero visualizar métricas e gráficos das interações e feedbacks, para que eu possa tomar decisões baseadas em dados sobre melhorias no sistema.

#### Acceptance Criteria

1. THE Painel_Admin SHALL ser acessível através de uma rota protegida /admin

2. THE Painel_Admin SHALL exigir autenticação via Supabase Auth antes de exibir qualquer dado

3. WHEN um usuário não autenticado tenta acessar /admin, THE Painel_Admin SHALL redirecionar para uma página de login

4. THE Painel_Admin SHALL exibir as seguintes métricas em cards:
   - Total de visualizações
   - Total de PDFs gerados
   - Total de compartilhamentos via WhatsApp
   - Total de feedbacks recebidos
   - Distribuição de feedbacks por emoji (contagem e percentual)

5. THE Painel_Admin SHALL exibir gráficos interativos utilizando recharts ou chart.js:
   - Gráfico de linha: evolução temporal de eventos (últimos 7 dias)
   - Gráfico de barras: distribuição de feedbacks por emoji
   - Gráfico de pizza: proporção de tipos de eventos (visualização, PDF, WhatsApp)

6. THE Painel_Admin SHALL permitir filtrar dados por período (hoje, últimos 7 dias, últimos 30 dias, personalizado)

7. THE Painel_Admin SHALL atualizar os dados automaticamente a cada 30 segundos quando a página estiver ativa

8. THE Painel_Admin SHALL utilizar Tailwind CSS para estilização consistente com o restante da aplicação

### Requirement 6: Autenticação Administrativa

**User Story:** Como administrador, eu quero fazer login de forma segura no painel administrativo, para que apenas usuários autorizados possam acessar os dados sensíveis.

#### Acceptance Criteria

1. THE Painel_Admin SHALL implementar uma página de login em /admin/login

2. THE Painel_Admin SHALL utilizar Supabase Auth para autenticação de usuários

3. WHEN um usuário submete credenciais válidas, THE Painel_Admin SHALL armazenar a sessão e redirecionar para /admin

4. WHEN um usuário submete credenciais inválidas, THE Painel_Admin SHALL exibir mensagem de erro clara

5. THE Painel_Admin SHALL incluir um botão de logout visível em todas as páginas administrativas

6. WHEN um usuário clica em logout, THE Painel_Admin SHALL encerrar a sessão e redirecionar para /admin/login

7. THE Painel_Admin SHALL verificar a sessão do usuário em cada carregamento de página administrativa

### Requirement 7: Design Responsivo e Acessibilidade

**User Story:** Como usuário, eu quero que o overlay de feedback e o painel admin sejam responsivos e acessíveis, para que eu possa utilizá-los em qualquer dispositivo.

#### Acceptance Criteria

1. THE Overlay_Feedback SHALL ser responsivo e centralizado em telas de todos os tamanhos (mobile, tablet, desktop)

2. THE Overlay_Feedback SHALL incluir um backdrop semi-transparente que impede interação com o conteúdo de fundo

3. THE Painel_Admin SHALL ser responsivo e utilizável em dispositivos móveis, tablets e desktops

4. THE Overlay_Feedback SHALL incluir atributos ARIA apropriados para leitores de tela

5. THE Painel_Admin SHALL seguir as práticas de acessibilidade WCAG 2.1 nível AA para navegação por teclado

6. THE Overlay_Feedback SHALL permitir fechar através da tecla ESC

### Requirement 8: Integração com Sistema Existente

**User Story:** Como desenvolvedor, eu quero que o novo sistema se integre perfeitamente com o código existente, para que não haja quebras ou conflitos.

#### Acceptance Criteria

1. THE Sistema_Analytics SHALL utilizar o Cliente_Supabase instanciado em App.tsx (linhas 80-84)

2. THE Sistema_Analytics SHALL utilizar react-router-dom já instalado para roteamento do Painel_Admin

3. THE Sistema_Feedback SHALL utilizar lucide-react para ícones consistentes com o restante da aplicação

4. THE Sistema_Analytics SHALL seguir os padrões de nomenclatura e estrutura de pastas existentes no projeto

5. THE Sistema_Analytics SHALL utilizar TypeScript com tipagem estrita para todos os novos componentes

6. THE Sistema_Feedback SHALL utilizar as variáveis CSS customizadas definidas em index.css para cores e temas

### Requirement 9: Performance e Otimização

**User Story:** Como usuário, eu quero que o sistema de analytics e feedback não afete negativamente a performance da aplicação, para que minha experiência seja fluida.

#### Acceptance Criteria

1. THE Sistema_Analytics SHALL registrar eventos de forma assíncrona sem bloquear a interface do usuário

2. THE Sistema_Analytics SHALL implementar debounce de 500ms para eventos de visualização para evitar registros duplicados

3. THE Painel_Admin SHALL implementar paginação ou virtualização para listas com mais de 100 registros

4. THE Painel_Admin SHALL utilizar React.memo ou useMemo para otimizar re-renderizações de componentes pesados

5. THE Sistema_Feedback SHALL carregar o Overlay_Feedback de forma lazy para não impactar o bundle inicial

### Requirement 10: Tratamento de Erros e Validação

**User Story:** Como desenvolvedor, eu quero que o sistema trate erros graciosamente, para que falhas não comprometam a experiência do usuário.

#### Acceptance Criteria

1. IF a inserção na Tabela_Feedbacks falhar, THEN THE Sistema_Analytics SHALL registrar o erro no console e continuar a execução

2. IF a consulta ao Supabase no Painel_Admin falhar, THEN THE Painel_Admin SHALL exibir mensagem de erro amigável ao usuário

3. THE Sistema_Feedback SHALL validar que o ticket_id existe antes de registrar feedback

4. THE Painel_Admin SHALL exibir estado de carregamento (skeleton ou spinner) enquanto busca dados

5. THE Sistema_Analytics SHALL validar que tipo_evento e evento contêm valores permitidos antes de inserir na Tabela_Feedbacks

6. IF o Cliente_Supabase não estiver disponível, THEN THE Sistema_Analytics SHALL registrar erro crítico e desabilitar funcionalidades de analytics
