# FASE 6 — Comandos Remotos Seguros

Este documento descreve a arquitetura e o funcionamento do mecanismo de polling seguro para execução de comandos remotos de operador no ChamaAí Local Master.

---

## 1. Arquitetura Geral

Substituímos o listener direto de WebSockets do Supabase Realtime (que exigia políticas de RLS e expunha a tabela `comandos_operador` a leituras indevidas) por um fluxo de **Polling Autenticado de Via Única**.

```text
Portal de Operação Cloud
  │ (Cria comando pendente na nuvem)
  ▼
Supabase PostgreSQL (`comandos_operador`)
  │
  ▼  [POST /functions/v1/chamaai-commands] (x-device-token = dev_****_final)
ChamaAí Local Master (Polling)
  ├── 1. Valida dispositivo na nuvem usando hash do token
  ├── 2. Retorna lista de comandos "pending" (e marca como "claimed")
  ├── 3. Valida comando contra a Allowlist local
  ├── 4. Executa localmente via requisições HTTP internas e seguras
  └── 5. Envia ACK com resultado final (status 'executed', 'failed' ou 'rejected')
```

---

## 2. Allowlist de Comandos Permitidos

Para evitar vulnerabilidades de execução remota de código (RCE) ou destruição de dados locais por operadores cloud mal-intencionados, o ChamaAí Local segue uma **Allowlist Rígida**.

### Comandos Permitidos:
* `CALL_NEXT`: Chamar próxima senha no painel/guichê.
* `REPEAT_LAST`: Repetir a última senha chamada no painel.
* `RETURN_TICKET`: Devolver/estornar uma senha para a fila.
* `FINISH_TICKET`: Concluir o atendimento atual do operador.
* `CANCEL_TICKET`: Cancelar uma senha da fila.
* `REFRESH_CONFIG`: Forçar atualização e recarregamento das configurações e telas.
* `PING`: Teste simples de conectividade e status.

### Comandos Estritamente Bloqueados:
* `EXEC_SQL` (Execução de SQL arbitrário)
* `RUN_SCRIPT` (Execução de scripts shell/bash/JS)
* `OPEN_FILE` / `DELETE_FILE` (Leitura ou deleção de arquivos locais)
* `SYSTEM_COMMAND` (Comandos do SO)
* `UPDATE_APP` (Atualizações forçadas fora do fluxo oficial)
* `RESET_DATABASE` (Limpeza completa de tabelas locais)

Se qualquer comando fora da allowlist for recebido, ele será instantaneamente marcado e devolvido no ACK como `rejected`.

---

## 3. Estados dos Comandos

1. **`pending`**: Criado pela nuvem (Portal). Pronto para ser coletado.
2. **`claimed`**: Coletado pelo Caixa Master correspondente. Bloqueado na nuvem para que outras instâncias da mesma loja não processem o mesmo comando em duplicidade.
3. **`executed`**: Comando executado localmente com sucesso.
4. **`failed`**: Comando falhou ao ser processado pelas APIs internas locais.
5. **`rejected`**: Comando recusado (bloqueado pela allowlist ou divergências).

---

## 4. Como Testar

### Passo 1: Simular a Criação de um Comando na Nuvem
Execute o INSERT a seguir no editor SQL do Supabase:

```sql
INSERT INTO comandos_operador (
  tenant_id,
  store_id,
  command_type,
  payload,
  status
) VALUES (
  'SEU_TENANT_UUID',
  'SUA_STORE_UUID',
  'PING',
  '{}'::jsonb,
  'pending'
);
```

### Passo 2: Configurar o Local Master
No arquivo `.env` do local master, adicione a URL da Edge Function:
```env
CHAMAAI_CLOUD_COMMANDS_URL=https://<id-projeto>.functions.supabase.co/chamaai-commands
CHAMAAI_CLOUD_COMMANDS_INTERVAL_SECONDS=10
```

### Passo 3: Iniciar o Servidor Local
Ao iniciar, o log exibirá:
```text
[CLOUD COMMANDS] 🚀 Polling de comandos iniciado (Intervalo: 10s)
[CLOUD COMMANDS] 📥 Recebidos 1 comandos remotos para processar.
[CLOUD COMMANDS] ✅ ACK de 1 comandos enviado com sucesso.
```

No Supabase, o registro terá mudado para `status = 'executed'` e o campo `result` conterá `{ "pong": true, "timestamp": "..." }`.
