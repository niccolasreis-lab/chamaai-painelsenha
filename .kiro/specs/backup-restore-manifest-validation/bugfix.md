# Bugfix Requirements Document

## Introduction

O sistema ChamaAI v1.0.55 apresenta falha crítica no processo de restauração de backups. O sistema reporta que o arquivo `manifest.json` está ausente durante a restauração, mesmo quando o backup contém este arquivo de forma válida (verificado por extração manual). Este bug impede completamente a funcionalidade de backup/restore, tornando impossível recuperar dados de backups válidos criados pelo próprio sistema.

O impacto é crítico pois:
- Usuários não conseguem restaurar backups existentes
- A funcionalidade de disaster recovery está comprometida
- Backups válidos são rejeitados incorretamente como "corrompidos"

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN o sistema tenta restaurar um backup ZIP válido contendo manifest.json THEN o sistema lança erro "Arquivo manifest.json ausente. Backup corrompido, inválido ou criado em versão antiga."

1.2 WHEN o backup é extraído manualmente pelo usuário THEN o manifest.json está presente e válido no conteúdo extraído

1.3 WHEN o sistema executa a extração via PowerShell `Expand-Archive` THEN a validação subsequente de `fs.existsSync(manifestPath)` retorna false mesmo com o arquivo presente

1.4 WHEN o sistema valida a presença do manifest.json imediatamente após a extração THEN a verificação falha inconsistentemente

### Expected Behavior (Correct)

2.1 WHEN o sistema tenta restaurar um backup ZIP válido contendo manifest.json THEN o sistema SHALL extrair o arquivo corretamente e detectar sua presença

2.2 WHEN o sistema executa `Expand-Archive` via PowerShell THEN o sistema SHALL aguardar a conclusão completa da extração antes de validar a presença de arquivos

2.3 WHEN o sistema valida a presença do manifest.json THEN o sistema SHALL verificar corretamente se o arquivo existe no diretório extraído

2.4 WHEN o backup contém manifest.json válido THEN o sistema SHALL prosseguir com a validação de integridade SHA-256 e restauração dos dados

2.5 WHEN o backup realmente não contém manifest.json (backup legado pré-v1.0.40) THEN o sistema SHALL reportar erro claro indicando incompatibilidade de versão

### Unchanged Behavior (Regression Prevention)

3.1 WHEN o backup contém arquivos corrompidos (hash SHA-256 inválido) THEN o sistema SHALL CONTINUE TO rejeitar o backup com erro de integridade

3.2 WHEN o backup não contém database.json THEN o sistema SHALL CONTINUE TO rejeitar o backup com erro apropriado

3.3 WHEN a restauração do banco SQLite falha THEN o sistema SHALL CONTINUE TO reverter a transação sem corromper dados existentes

3.4 WHEN o backup é criado via `createBackupZip()` THEN o sistema SHALL CONTINUE TO gerar manifest.json com hashes SHA-256 corretos de todos os arquivos

3.5 WHEN arquivos de mídia (uploads) estão presentes no backup THEN o sistema SHALL CONTINUE TO restaurá-los corretamente após sucesso da restauração do banco

3.6 WHEN o arquivo ZIP precisa ser renomeado temporariamente (sem extensão .zip) THEN o sistema SHALL CONTINUE TO restaurar o nome original após o processamento

3.7 WHEN a pasta temporária de extração precisa ser limpa THEN o sistema SHALL CONTINUE TO remover os arquivos temporários independentemente de sucesso ou falha
