---
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#f0ecf9'
  surface-container-high: '#eae6f4'
  surface-container-highest: '#e4e1ee'
  on-surface: '#1b1b24'
  on-surface-variant: '#464555'
  inverse-surface: '#302f39'
  inverse-on-surface: '#f3effc'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#00687a'
  on-secondary: '#ffffff'
  secondary-container: '#57dffe'
  on-secondary-container: '#006172'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#fcf8ff'
  on-background: '#1b1b24'
  surface-variant: '#e4e1ee'
typography:
  ticket-display:
    fontFamily: Syne
    fontSize: 120px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Syne
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Syne
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: DM Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.15em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin: 32px
---

# ChamaAí — Landing Page Design & Architecture System

Este documento detalha o mapa da estrutura de design, tokens visuais, especificações de layout e integrações aplicadas na Landing Page (`landing.html`) de produção do **ChamaAí**.

---

## Page Structure Map (Mapa de Estrutura)

```text
ChamaAí — Landing Page
├── Solicitar Demonstração (Lead Capture Modal)
│   ├── Campo Nome Completo
│   ├── Campo E-mail Corporativo
│   └── Campo Celular / WhatsApp (formatPhone Mask)
├── Seção Hero & Painel TV Mockup
│   ├── Badges de Status (v1.0.145)
│   └── Painel Interativo ("Senha Atual A204" no "Guichê 03")
├── Seção Nossos Parceiros (Social Proof)
│   └── Mercantil Santa Paula (Logo & Link Canonical)
├── Recursos de Ponta (Bento Grid)
│   ├── Tempo Real via SSE
│   ├── SQLite + Supabase Sync
│   ├── Funcionamento Offline
│   ├── Totens e Kiosks Blindados
│   ├── Impressão Térmica ESC/POS
│   └── Guichês & Telões Ilimitados
├── Como Funciona o Atendimento (Fluxo 1-4)
└── FAQ Interativo (Acordeão em Vanilla JS)
```

---

## Brand & Visual System (Identidade Visual)

### 1. Paleta de Cores (Soft Slate & Royal Purple)
A landing page utiliza tons harmônicos projetados para transmitir estabilidade e facilidade de uso:
- **Cor Primária (Royal Purple):** `#7c3aed` (purple-600) para botões principais, focos de inputs e links ativos.
- **Cor Secundária (Teal):** `#0d9488` (teal-600) para contrastes finos e chamadas complementares.
- **Cor de Sucesso (Emerald):** `#10b981` (emerald-500) para status de rede conectados e ícone `<Check />` do Modal.
- **Cor de Fundo (Soft Slate):** `#f8fafc` (slate-50) como plano de fundo limpo e leve.
- **Cards e Superfícies:** `#ffffff` (branco puro) com bordas arredondadas de `24px` / `28px` e sombras sutis indigo-tintadas (`box-shadow: 0 20px 40px -10px rgba(124, 58, 237, 0.12)`).

### 2. Tipografia
Implementação de fontes elegantes do Google Fonts:
- **Títulos (h1, h2, h3):** Família **Outfit**, proporcionando um tom corporativo contemporâneo e moderno.
- **Corpo do texto:** Família **Inter**, otimizada para máxima legibilidade nos cards de funcionalidades e respostas do FAQ.
- **Números de Senha:** Família **Syne** com fonte Bold expressiva.

---

## Detalhamento das Diretrizes de Design por Seção

### 1. Seção Hero & Mockup Interativo
- **Copywriting Persuasivo:** Focado na redução da ansiedade do cliente durante a espera, e em como o ChamaAí organiza o atendimento em clínicas, cartórios, bancos e varejo.
- **Painel Mockup (Direita):**
  - Simula uma tela de chamadas de TV de forma realista.
  - Exibe a senha ativa **A204** no **Guichê 03** com efeitos sutis de animação e pulso de rede.
  - Indicador de status "PAINEL AO VIVO" com respiração verde pulsante.
  - Exibição de fila de espera lateral (`A205`, `B012`, `A206`, `C007`) e relógio atualizado dinamicamente via Javascript.

### 2. Autoridade (Nossos Parceiros)
- Grade horizontal com logotipos de clientes de forma limpa.
- **Mercantil Santa Paula:** Destaque obrigatório utilizando o logotipo oficial de alta resolução (`https://i.imgur.com/D5rpk7D.png`) e apontamento canônico exato (`https://www.mercantilsantapaula.com.br/`) com atributos `rel="canonical"` e `target="_blank"`.

### 3. Bento Grid (Funcionalidades)
Layout assimétrico e responsivo (`grid-template-columns: repeat(6, 1fr)`) com cards expandindo-se dinamicamente (`col-4`, `col-3`, `col-2`):
- **Tempo Real SSE:** Explicita a latência sub-100ms de eventos locais.
- **SQLite + Supabase Sync:** Explica a tolerância a falhas (resiliência offline total).
- **ESC/POS Native Printer:** Conexão direta com Elgin, Epson e Bematech.
- **Modo Kiosk Blindado:** Segurança estrita de atalhos e foco de janela em totens.

### 4. FAQ Interativo
- Acordeão sanfona fluida construído em Javascript e CSS Vanilla.
- Transições de expansão e colapso dinâmicas controladas pela propriedade `max-height` baseada no `scrollHeight` de cada bloco.
- Responde objetivamente sobre funcionamento offline, compatibilidade ESC/POS e suporte a guichês ilimitados.

### 5. Modal de Captura de Leads (Contrato Técnico)
- **Máscara de Telefone (`formatPhone`):** Formatação em tempo real como `(XX) XXXXX-XXXX` ou `(XX) XXXX-XXXX`, com validação mínima de 14 caracteres formatted para prosseguir.
- **Webhook n8n:** Chamada POST assíncrona via `fetch` para `https://n8n-n8n.hijn5u.easypanel.host/webhook/chamaai-lead` enviando o payload `{ name, email, phone, source: 'Landing Page ChamaAí' }`.
- **Estados Visuais de Submissão:**
  - **isSubmitting:** Alterna para a tela com Spinner circular e texto "Enviando...", bloqueando interações.
  - **isSuccess:** Dispara o círculo verde de sucesso contendo o ícone `<Check />` animado (com propriedades de stroke dasharray/dashoffset do SVG) e fecha o modal automaticamente após 2 segundos.
- **WhatsApp Direct Link:** Constante `WHATSAPP_LINK` centralizada apontando para o número de atendimento celular.