import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  /** Duration in ms. 0 = persistent (must dismiss manually). */
  duration?: number;
  /** Optional action button. */
  action?: { label: string; onClick: () => void };
}

/* ── Toast Item ──────────────────────────────────────────────── */

const variantConfig: Record<
  ToastVariant,
  { icon: ReactNode; bg: string; border: string; text: string }
> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-success-ink" />,
    bg: 'bg-success-container',
    border: 'border-success/20',
    text: 'text-success-ink',
  },
  error: {
    icon: <AlertOctagon className="h-5 w-5 text-error-ink" />,
    bg: 'bg-error-container',
    border: 'border-error/20',
    text: 'text-error-ink',
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-warning-ink" />,
    bg: 'bg-warning-container',
    border: 'border-warning/20',
    text: 'text-warning-ink',
  },
  info: {
    icon: <Info className="h-5 w-5 text-primary" />,
    bg: 'bg-surface-container-low',
    border: 'border-primary/20',
    text: 'text-ink',
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const cfg = variantConfig[toast.variant];
  const autoDuration = toast.duration ?? 5000;

  useEffect(() => {
    if (autoDuration <= 0) return;
    const timer = setTimeout(() => setExiting(true), autoDuration);
    return () => clearTimeout(timer);
  }, [autoDuration]);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => onDismiss(toast.id), 200);
    return () => clearTimeout(timer);
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-sp-3 px-sp-4 py-sp-3 rounded-md border shadow-md',
        'transition-all duration-normal',
        cfg.bg,
        cfg.border,
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0',
      ].join(' ')}
    >
      <span className="shrink-0 mt-0.5" aria-hidden="true">
        {cfg.icon}
      </span>
      <p className={`flex-1 text-sm ${cfg.text}`}>{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="text-sm font-medium text-primary hover:underline shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => setExiting(true)}
        className="shrink-0 p-0.5 rounded-sm text-ink-variant hover:text-ink transition-colors duration-fast"
        aria-label="Dispensar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Toast Container ─────────────────────────────────────────── */

export interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  /**
   * Position on screen.
   * 'top-right' — admin.
   * 'bottom-center' — operador/totem.
   */
  position?: 'top-right' | 'bottom-center';
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
} as const;

/**
 * Renders toasts in a fixed portal.
 *
 * Usage:
 * ```tsx
 * const [toasts, setToasts] = useState<ToastData[]>([]);
 * const dismiss = (id: string) => setToasts(t => t.filter(x => x.id !== id));
 * <ToastContainer toasts={toasts} onDismiss={dismiss} />
 * ```
 */
export function ToastContainer({
  toasts,
  onDismiss,
  position = 'top-right',
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className={`fixed z-toast flex flex-col gap-sp-2 w-full max-w-sm pointer-events-none ${positionClasses[position]}`}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ── Hook ─────────────────────────────────────────────────────── */

let _counter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const show = useCallback(
    (variant: ToastVariant, message: string, options?: Partial<ToastData>) => {
      const id = `toast-${++_counter}`;
      setToasts((prev) => [...prev, { id, variant, message, ...options }]);
      return id;
    },
    [],
  );

  return { toasts, show, dismiss } as const;
}
