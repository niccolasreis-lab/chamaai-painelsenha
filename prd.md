# ChamaAí — Product Requirements Document (PRD)

> **Documento gerado por varredura automatizada do codebase em produção.**
> Versão do sistema analisada: `1.0.145` | Data da análise: `2026-06-18`

---

## 1. Visão Geral

O **ChamaAí** é um sistema de **gestão de atendimento por senhas** (painel de senhas) voltado para estabelecimentos comerciais — especificamente **supermercados com balcões de atendimento pesado** (frios, granel, padaria, etc.).

O software opera como uma aplicação **desktop Electron** que roda um servidor Express local na porta `3001` e serve uma SPA React via Vite. Terminais adicionais (totens, telões, operadores) se conectam ao servidor via rede local (LAN), formando uma **arquitetura Master/Slave** onde a máquina principal é o "Servidor Master".

### Domínios Funcionais Principais

| Domínio | Descrição |
|---|---|
| **Painel de Senhas** | Emissão, chamada, controle de fila (normal + preferencial) |
| **Mídia Indoor / Telão** | Exibição de conteúdo digital (imagens, vídeos, campanhas) nos telões da loja |
| **Encarte Digital** | Exibição automatizada de preços de produtos de balança (Toledo) no telão |
| **Portal do Cliente** | App web acessível via QR Code para o cliente acompanhar a fila pelo celular |
| **Administração** | Dashboard, relatórios, configurações, segurança, gestão de operadores e dispositivos |

---

## 2. Arquitetura Atual

### 2.1 Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| **Runtime Desktop** | Electron | `30.x` |
| **Frontend** | React + TypeScript | React `19.x`, TS `6.x` |
| **Bundler** | Vite | `8.x` |
| **Estilização** | Tailwind CSS | `3.4.x` |
| **Backend (API)** | Express.js | `5.x` |
| **Banco de Dados Local** | better-sqlite3 (SQLite) | `12.x` |
| **Banco de Dados Cloud** | Supabase (PostgreSQL) | SDK `2.x` |
| **Autenticação** | JWT + bcrypt + scrypt (customizado) | — |
| **Impressão Térmica** | node-thermal-printer | `4.x` |
| **Gráficos** | Recharts | `3.x` |
| **Ícones** | Lucide React + Material Symbols | — |
| **QR Code** | qrcode | `1.5.x` |
| **PDF** | jspdf-autotable | `5.x` |
| **Comunicação Realtime** | SSE (Server-Sent Events) + Supabase Realtime (WebSocket) | — |
| **Cron Jobs** | node-cron | `4.x` |
| **Logging** | Winston | `3.x` |
| **Auto-Update** | electron-updater + GitHub Releases | `6.x` |
| **Mobile (Capacitor)** | Capacitor Android | `8.x` |
| **PWA** | vite-plugin-pwa | `1.x` |

### 2.2 Diagrama de Arquitetura (Alto Nível)

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDE LOCAL (LAN)                              │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │  TOTEM   │   │  TELÃO   │   │ OPERADOR │   │ OPERADOR │    │
│  │ (Emissão)│   │ (Display)│   │ (Desktop)│   │ (Touch)  │    │
│  │ Electron │   │ Electron │   │ Electron │   │ Android  │    │
│  │ ou Web   │   │ ou Web   │   │ ou Web   │   │ APK/Web  │    │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘    │
│       │              │ SSE          │              │            │
│       └──────────────┴──────────────┴──────────────┘            │
│                          │ HTTP :3001                           │
│                   ┌──────┴──────┐                                │
│                   │  SERVIDOR   │                                │
│                   │   MASTER    │                                │
│                   │  (Electron) │                                │
│                   │ Express API │                                │
│                   │  SQLite DB  │                                │
│                   └──────┬──────┘                                │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │ Supabase Sync
                           │ (Outbox Pattern)
                    ┌──────┴──────┐
                    │  SUPABASE   │
                    │  (Cloud)    │
                    │ PostgreSQL  │
                    │ Realtime WS │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  PORTAL DO  │
                    │  CLIENTE    │
                    │ (Vercel/Web)│
                    │ QR Code 4G  │
                    └─────────────┘
```

### 2.3 Estrutura de Diretórios Principal

```
chamaAI_novo/
├── electron/              # Processo principal Electron
│   ├── main.ts            # Janela BrowserWindow, IPC, auto-update, watchdog
│   ├── preload.ts         # Bridge contextIsolation (IPC ↔ Renderer)
│   └── services/
│       ├── database.ts    # Inicialização SQLite, migrations, backup/restore
│       ├── printer.ts     # Impressão térmica (ESC/POS)
│       ├── safemode.ts    # Safe Mode após crashes críticos
│       └── recovery.ts    # Logging de recuperação
├── server/                # API REST (Express)
│   ├── index.ts           # ~4400 linhas — Rotas API, SSE, cron, auth
│   ├── toledo-watcher.ts  # File Watcher p/ balanças Toledo (MGV5/6/7, Filizola, Gertec, etc.)
│   ├── supabase-sync.ts   # Sync local→cloud (Outbox Pattern)
│   ├── media-indoor.ts    # Rotas de mídia indoor inteligente (campanhas, temas, playlists)
│   ├── categorizador.ts   # Classificação automática de produtos por descrição
│   ├── file-parsers.ts    # Parsers de formatos de arquivo de balanças industriais
│   └── db/schema.sql      # Schema DDL base do SQLite
├── src/                   # Frontend React (SPA)
│   ├── App.tsx            # Router principal (HashRouter) + ProtectedRoutes
│   ├── Login.tsx          # Tela de login unificada (JWT)
│   ├── totem/             # Módulo Totem (emissão de senhas)
│   ├── telao/             # Módulo Telão (display, encarte, mídia)
│   ├── operador/          # Módulo Operador (chamar senhas, touch, mobile)
│   ├── cliente/           # Portal do Cliente (acompanhamento via QR)
│   ├── admin/             # Painel Administrativo completo
│   └── shared/            # Utilitários, hooks SSE, config de API, sons
└── ChamaAiTelao/          # Projeto Android (Capacitor) para APK do telão
```

### 2.4 Entidades/Tabelas do Banco de Dados (SQLite Local)

| Tabela | Propósito | Campos-Chave |
|---|---|---|
| `operadores` | Operadores legados do sistema | `id`, `nome`, `login`, `senha_hash`, `perfil` (admin\|operador), `ativo` |
| `usuarios` | Tabela unificada de autenticação (JWT) | `id`, `login`, `senha_hash`, `perfil`, `primeiro_acesso` |
| `balcoes` | Balcões/guichês de atendimento | `id`, `nome`, `prefixo_senha`, `preferencial_ativo`, `contador_atual` |
| `senhas` | Senhas emitidas (tickets) | `id`, `balcao_id`, `numero`, `preferencial`, `status`, `nome_cliente`, timestamps |
| `chamadas` | Registro de cada chamada feita | `id`, `senha_id`, `operador_id`, `guiche`, `tentativa` |
| `midias` | Mídias do carrossel clássico (imagem/vídeo) | `id`, `nome`, `caminho`, `tipo`, `ordem`, `ativo`, `data_expiracao`, `file_status`, `deleted_at` |
| `media_items` | Itens de mídia indoor inteligente | `id`, `title`, `type`, `source_url`, `local_path`, `duration_seconds`, `campaign_id`, `priority`, `weekdays` |
| `media_campaigns` | Campanhas promocionais de mídia | `id`, `name`, `starts_at`, `ends_at`, `priority`, `theme_id`, `replace_default_schedule` |
| `media_themes` | Temas visuais para mídia indoor | `id`, `name`, `type`, `primary_color`, `background_image`, `custom_css_json` |
| `configuracoes` | Tabela chave-valor de configurações globais | `chave`, `valor`, `atualizado_em` |
| `toledo_produtos` | Produtos importados de balanças Toledo | `plu`, `descricao`, `preco`, `categoria`, `unidade` |
| `toledo_log` | Log de processamento de arquivos Toledo | `id`, `itens_processados`, `precos_atualizados`, `mensagem` |
| `categorias` | Categorias dinâmicas de produtos | `id`, `nome`, `emoji`, `slug`, `setor`, `deleted_at` |
| `produtos` | Catálogo unificado de produtos (Fase 1) | `id`, `plu`, `nome`, `slug`, `preco`, `categoria_id`, `categoria_legada`, `estoque`, `variacoes` |
| `audit_logs` | Auditoria de operações | `id`, `acao`, `entidade`, `entidade_id`, `detalhes_json`, `operador_id` |
| `teloes` | Telões vinculados por código | `id`, `code`, `nome`, `status`, `modulo_painel`, `modulo_encarte`, `modulo_midia`, `template_layout` |
| `encarte_filtros` | Filtros de exclusão do encarte digital | `id`, `palavra_chave`, `ativo` |
| `encarte_nomes_customizados` | Nomes de exibição customizados | `codigo_produto`, `nome_exibicao` |
| `encarte_temas` | Temas visuais do encarte (backgrounds) | `id`, `nome`, `imagem_fundo`, `data_inicio`, `data_fim` |
| `supabase_sync_queue` | Fila de sincronização local→cloud (Outbox) | `id`, `tabela`, `acao`, `payload`, `tentativas`, `max_tentativas` |
| `tokens_remotos` | Tokens de acesso remoto (Master) | `id`, `token`, `ip_origem`, `expira_em` |
| `sessoes_operador` | Sessões ativas de operadores | `id`, `token`, `operador_id`, `expira_em` |
| `weather_cache` | Cache de previsão do tempo (Open-Meteo) | `id`, `latitude`, `longitude`, `data_json` |
| `system_version` | Versão do sistema e schema | `id`, `app_version`, `db_version`, `schema_hash` |
| `schema_migrations` | Controle de migrações executadas | `id`, `executada_em` |
| `update_history` | Histórico de atualizações/rollbacks | `id`, `version`, `status`, `rollback_reason` |
| `recovery_history` | Histórico de recuperações | `id`, `event_type`, `severity`, `module`, `message` |

### 2.5 Tabelas no Supabase (Cloud/PostgreSQL)

| Tabela | Propósito |
|---|---|
| `senhas_publicas` | Espelho público de senhas (id, numero, status) para o Portal do Cliente |
| `toledo_produtos_publicos` | Espelho público de produtos Toledo (plu, descricao, preco, categoria) |
| `configuracoes_publicas` | Configurações públicas (nome_estabelecimento, cor_primaria, etc.) |
| `comandos_operador` | Fila de comandos remotos (CHAMAR_PROXIMA, REPETIR, ESTORNAR) enviados pelo operador na nuvem |

### 2.6 Integrações Externas

| Integração | Protocolo | Propósito |
|---|---|---|
| **Balanças Toledo/Filizola/Gertec** | File Watcher (Polling 5s em UNC share) | Importação automática de preços de balança |
| **Supabase** | REST + WebSocket (Realtime) | Sync de dados p/ Portal do Cliente + Comandos Remotos |
| **Open-Meteo** | REST (HTTP GET) | Previsão do tempo para exibição no telão |
| **GitHub Releases** | electron-updater | Auto-atualização do aplicativo |
| **Impressoras Térmicas** | ESC/POS via node-thermal-printer | Impressão de tickets de senha |

---

## 3. Funcionalidades Mapeadas

### 3.1 Módulo Totem (`src/totem/`)

**Componentes:** `Emissao.tsx`, `Confirmacao.tsx`

**Funcionalidades:**
- Tela de emissão de senhas para clientes (tela touch / kiosk)
- Seleção de tipo de atendimento: Normal (`A-XXX`) ou Preferencial (`P-XXX`)
- Opção de solicitar nome do cliente (configurável via `totem_solicita_nome`)
- Tela de confirmação pós-emissão com número da senha e posição na fila
- **Screensaver** configurável com timeout e alternância entre mídias e tela de espera
- Suporte a **Kiosk Mode** com blindagem de teclas (Ctrl+W, Alt+F4, DevTools bloqueados)
- Impressão automática de ticket via impressora térmica (quando configurada)

**Regras de negócio implícitas:**
- Contador sequencial por balcão, com reset automático ao atingir 999
- Senhas preferenciais têm prioridade absoluta sobre normais na fila (ORDER BY preferencial DESC, id ASC)
- Reset diário automático da fila configurável (cron à meia-noite)
- A senha emitida é sincronizada com o Supabase para o Portal do Cliente

### 3.2 Módulo Telão (`src/telao/`)

**Componentes:** `MediaIndoor.tsx`, `SenhaChamada.tsx`, `TelaoEspera.tsx`, `EncartePrecos.tsx`, `EncarteGranel.tsx`, `SmartMediaLayer.tsx`

**Funcionalidades:**
- Exibição da senha chamada em destaque com animação
- Histórico das últimas 5 senhas chamadas
- Carrossel de mídia indoor (imagens e vídeos) com intervalo configurável
- **Encarte Digital de Preços** com dados de balanças Toledo — categorização automática
- Suporte a **Text-to-Speech (TTS)** para anúncio vocal da senha chamada
- Template de TTS configurável: `Senha {senha}, dirija-se ao {guiche}.`
- Ticker (texto corrido) na parte inferior do telão
- Múltiplos layouts de telão: `classic`, layouts customizáveis por dispositivo
- **Agendamento de layouts** por horário (cron a cada minuto)
- Integração com previsão do tempo (Open-Meteo)
- Vinculação de dispositivos por código (6 caracteres alfanuméricos)
- Conexão via SSE (Server-Sent Events) por código individual do telão
- Fullscreen automático quando em modo telão

**Regras de negócio implícitas:**
- O telão é registrado via `GET /api/telao/init` que gera um código aleatório
- O admin vincula o telão pelo código, definindo quais módulos estão ativos (painel, encarte, mídia)
- Cada telão tem módulos independentes: `modulo_painel`, `modulo_encarte`, `modulo_midia`
- Mídias expiram automaticamente via cron diário (baseado em `data_expiracao`)
- Reconciliação de mídias no startup: marca como `missing` se o arquivo não existir no disco

### 3.3 Módulo Operador (`src/operador/`)

**Componentes:** `Controle.tsx` (desktop vertical), `ControleTouch.tsx` (touch/TV), `MobileOperador.tsx` (Android), `Bridge.tsx`

**Funcionalidades:**
- **Chamar próxima senha** da fila (com auto-finalização da senha anterior)
- **Repetir chamada** da última senha
- **Estornar/devolver** senha para a fila
- **Concluir atendimento** (marca como `atendida`)
- **Cancelar senha** (marca como `cancelada`)
- Visualização em tempo real da fila (contadores normal/preferencial)
- Suporte a múltiplos guichês simultâneos
- Interface Touch otimizada para telas grandes (TVs com touch)
- Interface Mobile via APK Android (Capacitor)
- Bridge: componente de ponte de conexão para operadores remotos

**Regras de negócio implícitas:**
- Ao chamar próxima senha, a senha atualmente em atendimento no mesmo guichê é automaticamente marcada como `atendida`
- A fila segue ordem: preferenciais primeiro, depois por ordem de chegada (id ASC)
- Todos os eventos são broadcastados via SSE para todos os clientes conectados
- Operadores remotos podem enviar comandos via Supabase Realtime (WebSocket)

### 3.4 Módulo Admin (`src/admin/`)

**Componentes:** `Dashboard.tsx`, `Configuracoes.tsx` (~106KB), `Seguranca.tsx`, `Operators.tsx`, `Devices.tsx`, `Queue.tsx`, `Relatorios.tsx`, `GerenciarMidias.tsx`, `MediaIndoorAdmin.tsx`, `ToledoConfig.tsx` (~91KB), `AdminEncarte.tsx`, `AdminLayout.tsx`, `OnboardingWizard.tsx`

#### 3.4.1 Dashboard
- Métricas do dia: senhas emitidas, atendidas, aguardando
- Gráficos: senhas por hora, senhas por balcão (Recharts)
- Visão rápida do estado da fila

#### 3.4.2 Configurações (Módulo Massivo)
- **Identidade Visual:** nome do estabelecimento, cor primária customizável, logo
- **Fila de Senhas:** prefixos, labels, tipos de fila (normal/preferencial), reset diário
- **Telão:** arte de espera, ticker, TTS (voz/velocidade/tom/template), agendamento de layouts
- **Totem:** screensaver, solicitar nome do cliente, modo kiosk
- **Impressora Térmica:** interface, tipo (EPSON/Star), largura, rodapé, logo do ticket
- **Toledo/Balança:** caminho de rede, formato do arquivo, fonte de descrição/preço
- **Atualização:** caminho local para atualizações offline, auto-update
- **Backup:** backup automático agendado, escopo selecionável (config/operadores/mídias)
- **Rede:** exibição do IP do servidor para configuração dos terminais clientes

#### 3.4.3 Segurança
- Gerenciamento de usuários (CRUD) com perfis `admin` e `operador`
- Senha de acesso remoto (Master Password) com hash scrypt
- Rate limiting anti-brute-force (5 tentativas, bloqueio de 15 min por IP)
- Tokens de sessão remota com TTL de 12h
- Configuração de autenticação local obrigatória (`auth_local_obrigatorio`)
- Primeiro acesso com troca obrigatória de senha

#### 3.4.4 Dispositivos (Telões)
- Listagem de todos os telões registrados
- Vinculação por código com seleção de módulos ativos
- Desvinculação e reinicialização remota
- Configuração de template de layout por dispositivo

#### 3.4.5 Relatórios
- Exportação de dados de atendimento
- Geração de PDF com jspdf-autotable

#### 3.4.6 Toledo/Encarte
- Configuração do File Watcher (caminho de rede, formato)
- Gerenciamento de categorias de produtos
- Filtros de exclusão (palavras-chave)
- Renomeação de produtos para exibição
- Temas do encarte (backgrounds com vigência)
- Forçar releitura manual do arquivo de preços
- Log de processamento em tempo real
- Suporte a múltiplos formatos: Toledo MGV5/6/7, Filizola, Gertec, CADS, Isolidus, CSV, XLSX, etc.

#### 3.4.7 Mídia Indoor Inteligente
- CRUD de itens de mídia (imagem, vídeo, HTML, YouTube)
- Campanhas com data de início/fim e prioridade
- Temas visuais com CSS customizado
- Agendamento por dias da semana
- Playlist ativa com resolução de campanhas por prioridade

#### 3.4.8 Onboarding Wizard
- Wizard de primeiro acesso para configuração inicial do sistema

### 3.5 Portal do Cliente (`src/cliente/`)

**Componente:** `ClientePortal.tsx`

**Funcionalidades:**
- Acompanhamento da fila em tempo real via navegador do celular (4G)
- Acesso via QR Code gerado no ticket ou exibido no telão
- Visualização da posição na fila e status da senha
- Notificação sonora configurável quando a vez está próxima
- Exibição do catálogo de produtos Toledo com preços (quando configurado)
- Dados servidos pelo Supabase (sem necessidade de VPN/tunnel)

**Regras de negócio implícitas:**
- O portal lê dados do Supabase (cloud), não do servidor local
- A sync local→cloud é feita via Outbox Pattern (fila SQLite → worker 5s → Supabase REST)
- Se a internet cair, os dados ficam na fila local até reconectar
- Comandos do operador remoto (CHAMAR_PROXIMA, REPETIR, ESTORNAR) são enviados via tabela `comandos_operador` no Supabase e consumidos via Realtime WebSocket com fallback de polling 30s

### 3.6 Sistema de Autenticação

**Arquitetura Dual (Legado + Novo):**

1. **Tabela `operadores`** (legada) — senhas em scrypt customizado
2. **Tabela `usuarios`** (nova) — senhas em bcrypt (via `bcryptjs`)
3. **JWT** para autenticação remota (Bearer token), expiração de ~10 anos (3650 dias)
4. **Sessões `sessoes_operador`** para compatibilidade com o middleware `requireAuth` legado
5. **Tokens Master Remotos** (`tokens_remotos`) para acesso administrativo remoto com TTL 12h
6. **Loopback Token** — token de runtime único para requests locais internos (Supabase CMD → API local)
7. **Bypass local** — quando `LOCAL_APP_NO_LOGIN=true` + loopback + Electron, autenticação é dispensada

### 3.7 Sistema de Auto-Atualização

- electron-updater com GitHub Releases como fonte padrão
- Suporte a **atualização offline/local** via pasta `C:\ChamaAi_Atualizacoes` com `latest.yml`
- Servidor HTTP local (`/local-updates`) para servir atualizações offline ao electron-updater
- Script `.bat` externo para matar processos, executar instalador e reiniciar
- Backup automático do SQLite antes de cada atualização
- Histórico de atualizações e rollbacks na tabela `update_history`
- Notificação visual global de atualização disponível/baixada

### 3.8 Sistema de Backup e Recuperação

- **Backup manual** via ZIP com escopo selecionável (config, operadores, balcões, mídias)
- **Backup agendado** (cron diário) com opt-in via configuração
- **Restauração completa** via upload de ZIP
- **Backup automático pré-atualização** via `VACUUM INTO`
- **Safe Mode** — quando o renderer trava ou o DB falha, o sistema entra em modo seguro
- **Watchdog** — monitora se o renderer respondeu em 15-30s; tenta reload, depois Safe Mode
- **Recovery History** — log persistente de todos os eventos de recuperação

### 3.9 Comunicação em Tempo Real (SSE)

**Eventos SSE Broadcastados:**

| Evento | Trigger |
|---|---|
| `NOVA_SENHA_EMITIDA` | Totem emite nova senha |
| `NOVA_SENHA_CHAMADA` | Operador chama próxima senha |
| `SENHA_ATENDIDA` | Operador conclui atendimento |
| `SENHA_ESTORNADA` | Operador devolve senha para fila |
| `SENHA_CANCELADA` | Operador cancela senha |
| `CONFIG_ATUALIZADA` | Admin altera configurações |
| `MIDIAS_ATUALIZADAS` | Admin gerencia mídias |
| `TOLEDO_PRECOS_ATUALIZADOS` | File Watcher detecta novos preços |
| `DIA_RESETADO` | Cron de reset diário executado |
| `RECARREGAR_PAGINA` | Admin força reload dos terminais |
| `TELAO_VINCULADO` / `TELAO_ATUALIZADO` / `TELAO_DESVINCULADO` | Gestão de dispositivos |
| `MEDIA_SETTINGS_UPDATED` / `MEDIA_ITEMS_UPDATED` / `MEDIA_CAMPAIGN_UPDATED` / `MEDIA_THEME_UPDATED` | Mídia indoor inteligente |
| `ticket-called` / `queue-update` | Eventos especializados para operador touch |

---

## 4. Mapa de Rotas da API (`/api/`)

### 4.1 Rotas Públicas (sem autenticação)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/login` | Login unificado (JWT) |
| `POST` | `/api/logout` | Logout (no-op server-side) |
| `GET` | `/api/configuracoes` | Lê configurações gerais |
| `GET` | `/api/midias` | Lista mídias ativas |
| `GET` | `/api/fila` | Fila de espera (aguardando) |
| `GET` | `/api/chamadas/recentes` | Últimas 5 chamadas |
| `POST` | `/api/senhas` | Emitir nova senha (Totem) |
| `GET` | `/api/senhas/:id/status` | Status + posição de uma senha |
| `GET` | `/api/telao/init` | Registrar novo telão (gera código) |
| `GET` | `/api/telao/profile/:code` | Perfil do telão por código |
| `GET` | `/api/telao/sse/:code` | SSE stream dedicado por telão |
| `GET` | `/events` | SSE stream global |
| `GET` | `/api/network-info` | IPs da rede local |
| `GET` | `/health` | Health check |
| `GET` | `/api/portal/*` | Rotas do Portal do Cliente |

### 4.2 Rotas Autenticadas (requireAuth / JWT)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/auth/me` | Perfil do usuário autenticado |
| `PUT` | `/api/auth/senha` | Alterar senha própria |
| `POST` | `/api/chamar-proxima` | Chamar próxima senha da fila |
| `POST` | `/api/chamadas` | Repetir chamada de uma senha |
| `POST` | `/api/senhas/estornar` | Devolver senha para fila |
| `POST` | `/api/senhas/concluir` | Finalizar atendimento |
| `POST` | `/api/senhas/cancelar` | Cancelar senha |
| `POST` | `/api/operador/proximo` | Operador touch: chamar próxima |
| `POST` | `/api/operador/repetir` | Operador touch: repetir chamada |
| `POST` | `/api/operador/devolver` | Operador touch: devolver à fila |

### 4.3 Rotas Administrativas (requireMaster)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/admin/status` | Status do servidor (master/remoto) |
| `POST` | `/api/admin/auth-master` | Autenticação de acesso remoto |
| `POST` | `/api/admin/logout-master` | Revogar token remoto |
| `POST` | `/api/admin/set-master-password` | Definir senha de acesso remoto |
| `GET` | `/api/dashboard/metricas` | Métricas do dashboard |
| `POST` | `/api/configuracoes` | Salvar configurações |
| `POST` | `/api/configuracoes/logo` | Upload de logo |
| `POST` | `/api/configuracoes/telao-arte` | Upload de arte do telão |
| `POST` | `/api/configuracoes/som` | Upload de som personalizado |
| `CRUD` | `/api/operadores` | Gestão de operadores |
| `CRUD` | `/api/usuarios` | Gestão de usuários |
| `CRUD` | `/api/balcoes` | Gestão de balcões |
| `CRUD` | `/api/midias` | Gestão de mídias |
| `CRUD` | `/api/telao/*` | Gestão de dispositivos telão |
| `CRUD` | `/api/media/*` | Mídia indoor inteligente (items, campaigns, themes) |
| `GET` | `/api/admin/backup` | Gerar backup ZIP |
| `GET` | `/api/admin/backups` | Listar backups existentes |
| `POST` | `/api/admin/restaurar` | Restaurar backup |
| `GET/POST` | `/api/debug-sync/*` | Debug da fila Supabase |
| `GET/POST` | `/api/toledo/*` | Config/refresh de balanças Toledo |
| `CRUD` | `/api/encarte/*` | Filtros, nomes customizados e temas do encarte |
| `CRUD` | `/api/categorias/*` | Gestão de categorias de produtos |
| `CRUD` | `/api/produtos/*` | Catálogo de produtos (Fase 1) |

---

## 5. Gargalos e Débitos Técnicos

### 5.1 🔴 Críticos

| # | Problema | Localização | Impacto |
|---|---|---|---|
| 1 | **Arquivo monolítico de ~4400 linhas** | `server/index.ts` (172KB) | Extremamente difícil de manter, testar ou refatorar. Toda a lógica de negócio, rotas, middleware, cron jobs e helpers estão em um único arquivo. |
| 2 | **Credenciais Supabase hardcoded no código-fonte** | `server/supabase-sync.ts:35-36` | A URL e chave anon do Supabase estão como fallback literal no código. Em caso de vazamento do repositório, a instância Supabase fica exposta. |
| 3 | **Tabelas de autenticação duplicadas** | `operadores` + `usuarios` + `sessoes_operador` + `tokens_remotos` | Duas tabelas de usuários com lógica de hash diferente (scrypt vs bcrypt), gerando complexidade desnecessária e risco de dessincronização. |
| 4 | **JWT com expiração de 3650 dias (~10 anos)** | `server/index.ts:1300` | Tokens virtualmente nunca expiram, anulando o propósito da expiração JWT. Se um token for comprometido, permanece válido por uma década. |
| 5 | **Paths absolutos hardcoded para Windows** | Múltiplos: `C:\\ChamaAi`, `C:\\ChamaAi_Atualizacoes`, `C:\\ChamaAi_Build` | O sistema é completamente dependente do Windows e da estrutura de diretórios `C:\ChamaAi`. Impossível rodar em outro OS ou alterar o diretório de dados. |
| 6 | **Falta total de testes automatizados** | Projeto inteiro | Nenhum arquivo de teste encontrado. Zero cobertura de testes unitários, integração ou E2E. |

### 5.2 🟠 Importantes

| # | Problema | Localização | Impacto |
|---|---|---|---|
| 7 | **Componente Configuracoes.tsx com ~106KB** | `src/admin/Configuracoes.tsx` | Arquivo React único com mais de 3000 linhas. Violação severa de Single Responsibility. |
| 8 | **ToledoConfig.tsx com ~91KB** | `src/admin/ToledoConfig.tsx` | Mesmo problema do item anterior. |
| 9 | **Sem sistema de migrations versionado** | `electron/services/database.ts` | As migrações são feitas inline no startup via `try { ALTER TABLE } catch {}`. Não há numeração, rollback granular, ou rastreabilidade de quais migrações rodaram (exceto `schema_migrations` para Fase 1). |
| 10 | **SSE sem heartbeat resiliente** | `server/index.ts` | Clientes SSE podem ficar "zumbis" sem detecção. Não há heartbeat periódico implementado para manter a conexão viva e detectar desconexões. |
| 11 | **Ausência de validação de input estruturada** | API inteira | Nenhum uso de bibliotecas de validação (Zod, Joi, class-validator). Inputs são verificados manualmente com `if (!campo)`. |
| 12 | **CORS completamente aberto** | `server/index.ts:370` | `origin: true` aceita qualquer origem. Em produção, deveria ser restrito aos domínios conhecidos. |
| 13 | **Versão do App desatualizada na Home** | `src/App.tsx:299` | Home exibe `ChamaAí v1.0.115` mas o package.json está em `1.0.145`. Versão está hardcoded no componente. |
| 14 | **Senhas `admin/admin` no primeiro acesso** | `database.ts:729` | Admin padrão com senha trivial. Apesar de `primeiro_acesso=1` forçar troca, o intervalo entre instalação e primeiro acesso é uma janela de vulnerabilidade. |

### 5.3 🟡 Melhorias Recomendadas

| # | Problema | Descrição |
|---|---|---|
| 15 | **Sem containerização (Docker)** | O deploy depende de instalação manual do Electron via NSIS. Sem Dockerfile ou compose para o servidor. |
| 16 | **Sem logging estruturado** | Winston está nas dependências mas não foi encontrado uso consistente. A maioria dos logs é `console.log/error`. |
| 17 | **Sem rate limiting global** | Rate limit existe apenas para login. Demais endpoints estão desprotegidos contra DDoS/abuso. |
| 18 | **Frontend sem lazy loading** | Todos os componentes são importados estaticamente no App.tsx. Em conexões lentas ou hardware limitado (totem), isso impacta o tempo de carregamento. |
| 19 | **Sem internacionalização (i18n)** | Todo o sistema está hardcoded em pt-BR. Se houver necessidade de expansão, será um refactor massivo. |
| 20 | **Processo de build gera APKs na raiz do projeto** | Múltiplos `.apk` de ~10-13MB estão na raiz do repositório Git. Deveriam estar no `.gitignore` ou em um sistema de artifacts. |
| 21 | **Falta de tipagem forte** | Uso extensivo de `as any` em todo o codebase. Interfaces e types não estão definidos para as entidades do banco. |
| 22 | **Lógica de hash de senha fragmentada** | Três funções diferentes para verificar senhas: `verifyPassword`, `verifyOperatorPassword`, `verifyUserPassword`. Verificam scrypt, bcrypt e plaintext em cascata. |

---

## 6. Próximos Passos

> *Seção reservada para planejamento de melhorias futuras.*
> *Preencher conforme priorização do time.*

### 6.1 Curto Prazo (Quick Wins)

- [ ] _A definir_

### 6.2 Médio Prazo (Refactoring)

- [ ] _A definir_

### 6.3 Longo Prazo (Evolução)

- [ ] _A definir_

---

> **Nota:** Este documento foi gerado a partir de análise estática do código-fonte e não substitui entrevistas com stakeholders ou análise de métricas de uso em produção. Recomenda-se validação cruzada com o time de produto antes de usar como base para decisões arquiteturais.
