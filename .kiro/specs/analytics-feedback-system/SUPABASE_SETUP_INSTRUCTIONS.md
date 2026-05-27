# Instruções de Configuração do Supabase - Tabela Feedbacks

## Visão Geral

Este documento fornece instruções passo a passo para criar a tabela `feedbacks` no Supabase, incluindo todos os campos, constraints, índices e políticas de Row Level Security (RLS).

## Pré-requisitos

- Acesso ao projeto Supabase: `https://npfqnsgjicmxwmurwosu.supabase.co`
- Permissões de administrador no projeto
- Tabela `senhas_publicas` já existente (referenciada pela foreign key)

## Passo a Passo

### 1. Acessar o SQL Editor

1. Acesse o dashboard do Supabase: https://app.supabase.com
2. Selecione o projeto ChamaAI
3. No menu lateral esquerdo, clique em **SQL Editor**
4. Clique em **New Query** para criar uma nova query

### 2. Executar o Script SQL

1. Abra o arquivo `create_feedbacks_table.sql` localizado nesta pasta
2. Copie todo o conteúdo do arquivo
3. Cole no SQL Editor do Supabase
4. Clique em **Run** (ou pressione `Ctrl+Enter`) para executar o script

### 3. Verificar a Criação

Após executar o script, você pode verificar se tudo foi criado corretamente executando as seguintes queries:

#### Verificar estrutura da tabela:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'feedbacks'
ORDER BY ordinal_position;
```

**Resultado esperado:**
| column_name | data_type | is_nullable | column_default |
|-------------|-----------|-------------|----------------|
| id | uuid | NO | gen_random_uuid() |
| created_at | timestamp with time zone | YES | now() |
| ticket_id | integer | YES | NULL |
| tipo_evento | text | NO | NULL |
| evento | text | NO | NULL |
| valor | text | YES | NULL |
| metadata | jsonb | YES | NULL |

#### Verificar índices:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'feedbacks';
```

**Resultado esperado:**
- `feedbacks_pkey` (PRIMARY KEY em id)
- `idx_feedbacks_ticket_id` (índice em ticket_id)
- `idx_feedbacks_tipo_evento` (índice em tipo_evento)
- `idx_feedbacks_created_at` (índice em created_at DESC)

#### Verificar políticas RLS:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'feedbacks';
```

**Resultado esperado:**
| policyname | roles | cmd |
|------------|-------|-----|
| Allow public insert on feedbacks | {anon} | INSERT |
| Allow authenticated select on feedbacks | {authenticated} | SELECT |

#### Verificar constraints:
```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'feedbacks'::regclass;
```

**Resultado esperado:**
- `feedbacks_pkey` (PRIMARY KEY)
- `feedbacks_ticket_id_fkey` (FOREIGN KEY para senhas_publicas)
- `feedbacks_tipo_evento_check` (CHECK tipo_evento IN ('analytics', 'feedback'))

## Estrutura da Tabela

### Campos

| Campo | Tipo | Descrição | Obrigatório |
|-------|------|-----------|-------------|
| `id` | UUID | Identificador único (auto-gerado) | Sim |
| `created_at` | TIMESTAMP WITH TIME ZONE | Data/hora de criação (auto-gerado) | Sim |
| `ticket_id` | INTEGER | Referência ao ticket/senha pública | Não |
| `tipo_evento` | TEXT | Tipo: 'analytics' ou 'feedback' | Sim |
| `evento` | TEXT | Nome do evento específico | Sim |
| `valor` | TEXT | Valor associado (ex: emoji) | Não |
| `metadata` | JSONB | Dados adicionais opcionais | Não |

### Eventos Suportados

#### Analytics (tipo_evento = 'analytics'):
- `visualizacao` - Cliente visualizou a página
- `pdf_download` - Cliente gerou PDF da lista
- `whatsapp_share` - Cliente compartilhou via WhatsApp

#### Feedback (tipo_evento = 'feedback'):
- `emoji_rating` - Cliente avaliou com emoji (valor: 😡, 😕, 😐, 🙂, 😄)

### Políticas de Segurança (RLS)

- **INSERT**: Permitido para usuários anônimos (anon role)
  - Permite que clientes registrem eventos e feedbacks sem autenticação
  
- **SELECT**: Permitido apenas para usuários autenticados (authenticated role)
  - Apenas administradores podem visualizar os dados no painel admin

- **UPDATE/DELETE**: Não permitido
  - Dados são imutáveis para garantir integridade do histórico

## Exemplos de Uso

### Inserir evento de analytics (visualização):
```sql
INSERT INTO feedbacks (ticket_id, tipo_evento, evento, valor)
VALUES (123, 'analytics', 'visualizacao', NULL);
```

### Inserir feedback com emoji:
```sql
INSERT INTO feedbacks (ticket_id, tipo_evento, evento, valor)
VALUES (123, 'feedback', 'emoji_rating', '😄');
```

### Consultar todos os feedbacks (requer autenticação):
```sql
SELECT * FROM feedbacks
ORDER BY created_at DESC
LIMIT 100;
```

### Consultar distribuição de feedbacks por emoji:
```sql
SELECT valor, COUNT(*) as total
FROM feedbacks
WHERE tipo_evento = 'feedback' AND evento = 'emoji_rating'
GROUP BY valor
ORDER BY total DESC;
```

## Troubleshooting

### Erro: "relation senhas_publicas does not exist"
**Solução**: Verifique se a tabela `senhas_publicas` existe no banco de dados. Se não existir, remova ou ajuste a foreign key constraint.

### Erro: "permission denied for table feedbacks"
**Solução**: Verifique se o RLS está habilitado e se as políticas foram criadas corretamente. Execute as queries de verificação acima.

### Erro: "duplicate key value violates unique constraint"
**Solução**: Se a tabela já existe, você pode deletá-la primeiro com `DROP TABLE IF EXISTS feedbacks CASCADE;` e executar o script novamente.

## Próximos Passos

Após criar a tabela com sucesso:

1. ✅ Tabela `feedbacks` criada
2. ⏭️ Configurar Row Level Security (Tarefa 1.2)
3. ⏭️ Implementar módulo de Analytics (Tarefa 2.x)
4. ⏭️ Implementar sistema de Feedback (Tarefa 4.x)
5. ⏭️ Implementar painel administrativo (Tarefa 7.x)

## Suporte

Se encontrar problemas durante a configuração:
1. Verifique os logs de erro no SQL Editor do Supabase
2. Consulte a documentação do Supabase: https://supabase.com/docs
3. Revise os requisitos 1.1 e 1.2 no arquivo `requirements.md`
