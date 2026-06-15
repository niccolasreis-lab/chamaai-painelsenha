# 🚀 ChamaAí - Sistema de Gestão de Filas e Totem de Senhas

ChamaAí é um ecossistema completo de alta performance para controle de filas, painel de chamada de senhas, totens de atendimento e painéis de encartes/mídia indoor. Desenvolvido com foco em estabilidade e otimização para hardwares limitados (como computadores de Totem e TVs embarcadas), o sistema utiliza uma arquitetura híbrida robusta combinando **Electron**, **React**, **Express** e banco de dados **SQLite** local com sincronização **Supabase** na nuvem.

---

## 🛠️ Tecnologias Utilizadas

* **Core do App Desktop/Mobile**: Electron 30, Capacitor Android 8.3
* **Front-end**: React 19, TypeScript, Vite 8, TailwindCSS 3.4
* **Back-end Local**: Express 5, Node-Cron, Winston (Logger)
* **Banco de Dados**: SQLite (`better-sqlite3` empacotado nativamente)
* **Sincronização Cloud**: Supabase Client (sincronização assíncrona bidirecional)
* **Impressão**: `node-thermal-printer` nativo
* **Integrações/Media**: Open-Meteo API (Clima), Web Audio API

---

## 🏗️ Arquitetura do Sistema

O sistema é dividido em três camadas principais:

### 1. Processo Principal (Electron - `electron/`)
* **Gerenciamento de Janelas**: Kiosk mode blindado com bloqueio estrito de atalhos do Windows, perfeito para totens de atendimento de livre acesso.
* **Compatibilidade e Resiliência Gráfica**: Executa switches de linha de comando (`no-sandbox`, `disable-gpu`) desativando aceleração de hardware problemática.
* **Impressora Térmica**: Serviço nativo integrado para comunicação direta via USB, serial ou rede (Epson/ESC-POS) com impressão automática de tickets de senhas e relatórios.
* **Atualizador Inteligente**: Motor de auto-atualização offline que consome pacotes em rede local e executa a instalação silenciosa.

### 2. Servidor Local (Express - `server/` na porta `3001`)
* **API REST local & SSE**: API administrativa e canal de Server-Sent Events de altíssima velocidade para alteração instantânea de senhas e eventos.
* **Toledo Watcher**: Monitor inteligente de arquivos de balanças Toledo em tempo real.
* **Supabase Sync Worker**: Mecanismo de backup que espelha dados locais para o Supabase de forma assíncrona (padrão Outbox) garantindo resiliência offline.
* **Serviço de Mídia Indoor**: Gerencia uploads e integrações climáticas com cache local.

### 3. Front-end (React + Tailwind - `src/` rodando no dev server na porta `5175`)
* **Design System**: Interface baseada em Glassmorphic design, cores dinâmicas e tipografia Google Fonts.
* **Player Otimizado**: Web Audio API para reprodução de toques sem distorções em TVs e Dongles.
* **Roteamento Dinâmico**: 
  * `/totem`: Emissor de senhas interativo.
  * `/telao`: Painel de visualização de chamadas e mídia.
  * `/operador` ou `/operador-touch`: Terminal para guichês.
  * `/admin`: Dashboard administrativo.

---

## ⚙️ Guia Passo a Passo: Recriando o Sistema do Zero

Siga as instruções abaixo para preparar seu ambiente, instalar, rodar e compilar o projeto.

### 1. Pré-requisitos

Certifique-se de ter os seguintes softwares instalados em sua máquina:
* **Node.js** (versão 20 ou superior recomendada).
* **Git** (para controle de versão e clone).
* (Para compilação Windows) **Visual Studio Build Tools** (necessário para compilar o SQLite nativo em C++ no Windows).
* (Para compilar o APK) **Android Studio** com SDK configurado.

### 2. Clonando o Repositório

```bash
git clone https://github.com/niccolasreis-lab/chamaai-painelsenha.git
cd chamaai-painelsenha
```

### 3. Instalando as Dependências

Como o sistema utiliza bibliotecas nativas como `better-sqlite3`, é crucial que as dependências sejam instaladas corretamente.

```bash
npm install
```

### 4. Configurando Variáveis de Ambiente (.env)

Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:

```bash
# Copie o exemplo
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais do Supabase:
```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_KEY=sua_chave_anon_do_supabase
```

### 5. Compilando Dependências Nativas (Crucial para Electron/SQLite)

Antes de rodar a aplicação via Electron, você precisa reconstruir os binários C++ do SQLite para a arquitetura do Electron:

```bash
npm run rebuild:native
```

### 6. Executando em Ambiente de Desenvolvimento

Para trabalhar no projeto, você tem algumas opções de scripts que levantam partes diferentes do ecossistema:

* **Modo Completo (Vite + Express + Electron):**
  ```bash
  npm run dev
  ```
  *(Isso iniciará o servidor Vite na 5175, o Express na 3001 e abrirá a janela nativa do Electron).*

* **Modo Web Puro (Vite + Express sem Electron):**
  ```bash
  npm run dev:web
  ```
  *(Útil para depurar componentes React rapidamente no navegador).*

* **Apenas Servidor Local:**
  ```bash
  npm run dev:server
  ```

### 7. Construindo para Produção

Quando o sistema estiver pronto para ir para os clientes, você precisa compilar os instaladores e APKs.

#### A) Gerando Executável para Windows (.exe)
```bash
npm run build:dist
```
O instalador NSIS será gerado na pasta `C:/ChamaAi_Build` (conforme configurado no `package.json`).

#### B) Compilando o Aplicativo Android (TVs / Tablets)
Para rodar no Kiosk das TVs e Totens touch Android:
```bash
# 1. Compila o React e Sincroniza com as pastas do Android
npm run android:sync

# 2. Abre o projeto no Android Studio para gerar o APK
npm run android:open
```

---

## 📂 Estrutura de Diretórios

* `electron/`: Código fonte do Processo Principal (serviços de impressora, sandbox, db interceptor).
* `server/`: API Local em Express, SSE e fluxos de sincronização em segundo plano.
* `src/`: Front-end React com subdiretórios divididos por contexto (`admin`, `telao`, `totem`, `operador`).
* `android/`: Projeto nativo do Capacitor para geração do APK.
* `build/`: Recursos e scripts de instalação do Electron (NSIS).

## ✨ Funcionalidades de Destaque

* **Assistente de Onboarding**: Guia passo a passo interativo para configuração de identidade visual.
* **Mídia Indoor**: Previsão do tempo ao vivo, vídeos, imagens e links do YouTube.
* **Auto-recuperação do Banco**: Detecta bases SQLite corrompidas e auto-gera backups e novas instâncias para impedir bootloops no cliente final.
* **Indicador de 2ª Chamada**: Alerta visual chamativo no telão quando um cliente é re-convocado ao guichê.

---

## 🔒 Licença

Copyright © 2026 **ChamaAí**. Todos os direitos reservados.
