# Implementation Plan: Analytics and Feedback System

## Overview

Este plano de implementação detalha as tarefas necessárias para criar o sistema de analytics e feedback do ChamaAI. O sistema rastreará interações dos clientes (visualizações, downloads de PDF, compartilhamentos via WhatsApp) e coletará feedback através de emojis. Todos os dados serão armazenados em uma tabela única no Supabase com Row Level Security (RLS). Um painel administrativo protegido por autenticação exibirá métricas e gráficos interativos.

## Tasks

- [ ] 1. Configurar infraestrutura de dados no Supabase
  - [x] 1.1 Criar tabela feedbacks no Supabase
    - Criar tabela com campos: id (uuid), created_at (timestamp), ticket_id (integer), tipo_evento (text), evento (text), valor (text), metadata (jsonb)
    - Adicionar constraint CHECK para tipo_evento ('analytics' ou 'feedback')
    - Criar índices para performance: idx_feedbacks_ticket_id, idx_feedbacks_tipo_evento, idx_feedbacks_created_at
    - _Requirements: 1.1, 1.2_
  
  - [-] 1.2 Configurar Row Level Security (RLS)
    - Habilitar RLS na tabela feedbacks
    - Criar política para INSERT público (anon role)
    - Criar política para SELECT apenas para usuários autenticados
    - _Requirements: 1.2, 10.6_

- [ ] 2. Implementar módulo de Analytics
  - [ ] 2.1 Criar tipos TypeScript para analytics
    - Criar arquivo src/shared/analytics.ts
    - Definir interfaces: FeedbackRecord, AnalyticsEvent, FeedbackEvent, EmojiRating
    - Exportar tipos para uso em outros componentes
    - _Requirements: 1.1, 8.5_
  
  - [~] 2.2 Implementar hook useAnalyticsTracker
    - Criar função trackEvent genérica para registrar eventos no Supabase
    - Implementar trackVisualizacao com debounce de 500ms
    - Implementar trackPDFDownload para rastrear downloads de PDF
    - Implementar trackWhatsAppShare para rastrear compartilhamentos
    - Adicionar tratamento de erros com console.error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 9.2, 10.1, 10.5_
  
  - [~] 2.3 Integrar analytics no App.tsx
    - Importar e instanciar useAnalyticsTracker
    - Adicionar useEffect para rastrear visualização quando ticket é válido
    - Modificar função gerarPDF para chamar trackPDFDownload
    - Modificar função enviarWhatsApp para chamar trackWhatsAppShare
    - _Requirements: 2.1, 2.2, 2.3, 8.1, 8.2_

- [~] 3. Checkpoint - Verificar rastreamento de analytics
  - Testar se eventos de visualização, PDF e WhatsApp estão sendo registrados corretamente no Supabase
  - Verificar se o debounce está funcionando para evitar registros duplicados
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implementar sistema de Feedback
  - [~] 4.1 Criar componente FeedbackOverlay
    - Criar arquivo src/components/FeedbackOverlay.tsx
    - Implementar modal com backdrop semi-transparente
    - Adicionar 5 opções de emoji: 😡, 😕, 😐, 🙂, 😄
    - Adicionar botão de fechar (X) no canto superior direito
    - Implementar fechamento com tecla ESC
    - Adicionar atributos ARIA para acessibilidade
    - Estilizar com Tailwind CSS seguindo o design existente
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 7.1, 7.2, 7.4, 7.6, 8.3, 8.6_
  
  - [~] 4.2 Criar lógica de triggers de feedback
    - Implementar trigger para ticket expirado (após 2 segundos)
    - Implementar trigger para primeiro item no carrinho (após 3 segundos)
    - Adicionar controle de exibição única por sessão usando sessionStorage
    - Implementar função handleSubmit para registrar feedback no Supabase
    - Adicionar validação de ticket_id antes de registrar
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 10.3_
  
  - [~] 4.3 Integrar FeedbackOverlay no App.tsx
    - Importar FeedbackOverlay
    - Adicionar estado para controlar exibição do overlay
    - Adicionar lógica de triggers baseada em ticketStatus e carrinhoSize
    - Renderizar FeedbackOverlay no final do JSX
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 8.4_

- [~] 5. Checkpoint - Verificar sistema de feedback
  - Testar se o overlay aparece nos momentos corretos (ticket expirado e primeiro item)
  - Verificar se o feedback é registrado corretamente no Supabase
  - Confirmar que o overlay não aparece mais de uma vez por sessão
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implementar autenticação administrativa
  - [~] 6.1 Criar página de login AdminLogin.tsx
    - Criar arquivo src/components/AdminLogin.tsx
    - Implementar formulário com campos email e senha
    - Adicionar validação de campos obrigatórios
    - Implementar handleSubmit usando Supabase Auth signInWithPassword
    - Adicionar tratamento de erros com mensagens amigáveis
    - Redirecionar para /admin após login bem-sucedido
    - Estilizar com Tailwind CSS
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.3, 8.2, 8.5, 8.6, 10.2_
  
  - [~] 6.2 Configurar rotas administrativas no main.tsx
    - Adicionar rotas /admin/login e /admin no HashRouter
    - Importar AdminLogin e AdminDashboard
    - _Requirements: 5.1, 5.3, 8.2_

- [ ] 7. Implementar painel administrativo
  - [~] 7.1 Criar componente AdminDashboard.tsx
    - Criar arquivo src/components/AdminDashboard.tsx
    - Implementar verificação de autenticação no useEffect
    - Redirecionar para /admin/login se não autenticado
    - Adicionar header com título e botão de logout
    - Implementar função handleLogout usando Supabase Auth signOut
    - _Requirements: 5.2, 5.3, 6.5, 6.6, 6.7, 7.3, 8.5, 8.6_
  
  - [~] 7.2 Implementar busca e processamento de dados
    - Criar função fetchData para buscar registros da tabela feedbacks
    - Implementar filtros por período (hoje, últimos 7 dias, últimos 30 dias)
    - Processar dados para calcular métricas: total de visualizações, PDFs, WhatsApp, feedbacks
    - Calcular distribuição de feedbacks por emoji com contagem e percentual
    - Processar série temporal agrupando eventos por dia
    - Adicionar auto-refresh a cada 30 segundos
    - Adicionar tratamento de erros com mensagens amigáveis
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 9.3, 10.2, 10.4_
  
  - [~] 7.3 Criar cards de métricas
    - Criar 4 cards para: Visualizações, PDFs Gerados, Compartilhamentos, Feedbacks
    - Adicionar ícones emoji para cada métrica
    - Exibir valores formatados com separador de milhares
    - Criar grid responsivo (1 coluna mobile, 2 tablet, 4 desktop)
    - _Requirements: 5.4, 7.3, 8.6_
  
  - [~] 7.4 Criar seção de distribuição de feedbacks
    - Criar 5 cards para cada emoji: 😡, 😕, 😐, 🙂, 😄
    - Exibir contagem e percentual para cada emoji
    - Criar grid responsivo (2 colunas mobile, 5 desktop)
    - _Requirements: 5.4, 5.5, 7.3, 8.6_
  
  - [~] 7.5 Implementar gráficos interativos com recharts
    - Instalar biblioteca recharts: npm install recharts
    - Criar gráfico de linha para evolução temporal de eventos
    - Criar gráfico de barras para distribuição de feedbacks por emoji
    - Criar gráfico de pizza para proporção de tipos de eventos
    - Adicionar tooltips interativos nos gráficos
    - Tornar gráficos responsivos
    - _Requirements: 5.5, 7.3, 8.6_
  
  - [~] 7.6 Implementar filtros de período
    - Criar botões para filtros: Hoje, Últimos 7 dias, Últimos 30 dias
    - Adicionar estado filterPeriod
    - Atualizar fetchData quando filtro mudar
    - Destacar filtro ativo visualmente
    - _Requirements: 5.6, 7.3, 8.6_

- [~] 8. Checkpoint - Verificar painel administrativo
  - Testar login com credenciais válidas e inválidas
  - Verificar se métricas são exibidas corretamente
  - Testar filtros de período
  - Confirmar que gráficos são interativos e responsivos
  - Verificar auto-refresh a cada 30 segundos
  - Testar logout e redirecionamento
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Otimizações e ajustes finais
  - [~] 9.1 Adicionar animações CSS para overlay de feedback
    - Adicionar animação de fade-in para backdrop
    - Adicionar animação de scale para modal
    - Adicionar transições suaves para hover e active states
    - _Requirements: 7.1, 8.6_
  
  - [~] 9.2 Implementar lazy loading do FeedbackOverlay
    - Usar React.lazy para carregar FeedbackOverlay sob demanda
    - Adicionar Suspense com fallback
    - _Requirements: 9.5_
  
  - [~] 9.3 Otimizar re-renderizações no AdminDashboard
    - Usar React.memo para componentes de cards
    - Usar useMemo para cálculos pesados (percentuais, séries temporais)
    - _Requirements: 9.4_
  
  - [~] 9.4 Adicionar estados de carregamento
    - Adicionar skeleton loader para cards de métricas
    - Adicionar spinner para gráficos durante carregamento
    - Adicionar indicador de loading no botão de login
    - _Requirements: 10.4_

- [~] 10. Checkpoint final - Testes de integração
  - Testar fluxo completo: visualização → adicionar item → feedback → verificar no admin
  - Verificar se RLS está funcionando corretamente (anon pode inserir, authenticated pode ler)
  - Testar responsividade em mobile, tablet e desktop
  - Verificar acessibilidade com navegação por teclado
  - Confirmar que não há erros no console
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Todas as tarefas utilizam o cliente Supabase já instanciado em App.tsx (linhas 80-84)
- O sistema segue os padrões de estilização existentes com Tailwind CSS
- Todos os componentes são escritos em TypeScript com tipagem estrita
- O painel administrativo requer autenticação via Supabase Auth
- Os eventos de analytics são registrados de forma assíncrona sem bloquear a UI
- O overlay de feedback é exibido no máximo uma vez por sessão para cada trigger
- Os checkpoints garantem validação incremental do sistema

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["4.1", "6.1"] },
    { "id": 5, "tasks": ["4.2", "6.2"] },
    { "id": 6, "tasks": ["4.3", "7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["7.3", "7.4", "7.6"] },
    { "id": 9, "tasks": ["7.5"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4"] }
  ]
}
```
