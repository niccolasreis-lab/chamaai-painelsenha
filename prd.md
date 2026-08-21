# ChamaAí — Product Requirements Document

| Campo | Valor |
|---|---|
| Produto | ChamaAí — Gestão de filas e comunicação em loja |
| Baseline | `1.0.168` |
| Atualização | 21 de agosto de 2026 |
| Estado | Release candidate / homologação |
| Plataformas | Windows/Electron, navegador/PWA e Android TV |
| Servidor local | Express `:3001` + SQLite em `C:\ChamaAi` |

## 1. Objetivo

O ChamaAí organiza atendimento presencial por senhas e reúne emissão, operação de guichês, chamada visual/sonora, mídia indoor, encarte de preços e acompanhamento remoto. A operação presencial deve continuar funcional na LAN quando a internet estiver indisponível; Supabase e Edge Functions complementam licenciamento, portal e sincronização cloud.

Este documento diferencia:

- **Implementado:** presente no código e submetido a build ou teste aplicável.
- **Parcial:** presente, com limitação conhecida.
- **Pendente:** requisito aceito sem validação suficiente.
- **Meta:** resultado a medir em produção, não fato comprovado.

## 2. Usuários

| Ator | Necessidade | Superfície |
|---|---|---|
| Cliente | Emitir senha e entender quando será atendido | Totem, ticket e telão |
| Operador | Chamar, repetir, devolver e concluir rapidamente | Operador desktop/touch/mobile |
| Administrador | Configurar loja, filas, devices, mídia, preços e segurança | Admin |
| Gestor | Consultar métricas e relatórios | Admin |
| Cliente remoto | Acompanhar senha pelo celular | Portal do Cliente |
| Suporte | Instalar, vincular, diagnosticar e recuperar terminais | Servidor, Admin e APK |

## 3. Topologia

```text
Totem ──────────────┐
Operadores ─────────┤
Telão Web/PWA ──────┼── LAN HTTP + SSE :3001 ── Servidor Master
Telão Android TV ───┤                         Electron + Express + SQLite
Admin remoto ───────┘                                  │
                                                       │ outbox/check-in
                                                       ▼
                                               Supabase / Portal
```

### 3.1 Distribuições

| Distribuição | Escopo |
|---|---|
| Electron | Aplicação completa e servidor principal |
| Navegador/PWA | Módulos por rota e permissão |
| Android `operador` | Operação touch/mobile |
| Android `telao` | APK dedicado; somente Telão |

## 4. Objetivos obrigatórios

1. Emissão, fila, chamada e conclusão devem funcionar localmente.
2. Totem, Telão, Operador e Admin devem respeitar seus escopos e permissões.
3. Chamadas devem chegar aos telões por SSE em tempo próximo do real.
4. O áudio do Telão deve obedecer exclusivamente ao modo definido pelo servidor.
5. Cache persistente de mídia deve possuir quota, integridade e ciclo de vida explícitos.
6. O APK Telão não deve permitir acesso aos demais módulos.
7. Onboarding administrativo deve usar o servidor como fonte de verdade.
8. Falha cloud não deve bloquear a operação presencial básica.

## 5. Requisitos funcionais

### 5.1 Fila e Totem

| ID | Requisito | Estado |
|---|---|---|
| FILA-01 | Emitir senha vinculada a balcão/tipo de atendimento. | Implementado |
| FILA-02 | Suportar filas normal e preferencial configuráveis. | Implementado |
| FILA-03 | Persistir número, prefixo, preferência, nome opcional, status e timestamps. | Implementado |
| FILA-04 | Chamar próxima, repetir, devolver, concluir, cancelar e registrar não comparecimento quando habilitado. | Implementado |
| FILA-05 | Propagar alterações relevantes por SSE. | Implementado |
| FILA-06 | Executar reset diário quando habilitado. | Implementado |
| TOT-01 | Emitir senha em interface touch e mostrar confirmação. | Implementado |
| TOT-02 | Solicitar nome somente quando configurado. | Implementado |
| TOT-03 | Imprimir ticket quando uma impressora válida estiver configurada. | Parcial: depende de homologação por hardware |
| TOT-04 | Ativar screensaver e reduzir saída acidental em kiosk. | Implementado |

### 5.2 Operador

| ID | Requisito | Estado |
|---|---|---|
| OPE-01 | Autenticar antes de liberar controles protegidos. | Implementado |
| OPE-02 | Associar sessão a operador e guichê/balcão. | Implementado |
| OPE-03 | Exibir fila normal/preferencial em tempo real. | Implementado |
| OPE-04 | Respeitar flags administrativas de ações disponíveis. | Implementado |
| OPE-05 | Disponibilizar interfaces desktop, touch e mobile. | Implementado |

### 5.3 Telão

| ID | Requisito | Estado |
|---|---|---|
| TEL-01 | Inicializar device por código e recuperar perfil vinculado. | Implementado |
| TEL-02 | Permitir seleção de painel, encarte e mídia por device. | Implementado |
| TEL-03 | Mostrar senha atual, nome opcional, guichê/local, repetição e histórico. | Implementado |
| TEL-04 | Dimensionar o destaque pela largura **e** altura disponíveis, sem recorte em 720p, 1080p ou 4K. | Implementado; campo físico pendente |
| TEL-05 | Manter número em linha única, dentro do viewport e com algarismos tabulares. | Implementado e testado |
| TEL-06 | Adaptar título, badge, nome, logo e guichê ao viewport. | Implementado |
| TEL-07 | Respeitar `prefers-reduced-motion` nas animações de chamada. | Implementado |
| TEL-08 | Interromper vinheta ao iniciar chamada e nunca misturá-la com TTS. | Implementado e testado |
| TEL-09 | Exibir logo, espera, ticker, clima, encarte e mídia conforme perfil. | Implementado |
| TEL-10 | Expor diagnóstico local do cache. | Implementado |
| TEL-11 | Permitir `classic`, `sidebar` e `l-shape` por device, persistidos no servidor e aplicados no navegador e APK. | Implementado e testado |
| TEL-12 | Conter cada layout em `100dvw` × `100dvh`, com painéis, header, histórico e rodapé dimensionados pela largura e altura disponíveis. | Implementado e testado |

### 5.4 TTS estrito

| ID | Requisito | Estado |
|---|---|---|
| TTS-01 | Aceitar apenas `desativado`, `mp3` ou `sintetizador`. | Implementado |
| TTS-02 | Migrar o legado `ambos` para `mp3`. | Implementado |
| TTS-03 | Executar a campainha configurada antes da voz, como fase independente, sem alterar a exclusividade entre MP3, sintetizador e modo desativado. | Implementado e testado |
| TTS-04 | Em `mp3`, tentar somente candidatos MP3 e não sintetizar como fallback. | Implementado e testado |
| TTS-05 | Em `sintetizador`, não solicitar MP3. | Implementado e testado |
| TTS-06 | Em `desativado`, não executar voz. | Implementado e testado |
| TTS-07 | Renovar `telao_tts_revision` em upload/limpeza e versionar URLs. | Implementado |
| TTS-08 | Limitar buffers decodificados em memória e invalidar revisão anterior. | Implementado |

### 5.5 Cache dos telões

| ID | Requisito | Estado |
|---|---|---|
| CAC-01 | Servir `/uploads` e `/tts` com `no-store`. | Implementado |
| CAC-02 | Expor manifesto por telão com revisão, quota, hash, tamanho e prioridade. | Implementado |
| CAC-03 | Aplicar 256 MiB por padrão, configurável entre 32 e 2048 MiB. | Implementado |
| CAC-04 | Não persistir asset que não caiba; usar streaming. | Implementado |
| CAC-05 | Validar tamanho e SHA-256 antes de promover download. | Implementado |
| CAC-06 | Android: usar `.part`, troca atômica e preservar 512 MiB livres após download. | Implementado |
| CAC-07 | Remover entradas inativas na reconciliação seguinte. | Implementado |
| CAC-08 | Limpar cache legado preservando IP, vínculo e preferências locais. | Implementado |
| CAC-09 | Sem Cache Storage/`crypto.subtle`, transmitir sem persistir e informar limitação. | Implementado; offline não garantido |
| CAC-10 | Confinar arquivos gerenciados a `C:\ChamaAi\uploads`. | Implementado e testado |
| CAC-11 | Permitir que telões vinculados na LAN consultem seu manifesto autenticado por código, sem exigir sessão administrativa. | Implementado e testado |

### 5.6 Mídia e encarte

| ID | Requisito | Estado |
|---|---|---|
| MID-01 | Gerenciar mídia clássica, ordem, ativação, expiração e arquivo. | Implementado |
| MID-02 | Gerenciar itens inteligentes, campanhas, temas, prioridade e agenda. | Implementado |
| MID-03 | Gerenciar pastas, arquivos e horários de vinhetas. | Implementado e testado parcialmente |
| MID-04 | Exibir vídeos sem deformação ou overflow, usando `object-contain`, limites do contêiner e fundo neutro. | Implementado e testado |
| MID-05 | Avançar ao terminar, falhar ou permanecer sem progresso; ao fim da playlist, retornar ao primeiro item reproduzível. | Implementado e testado |
| MID-06 | Aplicar loop nativo somente quando houver um único conteúdo reproduzível e nenhum encarte intercalado. | Implementado e testado |
| MID-07 | Não reiniciar vídeo em reprodução quando o polling receber uma playlist semanticamente idêntica. | Implementado e testado |
| MID-08 | Remover imediatamente da rotação e do cache local a revisão de vídeo que falhar ou travar, avançando ao próximo item válido. | Implementado e testado |
| MID-09 | Manter a quarentena durante a mesma revisão do manifesto e liberar nova tentativa somente quando o servidor publicar uma revisão diferente. | Implementado e testado |
| MID-10 | Ao excluir mídia no servidor, removê-la da playlist e do manifesto e reconciliar os caches browser e Android na sincronização seguinte. | Implementado e testado |
| MID-11 | Excluir o arquivo físico somente quando não houver referência ativa em mídia clássica, inteligente, configurações ou vinhetas. | Implementado e testado |
| ENC-01 | Importar produtos/preços de arquivos suportados pelo watcher Toledo. | Implementado |
| ENC-02 | Permitir categorias, filtros, nomes, ordem e temas. | Implementado |
| ENC-03 | Paginar encarte conforme capacidade visual. | Implementado e testado |
| ENC-04 | Verificar a fonte Toledo a cada 5 s, consolidar eventos por debounce e reprocessar uma alteração que ocorra durante uma importação. | Implementado e testado |
| ENC-05 | Atualizar servidor e catálogo quando preço, descrição, categoria ou unidade mudar; não publicar evento quando o conteúdo material permanecer igual. | Implementado e testado |
| ENC-06 | Propagar mudança por SSE e manter recuperação por polling de 60 s no telão, sem reiniciar slides quando o snapshot for idêntico. | Implementado e testado |

### 5.7 Admin e onboarding

| ID | Requisito | Estado |
|---|---|---|
| ADM-01 | Gerenciar configurações, usuários, balcões, devices, mídia, catálogo e relatórios. | Implementado |
| ADM-02 | Proteger rotas por autenticação/perfil. | Implementado |
| ADM-03 | Usar `onboarding_completed` do servidor como fonte de verdade. | Implementado |
| ADM-04 | Migrar banco existente uma única vez para não reabrir onboarding remotamente. | Implementado |
| ADM-05 | Manter instalação nova pendente até confirmação do POST. | Implementado |
| ADM-06 | Não concluir localmente quando a gravação no servidor falhar. | Implementado |
| ADM-07 | Validar e normalizar a URL pública do Portal do Cliente antes de persistir, preservando token e removendo identificadores de ticket antigos. | Implementado e testado |

### 5.8 APK Android TV dedicado

| ID | Requisito | Estado |
|---|---|---|
| ATV-01 | Pacote `com.chamaai.app.telao`, mínimo API 26, target API 35. | Implementado |
| ATV-02 | Renderizar somente Telão em qualquer rota. | Implementado |
| ATV-03 | Configurar IPv4/hostname e validar `/health` em `:3001`. | Implementado |
| ATV-04 | BACK curto não fecha; BACK por 3 s abre configuração. | Implementado |
| ATV-05 | Landscape, imersivo, autoplay, aceleração e D-pad. | Implementado; D-pad físico pendente |
| ATV-06 | Banner 320×180, Leanback e touchscreen opcionais. | Implementado |
| ATV-07 | Manter tela/CPU acordadas enquanto o watchdog estiver ativo. | Implementado |
| ATV-08 | Foreground service `START_STICKY` verifica estado a cada 30 s. | Implementado |
| ATV-09 | Iniciar no boot e agendar recuperação em `onTaskRemoved`. | Implementado |
| ATV-10 | Usar lock task somente quando autorizado pelo Device Owner. | Implementado |
| ATV-11 | Não aplicar watchdog/kiosk ao flavor Operador. | Implementado |

Nenhum APK comum garante 100% de disponibilidade contra corte físico, `force-stop`, CEC ou política OEM. No Android 10+, sem Device Owner, a notificação persistente é o caminho suportado de recuperação quando o sistema bloqueia abertura de Activity em background.

## 6. Contratos essenciais

### `GET /health`

Deve retornar HTTP 200 e `{ "status": "ok" }`. O APK valida esse endpoint antes de salvar o servidor.

### `GET /api/telao/assets/:code`

```json
{
  "revision": "string",
  "maxCacheBytes": 268435456,
  "ttsRevision": "string",
  "assets": [{
    "id": "midia:123",
    "kind": "image",
    "url": "/uploads/arquivo",
    "version": "hash-curto",
    "sizeBytes": 12345,
    "sha256": "sha256",
    "priority": 100
  }]
}
```

### Configurações críticas

| Chave | Contrato |
|---|---|
| `telao_tts_modo` | `desativado`, `mp3`, `sintetizador` |
| `telao_tts_revision` | identificador renovado ao mudar MP3 |
| `telao_cache_limite_mb` | inteiro 32–2048; padrão 256 |
| `onboarding_completed` | `0` ou `1`; autoridade no servidor |
| `onboarding_server_authority_v1` | marcador da migração única |

## 7. Dados e armazenamento

- banco: `C:\ChamaAi\database.sqlite`;
- uploads: `C:\ChamaAi\uploads`;
- TTS: `C:\ChamaAi\uploads\tts\tipo1|tipo2|tipo3`;
- backups: `C:\ChamaAi\Backups`;
- cache Android: `cacheDir/telao-assets`.

Entidades principais: `usuarios`, `operadores`, `sessoes_operador`, `balcoes`, `senhas`, `chamadas`, `teloes`, `midias`, `media_items`, `media_campaigns`, `media_themes`, `vignette_folders`, `vignette_files`, `vignette_schedules`, `toledo_produtos`, `categorias`, `produtos`, `configuracoes`, `supabase_sync_queue`, `audit_logs`, `system_version`, `update_history` e `recovery_history`.

## 8. Requisitos não funcionais

### Resiliência

- Falha cloud não deve impedir emissão, chamada, SSE local ou impressão local.
- Download interrompido ou inválido não pode substituir cache válido.
- Revisões inativas devem ser removidas após reconciliação.
- Mídia quebrada deve ser colocada em quarentena local por revisão, sem apagar automaticamente o arquivo mestre por uma falha isolada de rede ou codec.
- Exclusão administrativa deve propagar à playlist, manifesto e caches sem deixar arquivo físico ainda referenciado.
- Backup, restore, recovery e safe mode devem permanecer operacionais.

### Desempenho

- Hash de vídeo deve ser calculado por streaming e reutilizado por tamanho/`mtime`.
- Áudio decodificado e cache persistente não podem crescer sem limite.
- O destaque de chamada deve caber por largura e altura, sem escala fora do fluxo.
- O bundle Telão não deve expor interfaces dos demais módulos.

### Segurança

- Segredos não podem aparecer em bundle ou logs.
- Arquivos devem permanecer confinados ao diretório gerenciado.
- `service_role` do Supabase não pode estar no cliente.
- Release Android de produção não pode usar chave debug.
- SQLite local ainda não possui criptografia: risco conhecido de acesso físico.
- HTTP claro em LAN permanece uma limitação operacional conhecida.

### Acessibilidade

- Alvo WCAG 2.2 AA para interfaces web.
- Foco visível, ordem por D-pad/teclado e controles ≥44×44 px.
- Informações não podem depender apenas de cor.
- Animações devem respeitar `prefers-reduced-motion`.
- Senha e guichê devem ser legíveis a distância em ambiente comercial iluminado.

## 9. Testes e aceite

### Automação existente

- TTS estrito, revisão, ausência de campainha e interrupção;
- confinamento de storage e traversal;
- vinhetas e agendamento;
- paginação do encarte e descoberta Toledo;
- regressões responsivas do destaque da senha;
- responsividade dos layouts `classic`, `sidebar` e `l-shape`;
- enquadramento de vídeo 16:9, 4:3, 9:16 e 21:9 em 720p, 768p, 1080p e 4K;
- avanço circular, retorno ao primeiro item, skip de falhas e recuperação de vídeo travado;
- quarentena e remoção de cache de vídeo quebrado, reconciliação de exclusões e proteção de referências compartilhadas;
- detecção periódica Toledo, persistência de mudanças materiais, SSE, refetch e polling de recuperação;
- TypeScript, build web, Capacitor e Gradle.

O MCP TestSprite está configurado no ambiente de desenvolvimento para ampliar E2E, mas sua configuração não constitui evidência de testes já executados.

### Homologação obrigatória

- [x] TypeScript compila.
- [x] Testes focais de senha, layouts, playlist e enquadramento: 22/22.
- [x] Testes focais de atualização de preços e ciclo de exclusão/quarentena de mídia: 25/25.
- [x] Testes focais TTS/storage: 17/17.
- [x] Build web dedicado conclui.
- [x] APK de homologação compila e passa na assinatura v2.
- [ ] Validar visualmente 1280×720, 1366×768, 1920×1080 e 3840×2160 em devices reais.
- [ ] Validar badge de repetição, nome longo, guichê oculto/visível e todos os templates.
- [ ] Executar soak mínimo de 48 horas nos dois runtimes.
- [ ] Registrar disco, memória, áudio, suspensão, boot e recuperação antes/depois.
- [x] Inicializar o submódulo `chamacliente` e executar seus testes integrados.
- [ ] Executar isolamento cloud/multitenant em staging.

## 10. Riscos abertos

| Risco | Prioridade | Tratamento |
|---|---|---|
| Soak e devices físicos ainda não executados | P0 | Homologar antes de produção |
| Auditoria NPM de produção contém achados críticos/altos | P0 | Atualizar com análise e regressão; não aplicar `--force` cegamente |
| AGP 8.2.1 emite aviso com compileSdk 35 | P1 | Atualizar AGP/Gradle em ciclo controlado |
| `server/index.ts` monolítico | P1 | Extrair rotas/services com testes de contrato |
| Cache PWA limitado em contexto HTTP inseguro | P1 | Streaming já evita crescimento; HTTPS para offline confiável |
| Watchdog sujeito a políticas OEM | P1 | Device Owner e homologação por modelo |

## 11. Critério de produção

A release poderá ser promovida quando:

1. build, testes automatizados e testes bloqueados estiverem verdes;
2. soak de 48 h não indicar crescimento de cache acima da quota reconciliada;
3. TTS tocar exclusivamente o modo configurado após trocas de revisão;
4. destaque da senha permanecer integral e legível nas resoluções-alvo;
5. APK não permitir acesso a Totem, Operador ou Admin;
6. boot, suspensão e recuperação forem aprovados nos modelos-alvo;
7. backup/restore e isolamento cloud passarem no checklist;
8. APK final estiver assinado por keystore de produção e acompanhado de SHA-256;
9. riscos residuais estiverem documentados e aceitos.

## 12. Roadmap

### P0

1. Homologação física e soak de 48 h.
2. Restaurar suíte do submódulo.
3. Corrigir dependências vulneráveis com regressão.
4. Executar checklist cloud/multitenant.
5. Provisionar keystore Android de produção.

### P1

1. E2E com TestSprite em ambiente reproduzível.
2. Testes instrumentados do cache Android e screenshots por resolução.
3. Modularização do servidor.
4. Atualização AGP/Gradle.
5. Telemetria operacional sem dados sensíveis.

### P2

1. Console cloud de tenants, licenças e devices.
2. HMAC e rotação automática de tokens.
3. Criptografia do SQLite e backups.
4. Distribuição Android gerenciada e política formal de Device Owner.
