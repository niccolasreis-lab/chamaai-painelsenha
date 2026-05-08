# Bugfix Requirements Document

## Introduction

Durante o processo de atualização da aplicação Electron ChamaAí, o instalador NSIS falha ao encerrar automaticamente os processos em execução, exigindo intervenção manual do usuário. O script customizado `build/installer.nsh` utiliza comandos PowerShell e taskkill para encerrar processos, mas esses comandos não estão sendo efetivos durante a execução do instalador. Como resultado, o usuário vê uma mensagem de erro "Não é possível fechar o ChamaAí. Feche a janela do ChamaAí e clique em Repetir para continuar", interrompendo o fluxo de atualização automática.

Este bug afeta a experiência do usuário durante atualizações, tornando o processo manual quando deveria ser automático. O arquivo `LIMPAR_SISTEMA.bat` demonstra que é possível encerrar os processos com sucesso usando comandos similares, indicando que o problema está na implementação ou contexto de execução do script NSIS.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN o usuário executa o instalador de atualização (ChamaAí Setup 1.0.31.exe) com a aplicação ChamaAí em execução THEN o instalador exibe a mensagem de erro "Não é possível fechar o ChamaAí. Feche a janela do ChamaAí e clique em Repetir para continuar"

1.2 WHEN o script `build/installer.nsh` executa os comandos PowerShell e taskkill na macro `!macro customInit` THEN os processos do ChamaAí (ChamaAí.exe, chamaai-novo.exe, ChamaA*.exe) não são encerrados

1.3 WHEN o instalador tenta prosseguir com a atualização após os comandos de encerramento THEN o Windows mantém locks nos arquivos da aplicação, impedindo a substituição dos binários

1.4 WHEN o usuário clica em "Repetir" sem fechar manualmente a aplicação THEN o erro persiste e o instalador não consegue prosseguir

### Expected Behavior (Correct)

2.1 WHEN o usuário executa o instalador de atualização com a aplicação ChamaAí em execução THEN o instalador SHALL encerrar automaticamente todos os processos relacionados ao ChamaAí sem exibir mensagens de erro

2.2 WHEN o script `build/installer.nsh` executa os comandos de encerramento de processos THEN todos os processos do ChamaAí (incluindo variações de nome como ChamaAí.exe, chamaai-novo.exe, ChamaA*.exe) SHALL ser terminados com sucesso

2.3 WHEN os processos são encerrados pelo instalador THEN o Windows SHALL liberar os locks nos arquivos da aplicação, permitindo a substituição dos binários

2.4 WHEN todos os processos são encerrados com sucesso THEN o instalador SHALL prosseguir automaticamente com a atualização sem requerer intervenção manual do usuário

### Unchanged Behavior (Regression Prevention)

3.1 WHEN o usuário executa o instalador de atualização e a aplicação ChamaAí NÃO está em execução THEN o instalador SHALL CONTINUE TO prosseguir normalmente sem exibir mensagens de erro

3.2 WHEN o instalador completa a atualização com sucesso THEN a aplicação ChamaAí SHALL CONTINUE TO iniciar corretamente com todas as funcionalidades preservadas

3.3 WHEN o usuário desinstala a aplicação usando o uninstaller THEN o processo de desinstalação SHALL CONTINUE TO funcionar corretamente, encerrando processos conforme necessário

3.4 WHEN o instalador é executado em uma instalação limpa (primeira instalação) THEN o processo de instalação SHALL CONTINUE TO funcionar normalmente sem tentativas desnecessárias de encerrar processos

3.5 WHEN o instalador cria atalhos na área de trabalho e menu iniciar THEN esses atalhos SHALL CONTINUE TO ser criados corretamente e funcionar após a instalação

## Bug Condition Analysis

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type InstallerContext
  OUTPUT: boolean
  
  // Returns true when the bug condition is met
  // X.isUpdateInstallation: indica se é uma atualização (não primeira instalação)
  // X.chamaaiProcessesRunning: indica se há processos do ChamaAí em execução
  RETURN X.isUpdateInstallation = true AND X.chamaaiProcessesRunning = true
END FUNCTION
```

### Property Specification - Fix Checking

```pascal
// Property: Fix Checking - Automatic Process Termination During Update
FOR ALL X WHERE isBugCondition(X) DO
  result ← runInstaller'(X)
  ASSERT result.processesTerminated = true AND 
         result.errorMessageShown = false AND
         result.manualInterventionRequired = false AND
         result.installationCompleted = true
END FOR
```

**Definições:**
- **runInstaller**: Função original (instalador com o bug) - falha ao encerrar processos automaticamente
- **runInstaller'**: Função corrigida (instalador após o fix) - encerra processos automaticamente com sucesso

### Property Specification - Preservation Checking

```pascal
// Property: Preservation Checking - Non-buggy Installation Scenarios
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT runInstaller(X) = runInstaller'(X)
END FOR
```

Isso garante que para todos os cenários que não envolvem atualização com processos em execução (instalação limpa, atualização sem processos rodando, desinstalação), o comportamento do instalador permanece idêntico.

### Counterexamples

**Exemplo Concreto do Bug:**
```
Input: 
  - Versão instalada: ChamaAí 1.0.30
  - Processo em execução: ChamaAí.exe (PID 1234)
  - Ação: Executar ChamaAí Setup 1.0.31.exe

Comportamento Atual (Buggy):
  1. Instalador executa: powershell -Command "Get-Process | Where-Object { ... } | Stop-Process -Force"
  2. Comando retorna mas processo continua em execução
  3. Instalador tenta substituir arquivos
  4. Windows retorna erro de arquivo em uso
  5. Instalador exibe: "Não é possível fechar o ChamaAí..."
  6. Usuário precisa fechar manualmente e clicar em "Repetir"

Comportamento Esperado (Fixed):
  1. Instalador executa comandos de encerramento aprimorados
  2. Todos os processos do ChamaAí são terminados com sucesso
  3. Instalador aguarda liberação dos locks de arquivo
  4. Instalador substitui arquivos sem erros
  5. Instalação completa automaticamente
  6. Nenhuma intervenção manual necessária
```
