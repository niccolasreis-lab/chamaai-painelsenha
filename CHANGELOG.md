# Changelog

## [1.0.131] - 2026-06-15
### Adicionado
- Implementado sistema Boot Guard e Safe Mode desacoplado do ciclo de inicialização do UI.
- Criado watchdog progressivo anti tela branca que garante o recarregamento do processo ou isolamento gráfico.
- Tabelas de controle avançado do banco de dados: `system_version`, `update_history` e `recovery_history`.
- Rotina de log externo de recuperação segura: `recovery.log` sem depender do SQLite.
- Backup preventivo atômico do SQLite implementado especificamente antes do hook de atualização do app.
- Rollback resiliente atuando exclusivamente na camada de banco de dados, protegendo o estado dos arquivos contra corrupções entre versões.
- Fluxo de atualizações do GitHub Releases / electron-builder foi totalmente preservado.
