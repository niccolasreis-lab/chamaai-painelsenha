import { type ReactNode, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the user requests close (Esc, overlay click, close button). */
  onClose: () => void;
  /** Dialog title — rendered as h2 inside the panel. */
  title?: string;
  /** Dialog body. */
  children: ReactNode;
  /** Footer actions (e.g., confirm/cancel buttons). */
  footer?: ReactNode;
  /** Maximum width class. Defaults to max-w-lg. */
  maxWidth?: string;
}

/**
 * Design system modal dialog.
 *
 * - Uses native <dialog> element for proper focus management.
 * - Closes on Escape and overlay click.
 * - Entrance: fade + scale(0.95→1), duration-slow.
 * - Always has an escape route (close button + Esc).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={[
        /* Backdrop */
        'backdrop:bg-ink/50 backdrop:backdrop-blur-sm',
        /* Panel */
        'bg-surface rounded-lg shadow-lg p-0 m-auto',
        'w-[calc(100%-2rem)]',
        maxWidth,
        /* Animation */
        'opacity-0 scale-95',
        'open:opacity-100 open:scale-100',
        'transition-all duration-slow ease-out',
        /* Remove default <dialog> styling */
        'border-none outline-none',
      ].join(' ')}
      aria-labelledby={title ? 'dialog-title' : undefined}
    >
      {/* Close button */}
      <div className="flex items-center justify-between px-sp-6 pt-sp-6 pb-sp-3">
        {title ? (
          <h2
            id="dialog-title"
            className="text-lg font-semibold text-ink"
          >
            {title}
          </h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-sm text-ink-variant hover:bg-surface-container-low transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-sp-6 pb-sp-4">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="flex items-center justify-end gap-sp-3 px-sp-6 pb-sp-6 pt-sp-2">
          {footer}
        </div>
      )}
    </dialog>
  );
}
