# 📊 Guia de Uso - Sistema de Analytics e Feedback

## ✅ Status da Implementação

**COMPLETO E FUNCIONAL** - Todas as funcionalidades principais foram implementadas e testadas.

---

## 🎯 Funcionalidades Implementadas

### 1. **Sistema de Analytics** ✅
- ✅ Rastreamento automático de visualizações de página
- ✅ Rastreamento de downloads de PDF
- ✅ Rastreamento de compartilhamentos via WhatsApp
- ✅ Debounce de 500ms para evitar registros duplicados
- ✅ Armazenamento no Supabase com RLS configurado

### 2. **Sistema de Feedback** ✅
- ✅ Overlay modal com 5 opções de emoji (😡 😕 😐 🙂 😄)
- ✅ Triggers automáticos:
  - Ticket expirado (após 2 segundos)
  - Primeiro item no carrinho (após 3 segundos)
- ✅ Controle de exibição única por sessão
- ✅ Animações suaves (fade-in e scale)
- ✅ Acessibilidade (ARIA, navegação por teclado)

### 3. **Painel Administrativo** ✅
- ✅ Autenticação via Supabase Auth
- ✅ Dashboard com métricas em tempo real
- ✅ Gráficos interativos (recharts):
  - Evolução temporal (linha)
  - Distribuição de feedbacks (barras)
  - Proporção de eventos (pizza)
- ✅ Filtros de período (Hoje, 7 dias, 30 dias)
- ✅ Auto-refresh a cada 30 segundos
- ✅ Design responsivo

---

## 🚀 Como Usar

### **Para Clientes (Interface Web)**

1. **Acesse via QR Code**
   - Escaneie o QR Code fornecido pela loja
   - A página carregará automaticamente com seu ticket

2. **Navegue pelo Catálogo**
   - Visualização é rastreada automaticamente
   - Adicione produtos ao carrinho

3. **Feedback Automático**
   - Ao adicionar o primeiro item, após 3 segundos aparecerá o overlay de feedback
   - Ou quando seu ticket expirar, após 2 segundos
   - Escolha um emoji para avaliar a experiência
   - Pode pular clicando em "Pular" ou ESC

4. **Gere PDF ou Compartilhe**
   - Clique em "GERAR PDF DA LISTA" (rastreado)
   - Ou "ENVIAR VIA WHATSAPP" (rastreado)

---

### **Para Administradores (Painel Admin)**

#### **1. Primeiro Acesso - Criar Usuário Admin**

Você precisa criar um usuário administrativo no Supabase:

1. Acesse o **Supabase Dashboard**: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Authentication** → **Users**
4. Clique em **Add User** → **Create new user**
5. Preencha:
   - **Email**: seu@email.com
   - **Password**: sua_senha_segura
   - **Auto Confirm User**: ✅ (marque esta opção)
6. Clique em **Create user**

#### **2. Acessar o Painel**

1. Acesse: `http://localhost:5173/#/admin/login` (dev) ou `https://seu-dominio.com/#/admin/login` (produção)
2. Faça login com as credenciais criadas
3. Você será redirecionado para o dashboard

#### **3. Usar o Dashboard**

**Filtros de Período:**
- **Hoje**: Dados de hoje
- **Últimos 7 dias**: Última semana
- **Últimos 30 dias**: Último mês

**Métricas Principais:**
- 📈 **Visualizações**: Quantas pessoas acessaram o catálogo
- 📄 **PDFs Gerados**: Quantos PDFs foram baixados
- 📤 **Compartilhamentos**: Quantos compartilharam via WhatsApp
- 💬 **Feedbacks**: Total de avaliações recebidas

**Distribuição de Feedbacks:**
- Veja quantos clientes escolheram cada emoji
- Percentual de cada avaliação

**Gráficos:**
- **Evolução Temporal**: Linha do tempo com todos os eventos
- **Feedbacks por Emoji**: Barras mostrando distribuição
- **Proporção de Eventos**: Pizza com tipos de eventos

**Atualização:**
- Auto-refresh a cada 30 segundos
- Botão manual de refresh no canto superior direito

**Logout:**
- Clique em "Sair" no canto superior direito

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: `feedbacks`

```sql
CREATE TABLE feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ticket_id INTEGER,
  tipo_evento TEXT CHECK (tipo_evento IN ('analytics', 'feedback')),
  evento TEXT NOT NULL,
  valor TEXT,
  metadata JSONB
);
```

**Índices:**
- `idx_feedbacks_ticket_id` (ticket_id)
- `idx_feedbacks_tipo_evento` (tipo_evento)
- `idx_feedbacks_created_at` (created_at)

**RLS (Row Level Security):**
- ✅ INSERT: Público (anon role)
- ✅ SELECT: Apenas usuários autenticados

---

## 📁 Arquivos Criados/Modificados

### **Criados:**
```
src/shared/analytics.ts              # Hook de analytics
src/components/FeedbackOverlay.tsx   # Modal de feedback
src/components/AdminLogin.tsx        # Página de login
src/components/AdminDashboard.tsx    # Painel administrativo
```

### **Modificados:**
```
src/App.tsx                          # Integração de analytics e feedback
src/main.tsx                         # Rotas administrativas
src/index.css                        # Animações CSS
package.json                         # Dependência recharts
```

---

## 🔧 Comandos Úteis

### **Desenvolvimento:**
```bash
cd d:\saas\chamaAI_novo\chamacliente
npm run dev
```

### **Build de Produção:**
```bash
npm run build
```

### **Preview da Build:**
```bash
npm run preview
```

---

## 🌐 URLs de Acesso

### **Desenvolvimento:**
- Cliente: `http://localhost:5173/?ticket=123`
- Admin Login: `http://localhost:5173/#/admin/login`
- Admin Dashboard: `http://localhost:5173/#/admin`

### **Produção:**
- Cliente: `https://seu-dominio.com/?ticket=123`
- Admin Login: `https://seu-dominio.com/#/admin/login`
- Admin Dashboard: `https://seu-dominio.com/#/admin`

---

## 🐛 Troubleshooting

### **Problema: Feedback não aparece**
- ✅ Verifique se o ticket é válido
- ✅ Limpe o sessionStorage: `sessionStorage.clear()`
- ✅ Verifique o console do navegador para erros

### **Problema: Não consigo fazer login no admin**
- ✅ Verifique se o usuário foi criado no Supabase
- ✅ Confirme que "Auto Confirm User" está marcado
- ✅ Verifique as credenciais

### **Problema: Dados não aparecem no dashboard**
- ✅ Verifique se há registros na tabela `feedbacks`
- ✅ Confirme que o RLS está configurado corretamente
- ✅ Verifique se você está autenticado

### **Problema: Erro de compilação**
- ✅ Execute: `npm install`
- ✅ Limpe o cache: `npm run build -- --force`
- ✅ Verifique se todas as dependências estão instaladas

---

## 📊 Exemplo de Dados

### **Analytics Event:**
```json
{
  "tipo_evento": "analytics",
  "evento": "visualizacao",
  "ticket_id": 123,
  "valor": null,
  "metadata": {}
}
```

### **Feedback Event:**
```json
{
  "tipo_evento": "feedback",
  "evento": "feedback_emoji",
  "ticket_id": 123,
  "valor": "😄",
  "metadata": {}
}
```

---

## ✨ Próximos Passos (Opcional)

### **Otimizações Implementáveis:**
- [ ] Lazy loading do FeedbackOverlay (Task 9.2)
- [ ] React.memo para componentes (Task 9.3)
- [ ] Skeleton loaders (Task 9.4)

### **Funcionalidades Adicionais:**
- [ ] Exportar relatórios em CSV/Excel
- [ ] Filtros avançados (por ticket, por período customizado)
- [ ] Notificações push para novos feedbacks
- [ ] Dashboard em tempo real com WebSockets

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique este guia primeiro
2. Consulte os logs do console do navegador
3. Verifique os logs do Supabase
4. Revise a documentação do código (comentários inline)

---

**Sistema desenvolvido com:**
- ⚛️ React 19
- 📘 TypeScript
- 🎨 Tailwind CSS
- 🗄️ Supabase
- 📊 Recharts
- 🚀 Vite

**Status:** ✅ Pronto para produção
**Última atualização:** 2024
