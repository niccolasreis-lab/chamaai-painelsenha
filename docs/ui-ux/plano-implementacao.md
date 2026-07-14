# Plano de Implementação UI/UX

## Princípio geral

A modernização será feita por superfícies, não monolítica. Cada fase preserva integralmente chamadas de API, rotas, estados, regras de fila, impressão, SSE e comportamento offline. Nenhuma funcionalidade ou regra de negócio é alterada.

---

## Pré-requisito: leitura de documentos

Antes de iniciar qualquer fase, o implementador deve ter lido e compreendido:

1. [PRODUCT.md](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/PRODUCT.md) — contexto do produto, público e princípios.
2. [docs/ui-ux/diagnostico.md](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/docs/ui-ux/diagnostico.md) — estado atual quantificado.
3. [docs/ui-ux/direcao-visual.md](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/docs/ui-ux/direcao-visual.md) — norte criativo e decisões visuais.
4. [docs/ui-ux/design-system.md](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/docs/ui-ux/design-system.md) — tokens, escalas, componentes e regras.
5. Skill [UI UX Pro Max](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/.codex/skills/ui-ux-pro-max/SKILL.md) — para recomendações de design.
6. Skill [Impeccable](file:///z:/01%20-%20ADMINISTRATIVO/Nícolas/saas/ChamaAI/Chamaai_code_font/.agents/skills/impeccable/SKILL.md) — para auditoria e polish.

---

## Fase 0 — Tokens e fundação

**Escopo:** Criar o design system em código sem alterar nenhuma tela.

### Arquivos envolvidos

| Ação     | Arquivo                            | O que muda                                     |
|----------|------------------------------------|-------------------------------------------------|
| MODIFY   | `src/index.css`                    | Custom properties (todas as tokens do design system), remoção de variáveis conflitantes, prefers-reduced-motion global |
| MODIFY   | `tailwind.config.cjs`              | Alinhar cores, fontes e escalas com tokens CSS; remover `Inter` da fontFamily |
| NEW      | `src/shared/design-tokens.ts`      | Constantes TypeScript exportadas para uso em estilos dinâmicos |
| NEW      | `src/shared/components/Button.tsx` | Componente botão com variantes primary/secondary/ghost/danger |
| NEW      | `src/shared/components/Input.tsx`  | Campo com label, helper, erro, estados |
| NEW      | `src/shared/components/Card.tsx`   | Card sem sombra+borda simultâneos |
| NEW      | `src/shared/components/Dialog.tsx`  | Modal com overlay, escape, animação |
| NEW      | `src/shared/components/Toast.tsx`  | Notificação posicional com auto-dismiss |
| NEW      | `src/shared/components/StatusBadge.tsx` | Loading, vazio, erro, offline |
| NEW      | `src/shared/components/Skeleton.tsx` | Placeholder de carregamento |

### Critérios de aceite

- `npx tsc --noEmit` (ambos tsconfigs) sem erros.
- Tokens CSS custom properties refletidas no Tailwind.
- Cada componente aceita className para extensão.
- Componentes testados em Vitest (renderização, variantes, acessibilidade básica com testing-library).
- Zero regressão em build (`npm run build`).

---

## Fase 1 — Administração

**Escopo:** 14 arquivos TSX em `src/admin/`.

### Prioridades por arquivo

| Prioridade | Arquivo              | Foco principal                                          |
|------------|----------------------|---------------------------------------------------------|
| Alta       | AdminLayout.tsx      | Sidebar, header, navegação — define a casca             |
| Alta       | Dashboard.tsx        | Hierarquia, cards de métricas, estados vazio/erro       |
| Alta       | Configuracoes.tsx    | 118KB — formulários, tabs, organização                  |
| Alta       | ToledoConfig.tsx     | 91KB — tabela de preços, estados, feedback              |
| Média      | Catalogo.tsx         | Tabela, filtros, paginação                              |
| Média      | Queue.tsx            | Fila, estados dinâmicos                                 |
| Média      | Operators.tsx        | Lista/CRUD de operadores                                |
| Média      | Devices.tsx          | Lista/CRUD de dispositivos                              |
| Média      | Seguranca.tsx        | Formulários de segurança                                |
| Média      | Relatorios.tsx       | Gráficos, tabelas exportáveis                           |
| Média      | AdminEncarte.tsx     | Editor de encarte, preview                              |
| Média      | MediaIndoorAdmin.tsx | Upload, organização de mídia                            |
| Média      | GerenciarMidias.tsx  | Complemento de mídia                                    |
| Baixa      | OnboardingWizard.tsx | Fluxo de primeira configuração                          |

### Alterações transversais nesta fase

- Substituir todos os hex inline por tokens CSS ou classes Tailwind semânticas.
- Substituir `tracking-widest` + `uppercase` generalizado por tipografia do design system.
- Substituir arredondamentos arbitrários (20–40px) pelo token correto.
- Substituir sombras difusas por tokens de elevação.
- Adicionar estados de foco, keyboard nav e aria-labels.
- Adicionar Skeleton/Loading em todas as consultas assíncronas.
- Adicionar estados vazios com mensagem e ação.
- Tornar sidebar colapsável em telas estreitas.
- Corrigir lint nos arquivos tocados sem aumentar a dívida.

### Critérios de aceite

- Visual coerente com design system; nenhum token hardcoded restante nos arquivos alterados.
- Responsividade funcional em 360px, 768px, 1024px, 1440px.
- Navegação completa por teclado em todas as telas admin.
- TypeScript e lint sem regressões.

---

## Fase 2 — Operador (desktop, touch e mobile)

**Escopo:** 4 arquivos TSX em `src/operador/`.

| Arquivo             | Superfície        | Foco                                            |
|---------------------|-------------------|-------------------------------------------------|
| Controle.tsx        | Desktop           | Hierarquia de fila, ação rápida, feedback       |
| ControleTouch.tsx   | Tablet/Touch      | Alvos 48px, orientação, layout adaptativo       |
| MobileOperador.tsx  | Mobile            | Bottom nav, gestos, estados offline             |
| Bridge.tsx          | Ponte entre telas | Navegação, transições                           |

### Foco específico

- Ação primária (chamar senha) deve ser a maior affordance da tela.
- Segundo-chamada com diferenciação clara (cor semântica + ícone, não apenas cor).
- Feedback de concluir, devolver e pular inequívoco.
- Indicador de conexão/offline persistente.
- Estado de "sem senhas" com mensagem clara.

---

## Fase 3 — Totem e Portal do cliente

**Escopo:** `src/totem/` (2 arquivos) e `src/cliente/` (2 arquivos).

### Totem

| Arquivo         | Foco                                                    |
|-----------------|---------------------------------------------------------|
| Emissao.tsx     | Seleção de fila, botão grande, confirmação, impressão   |
| Confirmacao.tsx | Feedback de sucesso, número de senha, instruções        |

- Alvos de toque: 48px+.
- Texto principal: ≥24px.
- Sem scroll; tudo visível.
- Modo kiosk seguro.

### Portal do cliente

| Arquivo            | Foco                                                  |
|--------------------|-------------------------------------------------------|
| ClientePortal.tsx  | Mobile-first, estado da fila, estimativa de espera    |
| portalApi.ts       | (sem alteração visual)                                |

- Single-column mobile.
- Progressive disclosure.
- Estado de carregamento e reconexão.

---

## Fase 4 — Telão, encartes e mídia

**Escopo:** `src/telao/` (6 arquivos).

| Arquivo             | Foco                                                 |
|---------------------|------------------------------------------------------|
| SenhaChamada.tsx    | Número grande (Syne, tabular), guichê, animação      |
| TelaoEspera.tsx     | Lista de espera, relógio, status                     |
| EncartePrecos.tsx   | Tabela de preços, rotação, legibilidade à distância  |
| EncarteGranel.tsx   | Granel, ticker, cards de produto                     |
| MediaIndoor.tsx     | Reprodução de mídia, transições, scheduling          |
| SmartMediaLayer.tsx | Overlay de chamada sobre mídia                       |

### Restrições

- Performance: sem blur/glassmorphism no telão; sombras mínimas.
- Legibilidade: texto mínimo 32px para conteúdo de chamada; ≥24px para preços.
- Resolução: testar 1280×720, 1920×1080, 3840×2160 e retrato.
- Animação: apenas `transform` + `opacity`; sem layout thrashing.
- Broadcast-vignette e scanlines: substituir por indicadores de estado semânticos.

---

## Fase 5 — Telas compartilhadas e login

**Escopo:** `src/App.tsx`, `src/Login.tsx`.

- Login: formulário com design system, estados de erro/loading, responsividade.
- App: roteamento, layout shell, transições entre superfícies.

---

## Fase 6 — Auditoria, hardening e polish

### Checklist por item

- [ ] Contraste WCAG 2.2 AA em todas as superfícies (script automatizado).
- [ ] Navegação por teclado completa em todas as telas.
- [ ] `aria-live` em atualizações dinâmicas (fila, chamadas, status).
- [ ] `aria-label` em todos os botões com ícone.
- [ ] `prefers-reduced-motion` respeitado (verificar com media query forçada).
- [ ] Sem overflow horizontal em nenhuma resolução-alvo.
- [ ] Estados de loading, erro, vazio e offline em toda consulta assíncrona.
- [ ] Sem card aninhado; sem borda + sombra simultâneas; sem raio >16px em cards.
- [ ] Sem `tracking-widest` + `uppercase` generalizado.
- [ ] Sem hex inline em JSX — somente tokens.
- [ ] Fonte consistente (DM Sans + Syne); sem Inter, sem Outfit na aplicação.
- [ ] Ícones consistentes (Lucide); Material Symbols apenas em telão legado.
- [ ] Build Electron + Web + TypeScript + Lint sem regressões.
- [ ] Dívida de lint não aumentou; problemas nos arquivos tocados foram corrigidos.

### Ferramentas

- `$impeccable audit` em cada superfície após alteração.
- `$impeccable polish` como etapa final antes de commit.
- UI UX Pro Max para validar direção visual, paleta e tipografia.
- Script `scratch/contrast-check.ps1` para validação de contraste.
- Vitest para testes de componentes.

---

## Ordem de execução recomendada

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6
```

Cada fase é independente após Fase 0. A ordem acima prioriza por impacto no uso diário (admin → operador → cliente → telão), mas fases 2–5 podem ser paralelizadas se houver múltiplos implementadores.

---

## O que NÃO muda nesta modernização

- APIs, rotas e endpoints do servidor.
- Lógica de fila, chamada, impressão e SSE.
- Estrutura do banco de dados.
- Autenticação e permissões.
- Comportamento offline e sincronização.
- Fluxo de importação de preços (Toledo).
- Capacitor / Electron / APKs — rebuild após visual, sem mudança de API nativa.

---

## Entrega por fase

Cada fase entregará:

1. Código alterado com commit atômico.
2. TypeScript check (`npx tsc --noEmit`) sem erros.
3. Build (`npm run build`) sem erros.
4. Lint: nenhuma regressão; correções nos arquivos tocados.
5. Testes de componentes (Vitest) passando.
6. Resultado do `$impeccable audit` registrado.
7. Screenshots das resoluções-alvo.
8. Lista de problemas encontrados e decisões tomadas.
