# Design Document: Analytics and Feedback System

## Overview

Este documento descreve o design técnico do sistema de analytics e feedback para o ChamaAI. O sistema rastreará interações dos clientes (visualizações, downloads de PDF, compartilhamentos via WhatsApp) e coletará feedback através de emojis. Todos os dados serão armazenados em uma tabela única no Supabase com Row Level Security (RLS) apropriado. Um painel administrativo protegido por autenticação exibirá métricas e gráficos interativos.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   App.tsx    │  │  Analytics   │  │   Feedback   │      │
│  │  (Existing)  │──│   Tracker    │  │   Overlay    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                            ▼                                 │
│                  ┌──────────────────┐                        │
│                  │ Supabase Client  │                        │
│                  │   (Existing)     │                        │
│                  └──────────────────┘                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Backend                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              feedbacks Table (New)                   │   │
│  │  - id (uuid, PK)                                     │   │
│  │  - created_at (timestamp)                            │   │
│  │  - ticket_id (integer, FK)                           │   │
│  │  - tipo_evento ('analytics' | 'feedback')            │   │
│  │  - evento (text)                                     │   │
│  │  - valor (text, nullable)                            │   │
│  │  - metadata (jsonb, nullable)                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              RLS Policies                            │   │
│  │  - INSERT: public (anon role)                        │   │
│  │  - SELECT: authenticated users only                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Login     │  │   Metrics    │  │    Charts    │      │
│  │     Page     │──│    Cards     │  │  (recharts)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                            ▼                                 │
│                  ┌──────────────────┐                        │
│                  │  Supabase Auth   │                        │
│                  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

```
src/
├── components/
│   ├── analytics/
│   │   ├── AnalyticsTracker.tsx      # Hook/service para rastrear eventos
│   │   └── types.ts                  # Tipos TypeScript para analytics
│   ├── feedback/
│   │   ├── FeedbackOverlay.tsx       # Modal de feedback com emojis
│   │   ├── FeedbackTrigger.tsx       # Lógica de triggers para exibir overlay
│   │   └── types.ts                  # Tipos TypeScript para feedback
│   └── admin/
│       ├── AdminLayout.tsx           # Layout base do painel admin
│       ├── LoginPage.tsx             # Página de login
│       ├── DashboardPage.tsx         # Página principal com métricas
│       ├── MetricsCard.tsx           # Card de métrica individual
│       ├── ChartsSection.tsx         # Seção de gráficos
│       └── types.ts                  # Tipos TypeScript para admin
├── shared/
│   ├── supabaseClient.ts             # Re-export do cliente existente
│   └── analyticsService.ts           # Serviço para operações de analytics
└── App.tsx                            # Integração dos novos componentes
```


## Data Models

### Feedbacks Table Schema

```typescript
interface FeedbackRecord {
  id: string;                    // uuid, auto-generated
  created_at: string;            // timestamp with time zone, auto-generated
  ticket_id: number;             // referência à tabela senhas_publicas
  tipo_evento: 'analytics' | 'feedback';
  evento: AnalyticsEvent | FeedbackEvent;
  valor: string | null;          // emoji para feedback, null para analytics
  metadata?: Record<string, any>; // jsonb, dados adicionais opcionais
}

type AnalyticsEvent = 'visualizacao' | 'pdf_download' | 'whatsapp_share';
type FeedbackEvent = 'emoji_rating';

type EmojiRating = '😡' | '😕' | '😐' | '🙂' | '😄';
```

### RLS Policies

```sql
-- Política para INSERT público (anon role)
CREATE POLICY "Allow public insert on feedbacks"
ON feedbacks
FOR INSERT
TO anon
WITH CHECK (true);

-- Política para SELECT apenas para usuários autenticados
CREATE POLICY "Allow authenticated select on feedbacks"
ON feedbacks
FOR SELECT
TO authenticated
USING (true);
```

### Database Migration

```sql
-- Criar tabela feedbacks
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ticket_id INTEGER REFERENCES senhas_publicas(id),
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('analytics', 'feedback')),
  evento TEXT NOT NULL,
  valor TEXT,
  metadata JSONB
);

-- Criar índices para performance
CREATE INDEX idx_feedbacks_ticket_id ON feedbacks(ticket_id);
CREATE INDEX idx_feedbacks_tipo_evento ON feedbacks(tipo_evento);
CREATE INDEX idx_feedbacks_created_at ON feedbacks(created_at DESC);

-- Habilitar RLS
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- Aplicar políticas RLS
CREATE POLICY "Allow public insert on feedbacks"
ON feedbacks FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated select on feedbacks"
ON feedbacks FOR SELECT TO authenticated USING (true);
```


## Components and Interfaces

### 1. AnalyticsTracker (Hook/Service)

**Responsabilidade:** Rastrear e registrar eventos de analytics no Supabase.

**Interface:**

```typescript
interface AnalyticsTrackerHook {
  trackVisualizacao: (ticketId: number) => Promise<void>;
  trackPDFDownload: (ticketId: number) => Promise<void>;
  trackWhatsAppShare: (ticketId: number) => Promise<void>;
}

function useAnalyticsTracker(): AnalyticsTrackerHook;
```

**Implementação:**

```typescript
import { useCallback, useRef } from 'react';
import { supabase } from '../../shared/supabaseClient';

export function useAnalyticsTracker() {
  const visualizacaoTracked = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const trackEvent = useCallback(async (
    ticketId: number,
    evento: AnalyticsEvent
  ) => {
    try {
      const { error } = await supabase
        .from('feedbacks')
        .insert({
          ticket_id: ticketId,
          tipo_evento: 'analytics',
          evento,
          valor: null
        });

      if (error) {
        console.error(`Erro ao registrar evento ${evento}:`, error);
      }
    } catch (err) {
      console.error(`Erro crítico ao registrar evento ${evento}:`, err);
    }
  }, []);

  const trackVisualizacao = useCallback((ticketId: number) => {
    // Debounce de 500ms para evitar registros duplicados
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (!visualizacaoTracked.current) {
        trackEvent(ticketId, 'visualizacao');
        visualizacaoTracked.current = true;
      }
    }, 500);
  }, [trackEvent]);

  const trackPDFDownload = useCallback((ticketId: number) => {
    trackEvent(ticketId, 'pdf_download');
  }, [trackEvent]);

  const trackWhatsAppShare = useCallback((ticketId: number) => {
    trackEvent(ticketId, 'whatsapp_share');
  }, [trackEvent]);

  return {
    trackVisualizacao,
    trackPDFDownload,
    trackWhatsAppShare
  };
}
```

**Integração com App.tsx:**

```typescript
// Em App.tsx, adicionar:
const { trackVisualizacao, trackPDFDownload, trackWhatsAppShare } = useAnalyticsTracker();

// Rastrear visualização quando ticket é válido
useEffect(() => {
  if (ticketId && ticketStatus === 'aguardando') {
    trackVisualizacao(Number(ticketId));
  }
}, [ticketId, ticketStatus, trackVisualizacao]);

// Modificar função gerarPDF
const gerarPDF = async () => {
  await gerarPDFLista({ /* ... */ });
  if (ticketId) {
    trackPDFDownload(Number(ticketId));
  }
};

// Modificar função enviarWhatsApp
const enviarWhatsApp = () => {
  // ... código existente ...
  if (ticketId) {
    trackWhatsAppShare(Number(ticketId));
  }
};
```


### 2. FeedbackOverlay Component

**Responsabilidade:** Exibir modal de feedback com 5 opções de emoji.

**Interface:**

```typescript
interface FeedbackOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (emoji: EmojiRating) => void;
  ticketId: number;
}

function FeedbackOverlay(props: FeedbackOverlayProps): JSX.Element;
```

**Implementação:**

```typescript
import { X } from 'lucide-react';
import { useEffect } from 'react';

const EMOJI_OPTIONS: EmojiRating[] = ['😡', '😕', '😐', '🙂', '😄'];

const EMOJI_LABELS: Record<EmojiRating, string> = {
  '😡': 'Muito Insatisfeito',
  '😕': 'Insatisfeito',
  '😐': 'Neutro',
  '🙂': 'Satisfeito',
  '😄': 'Muito Satisfeito'
};

export function FeedbackOverlay({ isOpen, onClose, onSubmit, ticketId }: FeedbackOverlayProps) {
  // Fechar com tecla ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEmojiClick = async (emoji: EmojiRating) => {
    onSubmit(emoji);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      <div className="bg-surface w-full max-w-md mx-4 rounded-3xl p-8 shadow-2xl border border-outline-variant/50 relative">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-variant transition-colors"
          aria-label="Fechar feedback"
        >
          <X className="w-5 h-5 text-ink-secondary" />
        </button>

        {/* Título */}
        <h2 
          id="feedback-title"
          className="text-2xl font-bold text-ink text-center mb-3"
        >
          Como foi sua experiência?
        </h2>
        <p className="text-sm text-ink-secondary text-center mb-8">
          Sua opinião nos ajuda a melhorar!
        </p>

        {/* Emojis */}
        <div className="flex justify-center gap-4 flex-wrap">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-surface-variant transition-all active:scale-95"
              aria-label={EMOJI_LABELS[emoji]}
            >
              <span className="text-5xl" style={{ minWidth: '48px', minHeight: '48px' }}>
                {emoji}
              </span>
              <span className="text-xs text-ink-secondary font-medium">
                {EMOJI_LABELS[emoji]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```


### 3. FeedbackTrigger Component

**Responsabilidade:** Gerenciar a lógica de quando exibir o overlay de feedback.

**Interface:**

```typescript
interface FeedbackTriggerProps {
  ticketId: number;
  ticketStatus: string;
  carrinhoSize: number;
}

function FeedbackTrigger(props: FeedbackTriggerProps): JSX.Element;
```

**Implementação:**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { FeedbackOverlay } from './FeedbackOverlay';
import { supabase } from '../../shared/supabaseClient';

const FEEDBACK_SESSION_KEY = 'feedback_shown';

export function FeedbackTrigger({ ticketId, ticketStatus, carrinhoSize }: FeedbackTriggerProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [feedbackShown, setFeedbackShown] = useState<Set<string>>(
    () => {
      const stored = sessionStorage.getItem(FEEDBACK_SESSION_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    }
  );

  // Trigger 1: Ticket expirado (após 2 segundos)
  useEffect(() => {
    if (ticketStatus === 'expirado' && !feedbackShown.has('expirado')) {
      const timer = setTimeout(() => {
        setShowOverlay(true);
        markFeedbackShown('expirado');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [ticketStatus, feedbackShown]);

  // Trigger 2: Primeiro item no carrinho (após 3 segundos)
  useEffect(() => {
    if (carrinhoSize === 1 && !feedbackShown.has('primeiro_item')) {
      const timer = setTimeout(() => {
        setShowOverlay(true);
        markFeedbackShown('primeiro_item');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [carrinhoSize, feedbackShown]);

  const markFeedbackShown = (trigger: string) => {
    const updated = new Set(feedbackShown);
    updated.add(trigger);
    setFeedbackShown(updated);
    sessionStorage.setItem(FEEDBACK_SESSION_KEY, JSON.stringify(Array.from(updated)));
  };

  const handleClose = useCallback(() => {
    setShowOverlay(false);
  }, []);

  const handleSubmit = useCallback(async (emoji: EmojiRating) => {
    try {
      // Validar que ticket_id existe
      if (!ticketId) {
        console.error('ticket_id inválido para registro de feedback');
        return;
      }

      const { error } = await supabase
        .from('feedbacks')
        .insert({
          ticket_id: ticketId,
          tipo_evento: 'feedback',
          evento: 'emoji_rating',
          valor: emoji
        });

      if (error) {
        console.error('Erro ao registrar feedback:', error);
      }
    } catch (err) {
      console.error('Erro crítico ao registrar feedback:', err);
    } finally {
      setShowOverlay(false);
    }
  }, [ticketId]);

  return (
    <FeedbackOverlay
      isOpen={showOverlay}
      onClose={handleClose}
      onSubmit={handleSubmit}
      ticketId={ticketId}
    />
  );
}
```

**Integração com App.tsx:**

```typescript
// Em App.tsx, adicionar:
import { FeedbackTrigger } from './components/feedback/FeedbackTrigger';

// No return do componente, adicionar antes do fechamento:
return (
  <div className="min-h-screen w-full bg-background font-sans pb-24">
    {/* ... código existente ... */}
    
    {/* Feedback Trigger */}
    {ticketId && (
      <FeedbackTrigger
        ticketId={Number(ticketId)}
        ticketStatus={ticketStatus}
        carrinhoSize={Object.keys(carrinho).length}
      />
    )}
  </div>
);
```


### 4. Admin Dashboard Components

#### 4.1 LoginPage Component

**Responsabilidade:** Página de login para acesso ao painel administrativo.

**Interface:**

```typescript
function LoginPage(): JSX.Element;
```

**Implementação:**

```typescript
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/supabaseClient';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        setError('Credenciais inválidas. Verifique seu email e senha.');
        return;
      }

      if (data.session) {
        navigate('/admin');
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor. Tente novamente.');
      console.error('Erro no login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="bg-surface w-full max-w-md rounded-3xl p-8 shadow-xl border border-outline-variant">
        <h1 className="text-3xl font-bold text-ink text-center mb-2">
          Painel Administrativo
        </h1>
        <p className="text-sm text-ink-secondary text-center mb-8">
          Faça login para acessar as métricas
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-2">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
```


#### 4.2 DashboardPage Component

**Responsabilidade:** Página principal do painel administrativo com métricas e gráficos.

**Interface:**

```typescript
function DashboardPage(): JSX.Element;
```

**Implementação:**

```typescript
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/supabaseClient';
import { MetricsCard } from './MetricsCard';
import { ChartsSection } from './ChartsSection';
import { LogOut } from 'lucide-react';

interface DashboardData {
  totalVisualizacoes: number;
  totalPDFs: number;
  totalWhatsApp: number;
  totalFeedbacks: number;
  feedbackDistribution: Record<string, number>;
  timeSeriesData: Array<{ date: string; count: number; tipo: string }>;
}

type FilterPeriod = 'hoje' | '7dias' | '30dias' | 'personalizado';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('7dias');
  const navigate = useNavigate();

  // Verificar autenticação
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/admin/login');
      }
    };
    checkAuth();
  }, [navigate]);

  // Buscar dados
  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/admin/login');
        return;
      }

      // Calcular data de início baseado no filtro
      const now = new Date();
      let startDate = new Date();
      
      switch (filterPeriod) {
        case 'hoje':
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7dias':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30dias':
          startDate.setDate(now.getDate() - 30);
          break;
      }

      // Buscar todos os registros do período
      const { data: feedbacks, error: fetchError } = await supabase
        .from('feedbacks')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError('Erro ao buscar dados. Tente novamente.');
        console.error('Erro ao buscar feedbacks:', fetchError);
        return;
      }

      // Processar dados
      const analytics = feedbacks?.filter(f => f.tipo_evento === 'analytics') || [];
      const feedbackRecords = feedbacks?.filter(f => f.tipo_evento === 'feedback') || [];

      const dashboardData: DashboardData = {
        totalVisualizacoes: analytics.filter(a => a.evento === 'visualizacao').length,
        totalPDFs: analytics.filter(a => a.evento === 'pdf_download').length,
        totalWhatsApp: analytics.filter(a => a.evento === 'whatsapp_share').length,
        totalFeedbacks: feedbackRecords.length,
        feedbackDistribution: feedbackRecords.reduce((acc, f) => {
          const emoji = f.valor || 'unknown';
          acc[emoji] = (acc[emoji] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        timeSeriesData: [] // Será processado abaixo
      };

      // Processar série temporal (agrupar por dia)
      const timeSeriesMap = new Map<string, Record<string, number>>();
      
      feedbacks?.forEach(f => {
        const date = new Date(f.created_at).toLocaleDateString('pt-BR');
        if (!timeSeriesMap.has(date)) {
          timeSeriesMap.set(date, {});
        }
        const dayData = timeSeriesMap.get(date)!;
        const key = f.tipo_evento === 'analytics' ? f.evento : 'feedback';
        dayData[key] = (dayData[key] || 0) + 1;
      });

      dashboardData.timeSeriesData = Array.from(timeSeriesMap.entries()).map(([date, counts]) => ({
        date,
        ...counts
      }));

      setData(dashboardData);
    } catch (err) {
      setError('Erro ao processar dados. Tente novamente.');
      console.error('Erro ao processar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh a cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [filterPeriod]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const feedbackPercentages = useMemo(() => {
    if (!data || data.totalFeedbacks === 0) return {};
    return Object.entries(data.feedbackDistribution).reduce((acc, [emoji, count]) => {
      acc[emoji] = ((count / data.totalFeedbacks) * 100).toFixed(1);
      return acc;
    }, {} as Record<string, string>);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-ink text-lg">Carregando métricas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-outline-variant sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-ink">Painel Administrativo</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-variant hover:bg-outline-variant transition-colors text-ink-secondary"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filtros */}
        <div className="mb-8 flex gap-3 flex-wrap">
          {(['hoje', '7dias', '30dias'] as FilterPeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setFilterPeriod(period)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filterPeriod === period
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-outline-variant text-ink-secondary hover:bg-surface-variant'
              }`}
            >
              {period === 'hoje' ? 'Hoje' : period === '7dias' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-8 bg-error/10 border border-error/20 text-error px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricsCard
                title="Visualizações"
                value={data.totalVisualizacoes}
                icon="👁️"
              />
              <MetricsCard
                title="PDFs Gerados"
                value={data.totalPDFs}
                icon="📄"
              />
              <MetricsCard
                title="Compartilhamentos"
                value={data.totalWhatsApp}
                icon="📤"
              />
              <MetricsCard
                title="Feedbacks"
                value={data.totalFeedbacks}
                icon="💬"
              />
            </div>

            {/* Feedback Distribution Cards */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-ink mb-4">Distribuição de Feedbacks</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {['😡', '😕', '😐', '🙂', '😄'].map((emoji) => (
                  <div
                    key={emoji}
                    className="bg-surface border border-outline-variant rounded-2xl p-4 text-center"
                  >
                    <div className="text-4xl mb-2">{emoji}</div>
                    <div className="text-2xl font-bold text-ink">
                      {data.feedbackDistribution[emoji] || 0}
                    </div>
                    <div className="text-sm text-ink-secondary">
                      {feedbackPercentages[emoji] || '0.0'}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts */}
            <ChartsSection
              timeSeriesData={data.timeSeriesData}
              feedbackDistribution={data.feedbackDistribution}
              analyticsData={{
                visualizacao: data.totalVisualizacoes,
                pdf_download: data.totalPDFs,
                whatsapp_share: data.totalWhatsApp
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
```


#### 4.3 MetricsCard Component

**Responsabilidade:** Card individual para exibir uma métrica.

**Implementação:**

```typescript
interface MetricsCardProps {
  title: string;
  value: number;
  icon: string;
}

export function MetricsCard({ title, value, icon }: MetricsCardProps) {
  return (
    <div className="bg-surface border border-outline-variant rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{icon}</span>
        <span className="text-sm font-medium text-ink-secondary uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="text-4xl font-bold text-ink">{value.toLocaleString('pt-BR')}</div>
    </div>
  );
}
```

#### 4.4 ChartsSection Component

**Responsabilidade:** Seção com gráficos interativos usando recharts.

**Implementação:**

```typescript
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface ChartsSectionProps {
  timeSeriesData: Array<{ date: string; [key: string]: any }>;
  feedbackDistribution: Record<string, number>;
  analyticsData: {
    visualizacao: number;
    pdf_download: number;
    whatsapp_share: number;
  };
}

const EMOJI_COLORS: Record<string, string> = {
  '😡': '#ef4444',
  '😕': '#f59e0b',
  '😐': '#94a3b8',
  '🙂': '#22c55e',
  '😄': '#10b981'
};

const ANALYTICS_COLORS = ['#2563eb', '#8b5cf6', '#ec4899'];

export function ChartsSection({ timeSeriesData, feedbackDistribution, analyticsData }: ChartsSectionProps) {
  // Preparar dados para gráfico de pizza de analytics
  const analyticsPieData = [
    { name: 'Visualizações', value: analyticsData.visualizacao },
    { name: 'PDFs', value: analyticsData.pdf_download },
    { name: 'WhatsApp', value: analyticsData.whatsapp_share }
  ];

  // Preparar dados para gráfico de barras de feedback
  const feedbackBarData = Object.entries(feedbackDistribution).map(([emoji, count]) => ({
    emoji,
    count
  }));

  return (
    <div className="space-y-8">
      {/* Gráfico de Linha: Evolução Temporal */}
      <div className="bg-surface border border-outline-variant rounded-2xl p-6">
        <h3 className="text-lg font-bold text-ink mb-4">Evolução Temporal de Eventos</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="visualizacao" stroke="#2563eb" name="Visualizações" />
            <Line type="monotone" dataKey="pdf_download" stroke="#8b5cf6" name="PDFs" />
            <Line type="monotone" dataKey="whatsapp_share" stroke="#ec4899" name="WhatsApp" />
            <Line type="monotone" dataKey="feedback" stroke="#22c55e" name="Feedbacks" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gráfico de Barras: Distribuição de Feedbacks */}
        <div className="bg-surface border border-outline-variant rounded-2xl p-6">
          <h3 className="text-lg font-bold text-ink mb-4">Distribuição de Feedbacks</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={feedbackBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="emoji" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="count" name="Quantidade">
                {feedbackBarData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={EMOJI_COLORS[entry.emoji] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Pizza: Proporção de Eventos Analytics */}
        <div className="bg-surface border border-outline-variant rounded-2xl p-6">
          <h3 className="text-lg font-bold text-ink mb-4">Proporção de Eventos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analyticsPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {analyticsPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={ANALYTICS_COLORS[index % ANALYTICS_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```


## Error Handling

### Error Handling Strategy

## Routing Configuration

### Router Setup

```typescript
// Em main.tsx ou App.tsx, configurar rotas:
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/admin/LoginPage';
import { DashboardPage } from './components/admin/DashboardPage';

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota principal do cliente */}
        <Route path="/" element={<App />} />
        
        {/* Rotas administrativas */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<DashboardPage />} />
        
        {/* Redirect para login se rota admin não encontrada */}
        <Route path="/admin/*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

## Error Handling Strategy

### 1. Analytics Tracking Errors

```typescript
// Estratégia: Log no console, não interromper UX
try {
  await supabase.from('feedbacks').insert({ /* ... */ });
} catch (error) {
  console.error('Erro ao registrar evento analytics:', error);
  // Continuar execução normalmente
}
```

### 2. Feedback Submission Errors

```typescript
// Estratégia: Log no console, fechar overlay
try {
  await supabase.from('feedbacks').insert({ /* ... */ });
} catch (error) {
  console.error('Erro ao registrar feedback:', error);
} finally {
  setShowOverlay(false); // Sempre fechar overlay
}
```

### 3. Admin Dashboard Errors

```typescript
// Estratégia: Exibir mensagem amigável ao usuário
try {
  const { data, error } = await supabase.from('feedbacks').select('*');
  if (error) throw error;
  setData(data);
} catch (error) {
  setError('Erro ao carregar dados. Tente novamente.');
  console.error('Erro ao buscar dados:', error);
}
```

### 4. Authentication Errors

```typescript
// Estratégia: Redirecionar para login, exibir mensagem
try {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setError('Credenciais inválidas. Verifique seu email e senha.');
    return;
  }
  navigate('/admin');
} catch (error) {
  setError('Erro ao conectar ao servidor. Tente novamente.');
  console.error('Erro no login:', error);
}
```

### 5. Validation Errors

```typescript
// Validar ticket_id antes de registrar
if (!ticketId || isNaN(Number(ticketId))) {
  console.error('ticket_id inválido:', ticketId);
  return;
}

// Validar tipo_evento e evento
const validTipoEvento = ['analytics', 'feedback'];
const validEventos = ['visualizacao', 'pdf_download', 'whatsapp_share', 'emoji_rating'];

if (!validTipoEvento.includes(tipo_evento) || !validEventos.includes(evento)) {
  console.error('Valores inválidos:', { tipo_evento, evento });
  return;
}
```


## Performance Optimizations

### 1. Debouncing Visualização Events

```typescript
// Implementado em useAnalyticsTracker
const debounceTimer = useRef<NodeJS.Timeout | null>(null);

const trackVisualizacao = useCallback((ticketId: number) => {
  if (debounceTimer.current) {
    clearTimeout(debounceTimer.current);
  }
  
  debounceTimer.current = setTimeout(() => {
    if (!visualizacaoTracked.current) {
      trackEvent(ticketId, 'visualizacao');
      visualizacaoTracked.current = true;
    }
  }, 500);
}, [trackEvent]);
```

### 2. Lazy Loading Feedback Overlay

```typescript
// Em App.tsx ou componente pai
import { lazy, Suspense } from 'react';

const FeedbackTrigger = lazy(() => import('./components/feedback/FeedbackTrigger'));

// No render:
<Suspense fallback={null}>
  {ticketId && (
    <FeedbackTrigger
      ticketId={Number(ticketId)}
      ticketStatus={ticketStatus}
      carrinhoSize={Object.keys(carrinho).length}
    />
  )}
</Suspense>
```

### 3. Memoization no Dashboard

```typescript
// Memoizar cálculos pesados
const feedbackPercentages = useMemo(() => {
  if (!data || data.totalFeedbacks === 0) return {};
  return Object.entries(data.feedbackDistribution).reduce((acc, [emoji, count]) => {
    acc[emoji] = ((count / data.totalFeedbacks) * 100).toFixed(1);
    return acc;
  }, {} as Record<string, string>);
}, [data]);

// Memoizar componentes de gráficos
const ChartsSection = React.memo(ChartsSectionComponent);
```

### 4. Paginação/Virtualização (Futuro)

```typescript
// Para listas com > 100 registros, implementar paginação:
const ITEMS_PER_PAGE = 50;

const [currentPage, setCurrentPage] = useState(1);
const paginatedData = useMemo(() => {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  return allData.slice(start, end);
}, [allData, currentPage]);
```

### 5. Async Event Tracking

```typescript
// Todos os eventos são registrados de forma assíncrona
// sem bloquear a UI principal
const trackEvent = useCallback(async (ticketId: number, evento: AnalyticsEvent) => {
  // Não usar await aqui - fire and forget
  supabase.from('feedbacks').insert({ /* ... */ })
    .catch(error => console.error('Erro ao registrar evento:', error));
}, []);
```


## Accessibility Considerations

### 1. Feedback Overlay

```typescript
// Atributos ARIA
<div 
  role="dialog"
  aria-modal="true"
  aria-labelledby="feedback-title"
  aria-describedby="feedback-description"
>
  <h2 id="feedback-title">Como foi sua experiência?</h2>
  <p id="feedback-description">Sua opinião nos ajuda a melhorar!</p>
  
  {/* Botões com labels descritivos */}
  <button aria-label="Muito Insatisfeito - Emoji triste">😡</button>
  <button aria-label="Fechar feedback" onClick={onClose}>
    <X />
  </button>
</div>

// Suporte para tecla ESC
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, [isOpen, onClose]);

// Prevenir scroll do body quando overlay aberto
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
  return () => {
    document.body.style.overflow = '';
  };
}, [isOpen]);
```

### 2. Admin Dashboard

```typescript
// Navegação por teclado
<button
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleAction();
    }
  }}
>
  Ação
</button>

// Labels para inputs
<label htmlFor="email" className="block text-sm font-medium">
  Email
</label>
<input
  id="email"
  type="email"
  aria-required="true"
  aria-invalid={error ? 'true' : 'false'}
/>

// Mensagens de erro associadas
{error && (
  <div role="alert" aria-live="polite">
    {error}
  </div>
)}
```

### 3. Contraste e Tamanhos

```css
/* Garantir contraste mínimo WCAG AA (4.5:1) */
--color-ink: #0f172a;           /* Contraste 15.8:1 com branco */
--color-ink-secondary: #475569;  /* Contraste 7.5:1 com branco */

/* Tamanhos mínimos de toque (48x48px) */
.emoji-button {
  min-width: 48px;
  min-height: 48px;
  padding: 12px;
}
```

### 4. Estados de Foco Visíveis

```css
/* Indicadores de foco claros */
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

input:focus {
  outline: none;
  ring: 2px solid var(--color-primary);
}
```


## Security Considerations

### 1. Row Level Security (RLS)

```sql
-- Garantir que apenas usuários autenticados podem ler dados
CREATE POLICY "Allow authenticated select on feedbacks"
ON feedbacks FOR SELECT TO authenticated USING (true);

-- Permitir inserção pública para analytics e feedback
CREATE POLICY "Allow public insert on feedbacks"
ON feedbacks FOR INSERT TO anon WITH CHECK (true);

-- Prevenir updates e deletes não autorizados
-- (Não criar políticas para UPDATE/DELETE = negar por padrão)
```

### 2. Input Validation

```typescript
// Validar ticket_id
function isValidTicketId(ticketId: any): ticketId is number {
  return typeof ticketId === 'number' && 
         !isNaN(ticketId) && 
         ticketId > 0 &&
         Number.isInteger(ticketId);
}

// Validar tipo_evento
const VALID_TIPO_EVENTO = ['analytics', 'feedback'] as const;
type TipoEvento = typeof VALID_TIPO_EVENTO[number];

function isValidTipoEvento(value: any): value is TipoEvento {
  return VALID_TIPO_EVENTO.includes(value);
}

// Validar evento
const VALID_EVENTOS = [
  'visualizacao',
  'pdf_download',
  'whatsapp_share',
  'emoji_rating'
] as const;

function isValidEvento(value: any): value is typeof VALID_EVENTOS[number] {
  return VALID_EVENTOS.includes(value);
}

// Validar emoji
const VALID_EMOJIS = ['😡', '😕', '😐', '🙂', '😄'] as const;
type EmojiRating = typeof VALID_EMOJIS[number];

function isValidEmoji(value: any): value is EmojiRating {
  return VALID_EMOJIS.includes(value);
}
```

### 3. Authentication Protection

```typescript
// Middleware para proteger rotas admin
async function requireAuth(navigate: NavigateFunction) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    navigate('/admin/login');
    return false;
  }
  
  return true;
}

// Usar em componentes admin
useEffect(() => {
  requireAuth(navigate);
}, [navigate]);
```

### 4. Rate Limiting (Futuro)

```typescript
// Implementar rate limiting no lado do cliente para prevenir spam
const rateLimiter = new Map<string, number>();

function canTrackEvent(eventKey: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const lastTracked = rateLimiter.get(eventKey) || 0;
  
  if (now - lastTracked < 60000 / maxPerMinute) {
    console.warn('Rate limit excedido para evento:', eventKey);
    return false;
  }
  
  rateLimiter.set(eventKey, now);
  return true;
}
```

### 5. XSS Prevention

```typescript
// React já previne XSS por padrão, mas garantir:
// 1. Nunca usar dangerouslySetInnerHTML com dados do usuário
// 2. Sanitizar dados antes de exibir (se necessário)
import DOMPurify from 'dompurify';

function sanitizeUserInput(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}
```


## Testing Strategy

### 1. Unit Tests

**Analytics Tracker:**
```typescript
describe('useAnalyticsTracker', () => {
  it('should track visualizacao event with correct data', async () => {
    const { result } = renderHook(() => useAnalyticsTracker());
    await act(async () => {
      await result.current.trackVisualizacao(123);
    });
    
    expect(supabase.from).toHaveBeenCalledWith('feedbacks');
    expect(mockInsert).toHaveBeenCalledWith({
      ticket_id: 123,
      tipo_evento: 'analytics',
      evento: 'visualizacao',
      valor: null
    });
  });

  it('should debounce visualizacao events', async () => {
    const { result } = renderHook(() => useAnalyticsTracker());
    
    act(() => {
      result.current.trackVisualizacao(123);
      result.current.trackVisualizacao(123);
      result.current.trackVisualizacao(123);
    });
    
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle errors gracefully', async () => {
    mockInsert.mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const { result } = renderHook(() => useAnalyticsTracker());
    await act(async () => {
      await result.current.trackPDFDownload(123);
    });
    
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
```

**Feedback Overlay:**
```typescript
describe('FeedbackOverlay', () => {
  it('should render 5 emoji options', () => {
    render(<FeedbackOverlay isOpen={true} onClose={jest.fn()} onSubmit={jest.fn()} ticketId={123} />);
    
    expect(screen.getByLabelText('Muito Insatisfeito')).toBeInTheDocument();
    expect(screen.getByLabelText('Insatisfeito')).toBeInTheDocument();
    expect(screen.getByLabelText('Neutro')).toBeInTheDocument();
    expect(screen.getByLabelText('Satisfeito')).toBeInTheDocument();
    expect(screen.getByLabelText('Muito Satisfeito')).toBeInTheDocument();
  });

  it('should call onSubmit when emoji is clicked', () => {
    const onSubmit = jest.fn();
    render(<FeedbackOverlay isOpen={true} onClose={jest.fn()} onSubmit={onSubmit} ticketId={123} />);
    
    fireEvent.click(screen.getByLabelText('Muito Satisfeito'));
    
    expect(onSubmit).toHaveBeenCalledWith('😄');
  });

  it('should close on ESC key', () => {
    const onClose = jest.fn();
    render(<FeedbackOverlay isOpen={true} onClose={onClose} onSubmit={jest.fn()} ticketId={123} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    
    expect(onClose).toHaveBeenCalled();
  });

  it('should have minimum touch target size of 48px', () => {
    render(<FeedbackOverlay isOpen={true} onClose={jest.fn()} onSubmit={jest.fn()} ticketId={123} />);
    
    const emojiButtons = screen.getAllByRole('button').filter(btn => 
      btn.getAttribute('aria-label')?.includes('Satisfeito')
    );
    
    emojiButtons.forEach(button => {
      const styles = window.getComputedStyle(button);
      expect(parseInt(styles.minWidth)).toBeGreaterThanOrEqual(48);
      expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(48);
    });
  });
});
```

**Feedback Trigger:**
```typescript
describe('FeedbackTrigger', () => {
  it('should show overlay after 2 seconds when ticket expires', async () => {
    const { rerender } = render(
      <FeedbackTrigger ticketId={123} ticketStatus="aguardando" carrinhoSize={0} />
    );
    
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    
    rerender(<FeedbackTrigger ticketId={123} ticketStatus="expirado" carrinhoSize={0} />);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }, { timeout: 2500 });
  });

  it('should show overlay after 3 seconds when first item added', async () => {
    const { rerender } = render(
      <FeedbackTrigger ticketId={123} ticketStatus="aguardando" carrinhoSize={0} />
    );
    
    rerender(<FeedbackTrigger ticketId={123} ticketStatus="aguardando" carrinhoSize={1} />);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }, { timeout: 3500 });
  });

  it('should not show overlay twice for same trigger', async () => {
    const { rerender } = render(
      <FeedbackTrigger ticketId={123} ticketStatus="aguardando" carrinhoSize={0} />
    );
    
    rerender(<FeedbackTrigger ticketId={123} ticketStatus="expirado" carrinhoSize={0} />);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }, { timeout: 2500 });
    
    fireEvent.click(screen.getByLabelText('Fechar feedback'));
    
    rerender(<FeedbackTrigger ticketId={123} ticketStatus="aguardando" carrinhoSize={0} />);
    rerender(<FeedbackTrigger ticketId={123} ticketStatus="expirado" carrinhoSize={0} />);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }, { timeout: 2500 });
  });
});
```


### 2. Integration Tests

**Admin Dashboard:**
```typescript
describe('DashboardPage Integration', () => {
  it('should redirect to login if not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    
    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
    });
  });

  it('should fetch and display metrics', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockSelect.mockResolvedValueOnce({
      data: [
        { tipo_evento: 'analytics', evento: 'visualizacao', created_at: new Date().toISOString() },
        { tipo_evento: 'analytics', evento: 'pdf_download', created_at: new Date().toISOString() },
        { tipo_evento: 'feedback', evento: 'emoji_rating', valor: '😄', created_at: new Date().toISOString() }
      ],
      error: null
    });
    
    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument(); // Visualizações
      expect(screen.getByText('1')).toBeInTheDocument(); // PDFs
      expect(screen.getByText('1')).toBeInTheDocument(); // Feedbacks
    });
  });

  it('should display error message on fetch failure', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockSelect.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' }
    });
    
    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/Erro ao buscar dados/i)).toBeInTheDocument();
    });
  });

  it('should auto-refresh data every 30 seconds', async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockSelect.mockResolvedValue({ data: [], error: null });
    
    render(<DashboardPage />);
    
    expect(mockSelect).toHaveBeenCalledTimes(1);
    
    jest.advanceTimersByTime(30000);
    
    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });
    
    jest.useRealTimers();
  });
});

describe('LoginPage Integration', () => {
  it('should authenticate user with valid credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { user: {}, access_token: 'token' } },
      error: null
    });
    
    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Entrar'));
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });
  });

  it('should display error with invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid credentials' }
    });
    
    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'wrong@test.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Entrar'));
    
    await waitFor(() => {
      expect(screen.getByText(/Credenciais inválidas/i)).toBeInTheDocument();
    });
  });
});
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

Após análise do prework, identificamos as seguintes propriedades testáveis. Realizamos uma reflexão para eliminar redundâncias:

**Propriedades Identificadas:**
1. Registro de eventos analytics (visualização, PDF, WhatsApp) com ticket_id correto
2. Registro de feedback com emoji correto
3. Fechamento automático do overlay após seleção de emoji
4. Unicidade de exibição do overlay por trigger por sessão
5. Autenticação obrigatória para acesso ao painel admin
6. Validação de credenciais (válidas → sucesso, inválidas → erro)
7. Verificação de sessão em cada carregamento de página admin
8. Filtros de período retornam dados corretos
9. Tratamento de erros sem interrupção da UX
10. Validação de dados antes de inserção

**Redundâncias Identificadas:**
- Propriedades 1 e 10 podem ser combinadas: validação + registro correto
- Propriedades 6 e 7 podem ser combinadas: autenticação e verificação de sessão
- Propriedade 9 é uma meta-propriedade que se aplica a todas as operações

**Propriedades Finais (após eliminação de redundâncias):**


### Property 1: Event Registration Completeness

*For any* valid analytics event (visualização, pdf_download, whatsapp_share) with a valid ticket_id, the system SHALL successfully register the event in the feedbacks table with tipo_evento='analytics', the correct evento value, valor=null, and the provided ticket_id.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 2: Feedback Registration Completeness

*For any* valid emoji rating (😡, 😕, 😐, 🙂, 😄) with a valid ticket_id, when a user selects the emoji, the system SHALL register the feedback in the feedbacks table with tipo_evento='feedback', evento='emoji_rating', the emoji in the valor field, and the provided ticket_id.

**Validates: Requirements 3.3**

### Property 3: Overlay Closure After Emoji Selection

*For any* valid emoji selection in the FeedbackOverlay, the overlay SHALL close automatically after the emoji is clicked, regardless of whether the backend registration succeeds or fails.

**Validates: Requirements 3.4**

### Property 4: Feedback Trigger Uniqueness

*For any* feedback trigger type (expirado, primeiro_item), the FeedbackOverlay SHALL be displayed at most once per session, even if the trigger condition occurs multiple times.

**Validates: Requirements 4.3**

### Property 5: Authentication Requirement for Admin Access

*For any* attempt to access admin routes (/admin, /admin/*), if the user does not have a valid authenticated session, the system SHALL redirect to /admin/login and prevent access to protected data.

**Validates: Requirements 5.2, 5.3, 6.7**

### Property 6: Credential Validation Correctness

*For any* login attempt with credentials, if the credentials are valid, the system SHALL create a session and redirect to /admin; if the credentials are invalid, the system SHALL display an error message and remain on the login page.

**Validates: Requirements 6.3, 6.4**

### Property 7: Period Filter Correctness

*For any* valid period filter (hoje, 7dias, 30dias) applied in the admin dashboard, all returned data SHALL have created_at timestamps within the specified period range.

**Validates: Requirements 5.6**

### Property 8: Error Resilience in Event Tracking

*For any* analytics or feedback event registration that fails due to network error, database error, or invalid data, the system SHALL log the error to the console and continue execution without interrupting the user experience.

**Validates: Requirements 2.5, 10.1, 10.2**

### Property 9: Data Validation Before Insertion

*For any* event insertion attempt, if ticket_id is invalid (null, undefined, non-integer, or ≤ 0), or if tipo_evento or evento contain values outside the allowed set, the system SHALL reject the insertion and log an error without attempting to write to the database.

**Validates: Requirements 10.3, 10.5**

### Property 10: Session Storage Persistence

*For any* feedback trigger that has been shown, the trigger identifier SHALL be stored in sessionStorage, and subsequent checks SHALL correctly identify that the trigger has already been shown, preventing duplicate displays.

**Validates: Requirements 4.4**


## Dependencies

### New Dependencies Required

```json
{
  "dependencies": {
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

### Existing Dependencies (Already Available)

- `@supabase/supabase-js`: ^2.105.4 (Cliente Supabase)
- `react`: ^19.2.6
- `react-dom`: ^19.2.6
- `react-router-dom`: ^7.15.1 (Roteamento)
- `lucide-react`: ^1.16.0 (Ícones)
- `typescript`: ~6.0.2
- `tailwindcss`: ^4.3.0

## Installation Commands

```bash
# Instalar nova dependência
npm install recharts

# Instalar dependências de teste (opcional)
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event vitest @vitest/ui
```

## Migration Steps

### Step 1: Database Setup

```bash
# Executar migration SQL no Supabase Dashboard ou via CLI
supabase migration new create_feedbacks_table

# Copiar o SQL da seção "Database Migration" para o arquivo de migration
# Executar migration
supabase db push
```

### Step 2: Create Component Structure

```bash
# Criar estrutura de pastas
mkdir -p src/components/analytics
mkdir -p src/components/feedback
mkdir -p src/components/admin

# Criar arquivos de tipos
touch src/components/analytics/types.ts
touch src/components/feedback/types.ts
touch src/components/admin/types.ts
```

### Step 3: Implement Components

1. Implementar `useAnalyticsTracker` hook
2. Implementar `FeedbackOverlay` component
3. Implementar `FeedbackTrigger` component
4. Implementar `LoginPage` component
5. Implementar `DashboardPage` component
6. Implementar `MetricsCard` component
7. Implementar `ChartsSection` component

### Step 4: Configure Routing

1. Atualizar `main.tsx` ou `App.tsx` com rotas admin
2. Configurar `BrowserRouter` se ainda não estiver configurado

### Step 5: Integrate with Existing App

1. Adicionar `useAnalyticsTracker` em `App.tsx`
2. Adicionar chamadas de tracking nas funções existentes
3. Adicionar `FeedbackTrigger` no render de `App.tsx`

### Step 6: Testing

1. Criar testes unitários para cada componente
2. Criar testes de integração para fluxos completos
3. Executar testes: `npm run test`

### Step 7: Deployment

1. Build da aplicação: `npm run build`
2. Deploy para ambiente de produção
3. Verificar que RLS está ativo no Supabase
4. Criar usuário admin no Supabase Auth


## Future Enhancements

### 1. Advanced Analytics

- **Conversion Funnel:** Rastrear jornada completa do usuário (visualização → adição ao carrinho → PDF → WhatsApp)
- **Heatmaps:** Identificar produtos mais visualizados e adicionados ao carrinho
- **Tempo de Sessão:** Medir quanto tempo os usuários passam na aplicação
- **Taxa de Abandono:** Identificar em que ponto os usuários saem sem completar ações

### 2. Enhanced Feedback

- **Feedback Textual:** Adicionar campo opcional para comentários escritos
- **Feedback por Categoria:** Permitir feedback específico sobre produtos, atendimento, interface
- **NPS (Net Promoter Score):** Implementar pergunta "Você recomendaria nosso serviço?"
- **Follow-up Automático:** Enviar email para feedbacks negativos oferecendo suporte

### 3. Admin Dashboard Improvements

- **Exportação de Dados:** Permitir download de relatórios em CSV/Excel
- **Alertas Personalizados:** Notificar admin quando métricas caem abaixo de threshold
- **Comparação de Períodos:** Comparar métricas de períodos diferentes (semana atual vs anterior)
- **Segmentação:** Filtrar dados por loja, categoria de produto, horário do dia
- **Dashboards Personalizáveis:** Permitir admin escolher quais métricas exibir

### 4. Performance Optimizations

- **Caching:** Implementar cache de dados no lado do cliente para reduzir chamadas ao Supabase
- **Aggregation Tables:** Criar tabelas agregadas no Supabase para queries mais rápidas
- **Infinite Scroll:** Implementar scroll infinito para listas longas no admin
- **Service Worker:** Adicionar service worker para funcionalidade offline

### 5. A/B Testing

- **Variações de Overlay:** Testar diferentes designs e textos do overlay de feedback
- **Timing de Triggers:** Testar diferentes delays para exibição do overlay
- **Posicionamento:** Testar diferentes posições do overlay na tela

### 6. Integration with External Services

- **Google Analytics:** Enviar eventos para GA4 para análise mais profunda
- **Slack/Discord Notifications:** Notificar equipe em tempo real sobre feedbacks negativos
- **CRM Integration:** Sincronizar feedbacks com sistema de CRM existente
- **Email Marketing:** Segmentar usuários baseado em feedback para campanhas direcionadas

### 7. Machine Learning

- **Sentiment Analysis:** Analisar comentários textuais para identificar sentimentos
- **Predictive Analytics:** Prever probabilidade de feedback negativo baseado em comportamento
- **Anomaly Detection:** Identificar padrões anormais em métricas automaticamente
- **Recommendation Engine:** Sugerir melhorias baseado em análise de dados históricos


## Monitoring and Observability

### 1. Logging Strategy

```typescript
// Structured logging para analytics
interface AnalyticsLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  ticketId: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

function logAnalyticsEvent(log: AnalyticsLog) {
  const logEntry = {
    ...log,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  console.log('[Analytics]', JSON.stringify(logEntry));
  
  // Opcional: Enviar para serviço de logging externo
  // sendToLoggingService(logEntry);
}
```

### 2. Error Tracking

```typescript
// Integração com Sentry ou similar
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
});

// Capturar erros em analytics
try {
  await trackEvent(ticketId, evento);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'analytics',
      evento,
      ticketId
    }
  });
  console.error('Erro ao registrar evento:', error);
}
```

### 3. Performance Monitoring

```typescript
// Medir performance de operações críticas
function measurePerformance(operationName: string, fn: () => Promise<void>) {
  const startTime = performance.now();
  
  return fn().finally(() => {
    const duration = performance.now() - startTime;
    console.log(`[Performance] ${operationName}: ${duration.toFixed(2)}ms`);
    
    // Alertar se operação demorar muito
    if (duration > 1000) {
      console.warn(`[Performance] ${operationName} demorou mais de 1s`);
    }
  });
}

// Uso
await measurePerformance('trackVisualizacao', () => trackVisualizacao(ticketId));
```

### 4. Health Checks

```typescript
// Verificar saúde do sistema periodicamente
async function healthCheck(): Promise<boolean> {
  try {
    // Verificar conexão com Supabase
    const { error } = await supabase.from('feedbacks').select('id').limit(1);
    
    if (error) {
      console.error('[Health Check] Supabase connection failed:', error);
      return false;
    }
    
    // Verificar autenticação (se aplicável)
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log('[Health Check] System healthy');
    return true;
  } catch (error) {
    console.error('[Health Check] System unhealthy:', error);
    return false;
  }
}

// Executar health check a cada 5 minutos
setInterval(healthCheck, 5 * 60 * 1000);
```

### 5. Metrics Dashboard (Internal)

```typescript
// Coletar métricas internas para debugging
interface InternalMetrics {
  eventsTracked: number;
  eventsFailedToTrack: number;
  feedbacksSubmitted: number;
  feedbacksFailedToSubmit: number;
  overlayShownCount: number;
  averageResponseTime: number;
}

class MetricsCollector {
  private metrics: InternalMetrics = {
    eventsTracked: 0,
    eventsFailedToTrack: 0,
    feedbacksSubmitted: 0,
    feedbacksFailedToSubmit: 0,
    overlayShownCount: 0,
    averageResponseTime: 0
  };
  
  private responseTimes: number[] = [];
  
  incrementEventsTracked() {
    this.metrics.eventsTracked++;
  }
  
  incrementEventsFailedToTrack() {
    this.metrics.eventsFailedToTrack++;
  }
  
  recordResponseTime(time: number) {
    this.responseTimes.push(time);
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }
  
  getMetrics(): InternalMetrics {
    return { ...this.metrics };
  }
  
  reset() {
    this.metrics = {
      eventsTracked: 0,
      eventsFailedToTrack: 0,
      feedbacksSubmitted: 0,
      feedbacksFailedToSubmit: 0,
      overlayShownCount: 0,
      averageResponseTime: 0
    };
    this.responseTimes = [];
  }
}

export const metricsCollector = new MetricsCollector();

// Expor métricas no console para debugging
if (process.env.NODE_ENV === 'development') {
  (window as any).getMetrics = () => metricsCollector.getMetrics();
}
```

## Conclusion

Este design document fornece uma arquitetura completa e detalhada para o sistema de analytics e feedback do ChamaAI. A implementação seguirá os padrões estabelecidos no projeto existente, utilizando TypeScript, React, Tailwind CSS e Supabase.

O sistema é projetado para ser:
- **Não-intrusivo:** Analytics e feedback não afetam a experiência do usuário
- **Performático:** Operações assíncronas, debouncing, lazy loading
- **Seguro:** RLS no Supabase, validação de dados, autenticação obrigatória
- **Acessível:** WCAG 2.1 AA, suporte a teclado, ARIA labels
- **Testável:** Propriedades bem definidas, testes unitários e de integração
- **Escalável:** Estrutura modular, fácil de estender com novas funcionalidades

A implementação deve seguir as etapas de migração descritas, começando pela configuração do banco de dados e terminando com testes completos antes do deploy em produção.

