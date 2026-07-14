# Design System Resumido

## Fonte de verdade

Este documento é a referência para tokens, escalas e componentes. Após aprovação, será consolidado no `DESIGN.MD` da raiz. Até lá, o `DESIGN.MD` existente permanece inalterado.

---

## Paleta de cores

### Núcleo da marca

| Token              | Valor       | Função                                        | Contraste s/ branco |
|--------------------|-------------|-----------------------------------------------|--------------------:|
| `--primary`        | `#3525CD`   | Ação principal, seleção, marca                | 9.14:1 — AAA        |
| `--secondary`      | `#00687A`   | Informação, apoio, links secundários          | 6.44:1 — AA         |
| `--ink`            | `#1B1B24`   | Texto principal, títulos                      | 17.09:1 — AAA       |
| `--ink-variant`    | `#464555`   | Texto secundário, captions, rótulos           | 9.36:1 — AAA        |

### Superfícies

| Token                      | Valor       | Uso                                      |
|----------------------------|-------------|------------------------------------------|
| `--surface`                | `#FFFFFF`   | Cards, painéis, diálogos                 |
| `--surface-container`      | `#f0ecf9`   | Agrupamentos, sidebar, áreas recuadas    |
| `--surface-container-low`  | `#f5f2ff`   | Faixas alternadas, hover sutil           |
| `--background`             | `#fcf8ff`   | Plano de fundo da aplicação              |
| `--outline`                | `#777587`   | Bordas neutras, divisores                |
| `--outline-variant`        | `#c7c4d8`   | Bordas sutis, separadores internos       |

### Semânticas

| Token              | Valor       | Contraste s/ branco | Nota                         |
|--------------------|-------------|--------------------:|------------------------------|
| `--success`        | `#059669`   | 3.77:1 — AA-large   | Usar com texto ≥18px ou bold ≥14px; para texto normal, usar `#047857` (4.87:1) |
| `--warning`        | `#d97706`   | 3.19:1 — AA-large   | Idem; para texto normal, usar `#b45309` (5.36:1) |
| `--error`          | `#dc2626`   | 4.83:1 — AA         | Mensagens de erro e ações destrutivas |
| `--error-container`| `#ffdad6`   | —                   | Fundo de alertas de erro     |

> [!IMPORTANT]
> Success e Warning passam AA apenas para texto grande. Para texto de corpo (≤14px regular), usar as variantes escuras indicadas acima.

### Inversas (telão escuro, modais sobrepostos)

| Token                   | Valor       | Uso                              |
|-------------------------|-------------|----------------------------------|
| `--inverse-surface`     | `#302f39`   | Fundo escuro                     |
| `--inverse-on-surface`  | `#f3effc`   | Texto sobre fundo escuro         |
| `--inverse-primary`     | `#c3c0ff`   | Ações sobre fundo escuro         |

---

## Tipografia

### Famílias

| Token           | Família       | Peso            | Uso                                                       |
|-----------------|---------------|-----------------|-----------------------------------------------------------|
| `--font-display`| Syne          | 600–800         | Números de senha, marca, headings de grande escala (h1)   |
| `--font-body`   | DM Sans       | 400–700         | Interface, formulários, tabelas, labels, botões, body     |

> [!NOTE]
> Inter não é usada. A referência no `tailwind.config.cjs` é legado e será removida na implementação. Outfit aparece apenas na landing page e não faz parte do design system da aplicação.

### Escala

| Nível         | Família  | Tamanho  | Peso | Altura de linha | Tracking    | Uso principal                  |
|---------------|----------|----------|------|-----------------|-------------|--------------------------------|
| ticket-display| Syne     | 120px    | 700  | 1.1             | -0.02em     | Número de senha no telão       |
| h1            | Syne     | 48px     | 700  | 1.2             | -0.01em     | Título de página               |
| h2            | Syne     | 24px     | 600  | 1.3             | 0           | Subtítulo                      |
| h3            | DM Sans  | 20px     | 600  | 1.4             | 0           | Título de seção                |
| body          | DM Sans  | 16px     | 400  | 1.6             | 0           | Texto de leitura               |
| body-sm       | DM Sans  | 14px     | 400  | 1.5             | 0           | Texto auxiliar                 |
| label         | DM Sans  | 14px     | 500  | 1.2             | 0           | Rótulos de campo               |
| label-caps    | DM Sans  | 11px     | 600  | 1.0             | 0.15em      | Tags, badges, kickers (uso restrito) |
| caption       | DM Sans  | 12px     | 400  | 1.4             | 0           | Timestamps, metadados          |
| tabular       | DM Sans  | —        | 500  | —               | 0           | Preços, métricas, horários (font-variant-numeric: tabular-nums) |

> [!WARNING]
> `label-caps` (11px, uppercase, tracked) deve ser usado apenas em badges e tags. A aplicação atual usa caixa alta e tracking em 531+ locais, a maioria dos quais deve migrar para `label` ou `body-sm` com peso 500.

---

## Espaçamento

Escala baseada em 4px:

| Token  | Valor | Uso típico                                |
|--------|------:|-------------------------------------------|
| `--sp-1`  | 4px  | Gaps mínimos internos                     |
| `--sp-2`  | 8px  | Padding interno, gap entre ícone e texto  |
| `--sp-3`  | 12px | Padding de campos, gap de grupo           |
| `--sp-4`  | 16px | Padding de card, gap de lista             |
| `--sp-6`  | 24px | Padding de seção, gutter de grid          |
| `--sp-8`  | 32px | Margem lateral de página                  |
| `--sp-12` | 48px | Separação entre seções                    |
| `--sp-16` | 64px | Espaçamento vertical major               |

---

## Raios de borda

| Token           | Valor  | Uso                                   |
|-----------------|-------:|---------------------------------------|
| `--radius-sm`   | 6px    | Campos, inputs, tags                  |
| `--radius-md`   | 10px   | Cards, painéis, dropdowns             |
| `--radius-lg`   | 14px   | Modais, diálogos, containers major    |
| `--radius-full` | 9999px | Pills: badges, chips, botões pequenos |

> [!CAUTION]
> O projeto atual usa raios de 20–40px em cards. Conforme o Impeccable, cards devem ter no máximo 12–16px. Os raios acima respeitam essa diretriz com margem moderada.

---

## Elevação (sombras)

| Token             | Valor CSS                                           | Uso                    |
|-------------------|-----------------------------------------------------|------------------------|
| `--shadow-sm`     | `0 1px 2px 0 rgba(27,27,36,0.05)`                  | Hover de card          |
| `--shadow-md`     | `0 4px 6px -1px rgba(27,27,36,0.07), 0 2px 4px -2px rgba(27,27,36,0.05)` | Card ativo, dropdown   |
| `--shadow-lg`     | `0 10px 15px -3px rgba(27,27,36,0.08), 0 4px 6px -4px rgba(27,27,36,0.04)` | Modal, toast           |

Sombras usam a tinta do tema para manter coesão cromática. Sem sombras extras com tint de roxo ou indigo (anti-padrão ghost-card).

---

## Movimento

| Token              | Valor   | Uso                                         |
|--------------------|---------|---------------------------------------------|
| `--duration-fast`  | 150ms   | Feedback de toque, hover                    |
| `--duration-normal`| 200ms   | Transições de estado, abrir/fechar          |
| `--duration-slow`  | 250ms   | Entrada de modais, painéis                  |
| `--ease-out`       | cubic-bezier(0.25, 0, 0.5, 1) | Entrada de elementos       |
| `--ease-in`        | cubic-bezier(0.5, 0, 1, 1)    | Saída de elementos         |

Regras absolutas:
- Sem bounce, elastic ou spring.
- Sem animação contínua ornamental (exceto indicadores de estado como loading).
- Toda animação deve ter alternativa em `@media (prefers-reduced-motion: reduce)`.
- Não animar `width`, `height` ou `top/left`; usar `transform` e `opacity`.

---

## Z-Index

| Token            | Valor | Uso                        |
|------------------|------:|----------------------------|
| `--z-dropdown`   | 10    | Dropdowns, selects         |
| `--z-sticky`     | 20    | Headers fixos, sidebars    |
| `--z-backdrop`   | 30    | Overlay de modal           |
| `--z-modal`      | 40    | Modais, diálogos           |
| `--z-toast`      | 50    | Notificações, toasts       |
| `--z-tooltip`    | 60    | Tooltips                   |

---

## Componentes prioritários

### Botão

| Variante     | Fundo              | Texto              | Borda     | Raio       |
|--------------|---------------------|---------------------|-----------|------------|
| primary      | `--primary`         | `--on-primary` (#FFF)| nenhuma   | `--radius-sm` |
| secondary    | transparente        | `--primary`         | `--primary` 1px | `--radius-sm` |
| ghost        | transparente        | `--ink-variant`     | nenhuma   | `--radius-sm` |
| danger       | `--error`           | #FFF                | nenhuma   | `--radius-sm` |

- Tamanho mínimo de toque: 44×44px (48×48px em totem/touch).
- Estado loading: desabilitar + spinner inline.
- Feedback de hover: escurecer 10%.
- Feedback de active: escurecer 15%, scale(0.98).

### Campo de entrada

- Label visível acima (nunca apenas placeholder).
- Padding: `--sp-3` vertical, `--sp-4` horizontal.
- Raio: `--radius-sm`.
- Borda: `--outline-variant`, foco muda para `--primary` 2px.
- Mensagem de erro abaixo do campo, colorida com `--error`.
- Helper text em `caption` com `--ink-variant`.

### Card

- Fundo: `--surface`.
- Raio: `--radius-md`.
- Padding: `--sp-4`.
- Sem borda + sombra juntos (escolher um).
- Sem cards aninhados.

### Dialog / Modal

- Overlay: `rgba(27,27,36,0.5)`.
- Raio: `--radius-lg`.
- Sombra: `--shadow-lg`.
- Sempre com escape route (botão fechar e tecla Esc).
- Entrada: fade+scale(0.95→1), `--duration-slow`.

### Toast / Notificação

- Posição: topo-direita (admin), centro-inferior (operador/totem).
- Raio: `--radius-md`.
- Auto-dismiss: 5s (sucesso/info), persistente (erro/warning com ação).

### Status / Badge

- Loading: skeleton animado ou spinner, texto "Carregando…".
- Vazio: ilustração sutil + ação principal.
- Erro: mensagem + ação de retry.
- Offline: banner persistente + indicador visual em header.

---

## Ícones

- Família canônica: **Lucide**.
- Tamanho padrão: 20px (interface), 24px (touch/totem).
- Cor herda do texto; ícones de ação seguem a cor do botão.
- Material Symbols permanece apenas nos telões legados durante a migração.

---

## Responsividade por superfície

| Superfície       | Breakpoint base | Densidade    | Alvo de toque | Notas                            |
|------------------|-----------------|--------------|---------------|----------------------------------|
| Administração    | mobile-first    | alta         | 44px          | Grid auto-fit, sidebar colapsável|
| Operador desktop | 1024px+         | alta         | 44px          | Layout horizontal fixo           |
| Operador touch   | 768px+          | média        | 48px          | Layout adaptativo por orientação |
| Operador mobile  | mobile-first    | média        | 48px          | Bottom-nav, swipe                |
| Totem            | 768px+          | baixa        | 48px+         | Texto grande, affordances claras |
| Telão            | 1280px+         | muito baixa  | N/A           | 16:9, retrato, HD→4K             |
| Portal cliente   | mobile-first    | média        | 48px          | Single-column, progressive       |

---

## Acessibilidade

- WCAG 2.2 AA para todas as interfaces web.
- Contraste ≥4.5:1 para texto de corpo; ≥3:1 para texto grande e elementos gráficos.
- Foco visível com outline 2px `--primary` e offset 2px.
- Ordem de tab segue ordem visual.
- `aria-label` obrigatório em botões com apenas ícone.
- `aria-live` para atualizações dinâmicas (fila, chamada de senha).
- `prefers-reduced-motion` respeitado em toda animação.
- Alvos de toque mínimos conforme tabela de superfícies.
- Sem informação transmitida apenas por cor; sempre ícone ou texto acompanha.
