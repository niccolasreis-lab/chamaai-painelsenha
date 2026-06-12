# Histórico de Progresso do Projeto

## 2026-06-09
### O que foi feito
- Criação da estrutura de memória persistente na pasta `.ai/` contendo documentações de arquitetura, decisões técnicas, backlog de tarefas, status de handoff e detalhes do projeto.
- Correção de bug de inicialização do Supabase: resolvido crash no Electron por credenciais Supabase ausentes no ambiente (.env). Adicionado verificador `isSupabaseConfigured` e placeholders.
- Adicionado indicador visual de segunda chamada: implementada lógica SSE com flag `repeticao` para mostrar badge laranja urgente `"⚠ 2ª CHAMADA"` e pulso laranja na TV.
- Implementação de segurança de senhas de operador: adicionado hashing Scrypt com fallback para texto plano para evitar bloqueios de operadores legados.
- Implementado edição inline de produtos Toledo na página `ToledoConfig.tsx`.
- Refatoração do player de áudio na TV/Portal usando a Web Audio API (resolvendo problemas de clipping de áudio fixando ganho em 0.75).
- Otimização das animações do Telão com `requestAnimationFrame`, propriedades `will-change` e remoção do `drop-shadow` pesado na renderização do número.

### Arquivos alterados
- [.ai/PROJECT.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/PROJECT.md) [NEW]
- [.ai/ARCHITECTURE.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/ARCHITECTURE.md) [NEW]
- [.ai/TASKS.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/TASKS.md) [NEW]
- [.ai/PROGRESS.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/PROGRESS.md) [NEW]
- [.ai/DECISIONS.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/DECISIONS.md) [NEW]
- [.ai/SESSION_HANDOFF.md](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/.ai/SESSION_HANDOFF.md) [NEW]
- [server/supabase-sync.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/supabase-sync.ts)
- [server/index.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/server/index.ts)
- [src/App.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/App.tsx)
- [src/Login.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/Login.tsx)
- [src/shared/sounds.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/shared/sounds.ts)
- [src/telao/MediaIndoor.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/telao/MediaIndoor.tsx)
- [src/telao/SenhaChamada.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/telao/SenhaChamada.tsx)
- [src/index.css](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/index.css)
- [src/admin/ToledoConfig.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/ToledoConfig.tsx)
- [src/admin/AdminEncarte.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/AdminEncarte.tsx)
- [src/admin/Configuracoes.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/Configuracoes.tsx)
- [src/admin/AdminLayout.tsx](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/src/admin/AdminLayout.tsx)
- [electron/services/database.ts](file:///z:/01%20-%20ADMINISTRATIVO/N%C3%ADcolas/saas/chamaAI_novo/electron/services/database.ts)

### Motivo das alterações
- Correções de bugs de infraestrutura offline/redes, refatoração de performance das animações e de som, e melhoria dos módulos de segurança do sistema e interface do usuário para totens/TVs.

### Próximos passos
- Concluir homologação do PWA local e validar portal do cliente Vercel.
