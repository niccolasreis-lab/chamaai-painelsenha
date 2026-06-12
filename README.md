# 🚀 ChamaAí - Sistema de Gestão de Filas e Totem de Senhas

ChamaAí é um ecossistema completo de alta performance para controle de filas, painel de chamada de senhas, totens de atendimento e painéis de encartes/mídia indoor. Desenvolvido com foco em estabilidade e otimização para hardwares limitados (como computadores de Totem e TVs embarcadas), o sistema utiliza uma arquitetura híbrida robusta combinando Electron, React, Express e banco de dados SQLite local com sincronização Supabase na nuvem.

---

## 🏗️ Arquitetura do Sistema

O sistema é dividido em três camadas principais:

```mermaid
graph TD
    A[Electron Main Process] <-->|IPC Bridge| B[React Frontend]
    A <-->|Direct Database| C[SQLite Database]
    D[Express Local Server (Port 3001)] <-->|Local API & SSE| B
    D <-->|Direct Database| C
    D <-->|Supabase Sync Worker| E[Supabase Cloud]
    D <-->|Toledo Watcher| F[Balanças Toledo]
    G[Media Indoor Engine] <-->|Open-Meteo Cache| C
```

### 1. Processo Principal (Electron - `electron/`)
* **Gerenciamento de Janelas**: Kiosk mode blindado com bloqueio estrito de atalhos do Windows (`Alt+F4`, `Ctrl+W`, `Ctrl+Q`), perfeito para totens de atendimento de livre acesso.
* **Compatibilidade e Resiliência Gráfica**: Executa switches de linha de comando como `no-sandbox`, `disable-gpu` e `disable-gpu-sandbox`, desativando aceleração de hardware problemática. Isso permite rodar o sistema a partir de drives de rede mapeados (ex: `Z:\`) ou ambientes de máquinas virtuais (VMs) sem drivers de vídeo homologados.
* **Impressora Térmica**: Serviço nativo integrado (`node-thermal-printer`) para comunicação direta via USB, serial ou rede (Epson/ESC-POS) com impressão automática de tickets de senhas e relatórios.
* **Atualizador Inteligente**: Motor de auto-atualização offline que consome pacotes em rede local e executa a instalação silenciosa sem travar processos.

### 2. Servidor Local (Express - `server/` na porta `3001`)
* **API REST local**: Responsável pelas chamadas administrativas, gerenciamento de operadores e emissão de senhas.
* **SSE (Server-Sent Events)**: Canal de comunicação em tempo real de altíssima velocidade para alteração instantânea de senhas, eventos de chamada e comandos entre guichês, telões e operadores.
* **Toledo Watcher**: Monitor inteligente de arquivos de balanças Toledo em tempo real para sincronização rápida de preços e encartes.
* **Supabase Sync Worker (Low Latency)**: Mecanismo de backup redundante que espelha dados locais para o Supabase de forma assíncrona. Otimizado com padrão *Outbox* que dispara o worker em background imediatamente com delay de 50ms para reduzir a latência de sincronização no painel administrativo.
* **Serviço de Mídia Indoor**: Gerencia uploads e integrações climáticas (API Open-Meteo) com cache local em banco de dados de 30 minutos para evitar chamadas de rede redundantes.

### 3. Front-end (React + Tailwind - `src/` rodando no dev server na porta `5175`)
* **Design System Premium**: Interface de altíssimo nível baseada em *Glassmorphic design*, cores tailoreadas em HSL, tipografia Google Fonts, transições suaves e micro-animações.
* **Web Audio API Player**: Reprodutor sonoro que substitui o player nativo padrão por decodificação em buffer com ganho normalizado e limitado a `0.75`. Isso elimina clipping e distorções em TVs e aparelhos móveis/Dongles (como Xiaomi Mi Box S).
* **Renderização Otimizada**: Desacoplamento da animação de chamada e do início do sinal sonoro (delay de 300ms na campainha) para evitar stuttering (engasgos) de renderização. Uso de `will-change: transform` e aceleração GPU no número chamado.
* **Roteamento Dinâmico**: Telas dedicadas e switches configuráveis por URLs:
  * `/totem`: Emissor de senhas interativo com suporte a voz e impressão física.
  * `/telao`: Painel de visualização de chamadas com som sonoro customizado e mídia programática.
  * `/operador` ou `/operador-touch`: Terminal para guichês chamarem a próxima senha, gerenciarem fila e reimprimirem tickets.
  * `/admin`: Dashboard de estatísticas, configurações de impressora, operadores e monitoramento.

---

## ✨ Funcionalidades de Destaque

### 📺 Sistema de Mídia Indoor Avançado
O sistema agora possui um reprodutor de mídia indoor inteligente e configurável:
* **Conteúdos Suportados**: Imagens Locais (Upload), Vídeos locais (Upload), links do YouTube e Páginas Web integradas.
* **Clima em Tempo Real**: Widget de previsão do tempo integrado à API do Open-Meteo, com sistema resiliente de cache local SQLite de 30 minutos.
* **Layouts de Exibição**:
  * **Lateral**: Mídia na direita ocupando 30% da tela e senhas ocupando 70%.
  * **Rodapé**: Barra inferior de 256px de mídia, com senhas em cima.
  * **Background**: Mídia esticada no plano de fundo com opacidade reduzida.
  * **Full Screen**: Mídia em tela cheia com escurecimento automático temporário apenas durante a chamada de uma nova senha.
* **Agendamento por Campanhas**: Filtros de data de início/fim (`start_at` / `end_at`), horários e dias da semana (`weekdays`). Campanhas prioritárias podem sobrescrever a grade padrão de programação (`replace_default_schedule`).
* **Temas Visuais**: Modificação de estilos CSS customizados, cores e logotipos aplicados de forma global ou vinculados a campanhas sazonais.

### ⚙️ Assistente de Onboarding
* Guia passo a passo interativo (`OnboardingWizard`) que facilita a configuração inicial da aplicação.
* **Configuração do Negócio**: Nome do estabelecimento, CNPJ e tipo de atuação.
* **Identidade Visual**: Paletas de cores padrão sugeridas ou entrada HEX customizada, configurando a cor da marca do estabelecimento de ponta a ponta.
* Salva os estados intermediários no `localStorage` para evitar perda de progresso em recarregamentos acidentais.

### ↩️ Indicador de Segunda Chamada (Repetição)
* Ao re-chamar uma senha existente, o servidor emite uma flag `repeticao: true` no fluxo SSE.
* O telão renderiza um badge laranja vibrante de **⚠ 2ª CHAMADA** e aplica um efeito pulso dinâmico em laranja (`.animate-pulse-orange`), garantindo que o cliente perceba o re-chamado de forma prioritária.

### 🔒 Segurança & Controle de Acesso
* **Criptografia de Senhas**: As credenciais dos operadores são hasheadas usando a função criptográfica de derivação de chave **Scrypt** do Node.js (`scrypt$salt$hash`).
* **Mecanismo de Fallback**: Caso a senha existente esteja armazenada em texto plano (migração de legado), o sistema executa a checagem direta e hashes a senha no próximo salvamento, prevenindo bloqueio de operadores antigos.
* **Alertas de Credencial Padrão**: Banners de alta prioridade são exibidos no painel administrativo e login se o usuário e senha de fábrica `admin/admin` ainda estiverem ativos.
* **Route Guards de Redes Locais**: Wrappers de proteção impedem acesso às rotas internas (`/admin/queue`, etc.) se a opção de autenticação local for exigida.

### 🩹 Auto-recuperação do Banco de Dados SQLite
* Durante a inicialização no Electron (`electron/services/database.ts`), caso o banco local SQLite seja detectado como corrompido (`SQLITE_NOTADB`), o inicializador intercepta o erro, renomeia o arquivo corrompido adicionando um sufixo temporal de segurança, e gera automaticamente um banco novo zerado. Isso evita que a aplicação quebre em loops de inicialização.

---

## 🛠️ Tecnologias Utilizadas

* **Core**: React 19, TypeScript, Vite 8, Electron 30.
* **Servidor**: Express 5, Node-Cron (rotinas de limpeza física do banco), Winston (logger centralizado).
* **Banco de Dados**: SQLite local (`better-sqlite3` empacotado nativamente).
* **Nuvem**: Supabase Client (sincronização assíncrona bidirecional por banco local offline).
* **Estilização**: TailwindCSS e CSS Vanilla baseada em variáveis HSL.

---

## 📂 Estrutura de Diretórios

```text
├── .agents/                 # Configuração dos Agentes de IA e skills
├── android/                 # Código nativo para empacotamento móvel (Capacitor)
├── build/                   # Recursos de build do Electron (NSIS, ícone, installer.nsh)
├── dist/                    # Distribuição compilada final do Frontend React
├── dist-electron/           # Distribuição compilada final do processo principal do Electron
├── electron/                # Código fonte do Processo Principal (Electron)
│   ├── services/            # Serviços nativos (database.ts, printer.ts)
│   ├── main.ts              # Ponto de entrada do Electron, tratamento de portas e sandbox
│   └── preload.ts           # Ponte de segurança IPC exposta ao front-end
├── server/                  # Código fonte do Servidor Local (Express 5)
│   ├── index.ts             # APIs, fluxo SSE, inicialização de porta 3001
│   ├── media-indoor.ts      # Regras de negócio, previsão do tempo Open-Meteo e upload de mídia
│   ├── supabase-sync.ts     # Worker assíncrono de sincronização outbox na nuvem
│   └── toledo-watcher.ts    # Monitor de atualizações de balança Toledo
├── src/                     # Código fonte do Frontend (React 19)
│   ├── admin/               # Módulos administrativos (Mídia Indoor, ToledoConfig, OnboardingWizard)
│   ├── shared/              # Componentes comuns, player Web Audio API (sounds.ts)
│   ├── telao/               # Visualizadores e layouts da TV (SmartMediaLayer, SenhaChamada)
│   ├── totem/               # Emissor de senhas e geração de ticket QR Code
│   ├── App.tsx              # Rotas do frontend e Route Guards
│   └── main.tsx             # Inicialização do React
├── reset-admin.js           # Utilitário CLI para redefinir senha do administrador
├── package.json             # Scripts do projeto e controle de dependências
└── vite.config.ts           # Configurações do bundler Vite (porta 5175, mkcert)
```

---

## 🚀 Scripts Disponíveis

No diretório raiz do projeto, você pode rodar os seguintes comandos:

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor Vite (5175) e o Electron concorrentemente em desenvolvimento. |
| `npm run dev:server` | Executa de forma isolada apenas o servidor local Express 5. |
| `npm run dev:web` | Executa o frontend e o servidor local simultaneamente (ambiente puramente web). |
| `npm run build` | Compila o front-end React e os arquivos Typescript do Electron. |
| `npm run rebuild:native` | Reconstrói binários nativos (`better-sqlite3`) para a arquitetura alvo. |
| `npm run build:dist` | Reconstrói binários, compila o projeto e empacota o instalador executável (`.exe`) de produção. |
| `npm run publish:update` | Compila e publica os arquivos de atualização diretamente no GitHub Releases do repositório. |
| `npm run android:sync` | Compila o frontend do React e sincroniza as atualizações com o Capacitor Android. |
| `npm run android:open` | Abre o projeto Android no Android Studio para depuração ou compilação de APKs de TV/Móvel. |
| `att.bat` | Script local automatizado de compilação rápida de lote e cópia offline de binários. |

---

## 🔄 Sistema de Atualização Automática Offline

O ChamaAí possui um sistema de atualizações sem dependência de conexões de internet externa, otimizado para redes locais privadas de estabelecimentos:

```text
[Aplicativo Instalado (v1.0.x)] 
      │
      ├── 1. Faz busca local HTTP em: http://localhost:3001/local-updates
      ├── 2. Detecta versão mais recente em pasta física configurada no Windows (C:\ChamaAi_Atualizacoes)
      ├── 3. Efetua o download silencioso do instalador MSI/EXE para a pasta de arquivos temporários
      ├── 4. Exibe card visual no painel: "Atualização Disponível - Instalar Agora"
      │
      └── Ao clicar:
            ├── A. Fecha a aplicação ativa instantaneamente (liberando locks de banco SQLite)
            ├── B. Dispara o arquivo em lote 'executar_atualizacao.bat' em thread separada
            ├── C. O lote aguarda o processo morrer, roda o novo instalador em modo silencioso (/S)
            ├── D. O lote reinicia a aplicação recém-compilada
            └── E. O front-end inicializa e exibe card esmeralda de boas-vindas com a nova versão
```

### Otimizações do Instalador Windows (`installer.nsh`)
1. **Bypass de travamento de registro**: O instalador utiliza a macro `preInit` para remover chaves obsoletas do desinstalador antigo. Isso evita erros de desinstalação silenciosa e permite uma sobreposição 100% limpa.
2. **Auto-inicialização Inteligente**: O script garante que, independente do modo de inicialização (desenvolvimento ou produção), o aplicativo reabrirá instantaneamente após a instalação ser concluída.

---

## 💻 Otimizações de Hardware (Totens & TVs)

O sistema possui switches de performance agressivos projetados especificamente para rodar com fluidez em processadores Celeron e 2GB/4GB de RAM (muito comuns em totens de atendimento e painéis de TV antigos):
* **Flags ativadas via CLI (Kiosk Mode)**:
  * `disable-site-isolation-trials`: Reduz drasticamente o consumo de RAM em multi-telas.
  * `disable-smooth-scrolling`: Melhora a velocidade de resposta das telas de toque infravermelho/capacitivas.
  * `--max-old-space-size=512`: Limita o Garbage Collector do V8 do Javascript a 512MB para evitar vazamentos de memória.
  * `disable-features=CalculateNativeWinOcclusion`: Evita processamento em segundo plano desnecessário do Windows.

---

## 🔒 Licença

Copyright © 2026 **ChamaAí**. Todos os direitos reservados.
