import type { ReactNode } from 'react';
import { Loader2, Inbox, AlertTriangle, WifiOff } from 'lucide-react';

export type StatusVariant = 'loading' | 'empty' | 'error' | 'offline';

export interface StatusBadgeProps {
  /** Which status to display. */
  variant: StatusVariant;
  /** Main message. Defaults vary by variant. */
  message?: string;
  /** Optional helper / detail text. */
  detail?: string;
  /** Optional action (e.g., retry button). */
  action?: ReactNode;
  /** Additional className. */
  className?: string;
}

const defaults: Record<StatusVariant, { icon: ReactNode; message: string }> = {
  loading: {
    icon: <Loader2 className="h-8 w-8 text-primary animate-spin" />,
    message: 'Carregando…',
  },
  empty: {
    icon: <Inbox className="h-8 w-8 text-ink-variant" />,
    message: 'Nenhum item encontrado',
  },
  error: {
    icon: <AlertTriangle className="h-8 w-8 text-error" />,
    message: 'Ocorreu um erro',
  },
  offline: {
    icon: <WifiOff className="h-8 w-8 text-warning" />,
    message: 'Sem conexão',
  },
};

/**
 * Feedback placeholder for async states: loading, empty, error, offline.
 * Replaces ad-hoc spinners and empty messages across the app.
 */
export function StatusBadge({
  variant,
  message,
  detail,
  action,
  className = '',
}: StatusBadgeProps) {
  const d = defaults[variant];

  return (
    <div
      className={`flex flex-col items-center justify-center gap-sp-3 py-sp-12 text-center ${className}`}
      role="status"
      aria-live={variant === 'loading' ? 'polite' : undefined}
    >
      <span aria-hidden="true">{d.icon}</span>
      <p className="text-sm font-medium text-ink">{message ?? d.message}</p>
      {detail && (
        <p className="text-xs text-ink-variant max-w-xs">{detail}</p>
      )}
      {action && <div className="mt-sp-2">{action}</div>}
    </div>
  );
}
