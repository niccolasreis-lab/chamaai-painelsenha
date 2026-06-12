# ChamaAí - Sistema de Gestão de Filas e Totem de Senhas

## Nome do projeto
ChamaAí

## Objetivo principal
Oferecer um ecossistema completo de alta performance, estável e otimizado para controle de filas, painel de chamada de senhas, totens de atendimento interativos e painéis de encarte e mídia programática. É projetado para ser executado com fluidez mesmo em hardwares limitados (como computadores de totem com Celeron/2GB-4GB de RAM e TVs embarcadas).

## Problema que resolve
- **Falta de conexão e instabilidade**: Utiliza uma arquitetura híbrida (SQLite + Supabase) de forma offline-first, permitindo que os totens emitam senhas e operadores trabalhem mesmo sem conexão com a internet.
- **Hardware de baixo custo**: Minimiza o consumo de memória RAM e processamento (flags específicas do Chrome no Kiosk mode, Web Audio API, aceleração por GPU no CSS) para evitar travamentos e stuttering.
- **Gestão de mídias e encartes**: Integra a exibição de encartes de ofertas de balanças Toledo em tempo real, eliminando a necessidade de atualização manual de preços nas TVs de chamada.
- **Operação de livre acesso**: Fornece um modo totem blindado (kiosk) que impede que clientes fechem ou minimizem a aplicação via atalhos do Windows.

## Público-alvo
Estabelecimentos comerciais com atendimento ao público, tais como:
- Supermercados, hipermercados e minimercados.
- Açougues, padarias e peixarias.
- Farmácias, clínicas e laboratórios.
- Lojas de departamentos e centros de serviços.

## Tecnologias utilizadas
- **Frontend Core**: React 19, TypeScript, Vite 8, TailwindCSS, Vanilla CSS (HSL), React Router (HashRouter).
- **Desktop Runtime**: Electron 30, com comunicação IPC Bridge segura.
- **Local Server**: Express 5 (API REST local), Node-Cron (rotinas agendadas), Server-Sent Events (SSE) para comunicação em tempo real.
- **Banco de Dados Local**: SQLite (`better-sqlite3` empacotado nativamente no Electron).
- **Nuvem / Sincronização**: Supabase Client (Sincronização assíncrona bidirecional, Realtime WebSocket e outbox pattern).
- **Periféricos**: node-thermal-printer (comunicação USB/Serial/Rede via ESC-POS com impressoras térmicas).
- **Áudio**: Web Audio API (AudioContext, GainNode) para normalização de ganho (0.75) e eliminação de clipping.

## Estrutura geral
- `.ai/`: Memória persistente e oficial do projeto.
- `.github/` e `.vscode/`: Configurações de repositório e IDE.
- `android/`: Código nativo para empacotamento móvel (Capacitor).
- `build/`: Recursos de compilação (NSIS, ícones, arquivos de setup).
- `electron/`: Código fonte do processo principal do Electron.
  - `services/`: Serviços locais (impressora, banco de dados).
- `server/`: Código fonte do servidor local Express.
  - `db/`: Schema do SQLite e inicializadores.
- `src/`: Código fonte do frontend React.
  - `admin/`: Módulo de administração, relatórios e configurações do sistema.
  - `cliente/`: Portal de acompanhamento de senha pelo smartphone do cliente.
  - `operador/`: Painel de controle de guichê (vertical, horizontal/touch, mobile/PWA).
  - `shared/`: Componentes globais, sound players, etc.
  - `telao/`: Painel de exibição da TV de chamadas e mídias integradas.
  - `totem/`: Interface interativa emissora de senhas para totens.

## Regras de negócio
1. **Emissão de Senhas**: O totem emite senhas sequenciais por balcão de atendimento, respeitando prefixos e prioridades (Preferencial/Normal).
2. **Offline-first**: Qualquer operação de alteração (emissão de senhas, preço de produtos Toledo, etc.) grava primeiro no SQLite e enfileira em `supabase_sync_queue` para sincronização assíncrona.
3. **Resiliência de Rede**: O sincronizador monitora quedas de conexão de forma a não acumular falhas ou esgotar tentativas durante períodos offline (bloqueio temporário ao detectar erros de rede).
4. **Chamada de Senha**: O operador pode chamar a próxima senha, repetir a chamada (ativando o badge `2ª CHAMADA` em laranja e o pulso urgente), estornar ou dar como não-comparecido.
5. **Autenticação**: O login e rotas administrativas `/admin` exigem perfil de administrador. O acesso local a guichês pode exigir autenticação dependendo da configuração.
6. **Mídias e Encartes**: Os encartes de TV mostram produtos lidos do arquivo de balança Toledo e exibem layout adequado à vigência do tema ativo.

## Convenções do projeto
- **Roteamento**: O frontend utiliza HashRouter (`#/`) para navegação em Electron e web local.
- **IPC seguro**: A comunicação entre React e Electron ocorre através da ponte IPC declarada no `preload.ts` (`window.electronAPI`).
- **Padrão de Cores**: As cores primária, secundária e contraste são geradas dinamicamente via variáveis CSS HSL baseadas na cor primária armazenada na tabela `configuracoes`.
- **Criptografia**: Senhas de operadores são armazenadas no SQLite usando Scrypt no formato `scrypt$salt$hash`. Senhas antigas em texto plano possuem fallback automático para comparação direta para compatibilidade legada.
