# Registro de Decisões Técnicas (ADR)

## 2026-06-09
### Decisão: Utilizar SQLite em modo WAL (Write-Ahead Logging)
- **Motivo**: Melhor concorrência de leitura e escrita simultânea. Como o aplicativo roda um servidor Express, o processo principal do Electron e scripts de worker ao mesmo tempo, o modo WAL previne erros de trava (`database is locked`).
- **Alternativas consideradas**: PostgreSQL local (overhead excessivo de instalação para totens de baixo custo); JSON local (inviável para concorrência de escrita e volume de dados do Toledo).

---

## 2026-06-09
### Decisão: Integração Offline-First usando Outbox Pattern com Supabase
- **Motivo**: Garantir resiliência na nuvem sem prejudicar o funcionamento local. Emissões de senhas e alterações são inseridas no banco SQLite local (`supabase_sync_queue`) e enviadas à nuvem assincronamente em lotes por um worker a cada 5s.
- **Alternativas consideradas**: Conexão síncrona direta ao Supabase (travava a emissão de senhas no totem em caso de instabilidade de internet/4G).

---

## 2026-06-09
### Decisão: Uso da Web Audio API para reprodução de chamadas sonoras
- **Motivo**: O reprodutor tradicional `new Audio().play()` causava estouro de volume e chiados em conversores digitais-analógicos (DAC) de TVs baratas e dongles como a Xiaomi Mi Box S. A Web Audio API permite controle preciso de ganho atenuado em 0.75 e cache de buffer.
- **Alternativas consideradas**: Elementos `<audio>` do HTML5 (careciam de controle dinâmico avançado de ganho e causavam clipping de volume).

---

## 2026-06-09
### Decisão: Hashing Scrypt com Fallback para senhas de operadores
- **Motivo**: Proteger credenciais de operadores no SQLite contra extração de dados indesejada, mantendo a compatibilidade e permitindo acesso a credenciais legadas armazenadas em texto puro caso não iniciem com `scrypt$`.
- **Alternativas consideradas**: Hashing com Bcrypt (node-bcrypt nativo tem compilações difíceis no Electron para diferentes arquiteturas).
