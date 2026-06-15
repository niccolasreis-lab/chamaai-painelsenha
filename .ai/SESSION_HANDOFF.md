# Contexto Atual
O ChamaAí é um sistema de chamadas de senhas e mídias promocionais/encartes desenvolvido em React 19, Express 5, Electron 30 e banco SQLite local sincronizado com Supabase Cloud. Destaca-se por ser robusto e otimizado para hardwares antigos (modos totem blindados, flags de desempenho do Chrome, Web Audio API, animações por GPU).

# O que está sendo feito agora
- Implementação do sistema de diagnóstico avançado para a fila de sincronização Supabase.

# Próximo passo
- Testar o endpoint debug-sync em ambiente de produção
- Implementar dashboard visual no painel admin para monitoramento da fila
- Continuar o desenvolvimento do portal de acompanhamento e validar o PWA móvel local

# Arquivos importantes
- [electron/main.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/electron/main.ts): Gerenciamento de janelas e ciclo de vida do Electron.
- [server/index.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/index.ts): API Rest local e Server-Sent Events.
- [server/supabase-sync.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/supabase-sync.ts): Lógica de outbox sync e comandos em tempo real.
- [server/toledo-watcher.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/toledo-watcher.ts): Monitoramento de arquivos de preços de balanças.
- [src/App.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/App.tsx): Roteamento das telas do front-end.
- [src/telao/MediaIndoor.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/telao/MediaIndoor.tsx): Tela principal de TV de chamadas e mídias.

# Observações
- A pasta `.ai` atua como a memória persistente comum para quaisquer agentes. Toda e qualquer nova alteração ou decisão técnica deve ser registrada nestes arquivos de forma contínua.
- O SQLite local fica em `C:\ChamaAi\database.sqlite`. O modo WAL do banco exige que a aplicação feche corretamente conexões antes do encerramento para evitar corrupção de dados.
