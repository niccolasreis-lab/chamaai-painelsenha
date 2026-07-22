---
name: safe-submodule-publish
description: Publica com segurança um repositório Git aninhado como submódulo, removendo credenciais de remotes, validando o repositório filho e atualizando o gitlink do repositório pai somente depois do push confirmado. Use para publicar ou corrigir submódulos como ChamaCliente.
---

# Publicação segura de submódulo

## Objetivo

Este procedimento mantém a publicação do repositório filho e a atualização do repositório pai auditáveis e separadas. Ele impede que uma credencial embutida em URL seja republicada e evita apontar o pai para um commit que ainda não existe no remoto.

## Fluxo obrigatório

1. **Identifique os limites.** Determine o repositório pai, o diretório do submódulo e os remotes envolvidos. Inspecione `git status`, `.gitmodules`, `git ls-files --stage <submodulo>` e `git -C <submodulo> remote -v`.

2. **Proteja a credencial antes de publicar.** Se a URL de remote contiver usuário, token, senha ou outro segredo, substitua localmente por URL HTTPS sem credencial. Não mostre nem registre o segredo em saída, commit ou documento. Informe que a revogação/rotação deve ocorrer no provedor Git.

3. **Bloqueio de promoção.** Não faça `push` do filho e não altere o gitlink do pai até haver confirmação explícita do usuário de que a credencial exposta foi revogada/rotacionada, ou confirmação verificável por uma integração autorizada de gerenciamento de segredos. A simples remoção da URL local não prova a rotação.

4. **Valide o filho.** Confirme que o worktree está no estado esperado, execute os testes e a compilação aplicáveis, registre o commit exato e só então envie esse commit. Após o push, verifique que o remoto o contém.

5. **Atualize o pai por último.** Confirme que `.gitmodules` usa URL sem credencial. Em commit exclusivo, faça stage apenas de `.gitmodules` quando necessário e do gitlink do submódulo, com mensagem que cite o commit promovido.

6. **Feche com evidência.** Execute `git diff --check`, mostre `git status` do pai e do filho e reporte separadamente: remoto higienizado, rotação confirmada ou pendente, push realizado ou bloqueado, e gitlink atualizado ou preservado.

## Regras de segurança

- Nunca copie URL com credencial para commits, logs, comentários ou respostas.
- Não presuma que uma credencial foi rotacionada: trate-a como pendente até confirmação verificável.
- Não faça push, force-push, alteração de branch ou atualização de gitlink fora da autorização do usuário.
- Se o push falhar ou o commit não estiver no remoto, mantenha o gitlink do pai inalterado.
- Preserve alterações não relacionadas; faça stage seletivo e confirme o diff indexado antes de cada commit.

## Critério de conclusão

O fluxo está concluído somente quando o commit do filho estiver confirmado no remoto, o gitlink do pai apontar para esse commit, a configuração do submódulo não contiver credenciais e ambos os worktrees estiverem verificados. Se a rotação estiver pendente, a conclusão correta é registrar o bloqueio, sem promover o ponteiro do pai.
