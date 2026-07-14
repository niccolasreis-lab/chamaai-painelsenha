import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:brightness-90 active:brightness-85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  secondary:
    'border border-primary text-primary bg-transparent hover:bg-surface-container-low active:bg-surface-container active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  ghost:
    'text-ink-variant bg-transparent hover:bg-surface-container-low active:bg-surface-container active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-outline focus-visible:ring-offset-2',
  danger:
    'bg-error text-white hover:brightness-90 active:brightness-85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-sm',
  md: 'h-11 px-4 text-sm gap-2 rounded-sm min-w-[44px]',
  lg: 'h-12 px-6 text-base gap-2 rounded-sm min-w-[48px] min-h-[48px]',
};

/**
 * Design system button with variant, size, loading state, and optional leading icon.
 *
 * Touch targets: `md` ≥ 44px, `lg` ≥ 48px (totem/touch).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium select-none',
          'transition-all duration-fast',
          'disabled:opacity-50 disabled:pointer-events-none',
          'cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : icon ? (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
