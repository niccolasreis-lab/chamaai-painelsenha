# Configuração das skills de UI/UX

## Ambiente detectado

- Agente ativo: **Google Antigravity** (IDE de agente avançado da Google DeepMind).
- Skills instaladas foram originalmente configuradas via Codex CLI, mas funcionam corretamente no Antigravity por compatibilidade de estrutura de diretórios (`.agents/skills/` e `.codex/skills/`).
- Evidência de detecção: metadata de workspace indica Antigravity IDE; skills em `.agents/skills/` são descobertas automaticamente.
- A pasta `.kiro` contém especificações antigas e não representa o agente desta sessão.

## Instalação realizada

Foram usados somente os instaladores oficiais, sem `--global` e sem `--force`:

```powershell
npx --yes ui-ux-pro-max-cli@2.11.0 init --ai codex
npx --yes impeccable@3.2.1 install --providers=codex --scope=project -y
```

O CLI do Impeccable instalado é 3.2.1; o bundle de skill entregue por ele declara `version: 3.9.1` no `SKILL.md`. São versões de componentes diferentes, não uma divergência de instalação.

## Localização

- UI UX Pro Max: `.codex/skills/ui-ux-pro-max/`.
- Auxiliares oficiais: `.codex/skills/banner-design/`, `brand/`, `design/`, `design-system/`, `slides/` e `ui-styling/`.
- Impeccable: `.agents/skills/impeccable/`.
- Hook do Impeccable: `.codex/hooks.json`.
- Configuração do modo live: `.impeccable/live/config.json`.
- Skills existentes preservadas: `.agents/skills/supabase/` e `.agents/skills/supabase-postgres-best-practices/`.

Foram instalados 145 arquivos do pacote UI UX Pro Max e 105 arquivos do Impeccable.

## Ativação

Recarregue o Codex e confira `/skills`. O hook precisa ser aprovado uma vez em `/hooks`.

Exemplos:

```text
$ui-ux-pro-max Proponha um design system para o ChamaAI, um sistema offline-first de filas de supermercado em React e Tailwind.
$impeccable critique src/admin
$impeccable audit src/totem
$impeccable polish src/operador
```

Pesquisa direta do UI UX Pro Max no Windows:

```powershell
py -3 .codex/skills/ui-ux-pro-max/scripts/search.py "queue management supermarket accessible" --design-system -p "ChamaAI" -f markdown
```

O launcher `py -3` encontra Python 3.14.4. Os aliases `python` e `python3` apontam para o atalho da Microsoft Store e não funcionam nesta máquina.

## Sobreposição e roteamento

- UI UX Pro Max é a fonte primária para pesquisa de estilos, cores, fontes, UX e orientação React.
- Impeccable é a fonte primária para shape, crítica, auditoria, responsividade, hardening e polish.
- Os auxiliares `design`, `design-system` e `ui-styling` sobrepõem parcialmente as duas skills principais. Permanecem porque fazem parte do instalador oficial, mas devem ser chamados explicitamente apenas quando sua especialidade for necessária.
- O Frontend Design da Anthropic não foi instalado: o próprio Impeccable declara ter evoluído dele e cobre seus princípios com ferramentas adicionais. Permanece como [referência oficial](https://github.com/anthropics/skills/tree/main/skills/frontend-design).

## Limitações conhecidas

- Skills novas podem não aparecer na sessão atual antes de recarregar o Codex.
- O script `context.mjs` encontrou corretamente `DESIGN.md` e a ausência de `PRODUCT.md`, mas o Node 24 encerrou depois da saída com uma asserção interna de `libuv` no Windows. O contexto foi emitido integralmente e nenhum arquivo foi alterado pelo erro.
- O hook instalado usa o evento `PostToolUse`; ele só ficará ativo após a aprovação pelo Codex.

## Fontes oficiais

- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [Impeccable](https://github.com/pbakaus/impeccable)
- [Frontend Design da Anthropic](https://github.com/anthropics/skills/tree/main/skills/frontend-design)