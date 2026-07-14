import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label above the field (required for a11y). */
  label: string;
  /** Optional helper text below the field. */
  helper?: string;
  /** Error message — replaces helper when present. */
  error?: string;
  /** Leading icon or adornment. */
  leadingIcon?: ReactNode;
  /** Trailing icon or adornment. */
  trailingIcon?: ReactNode;
  /** Visual size variant. */
  size?: 'sm' | 'md';
}

/**
 * Design system text input with label, helper/error, and optional icons.
 *
 * Never uses placeholder as the only label.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helper,
      error,
      leadingIcon,
      trailingIcon,
      size = 'md',
      className = '',
      id: externalId,
      ...rest
    },
    ref,
  ) => {
    const autoId = useId();
    const inputId = externalId ?? autoId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helper ? helperId : undefined;

    const heightClass = size === 'sm' ? 'h-9' : 'h-11';

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {/* Label */}
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-ink select-none"
        >
          {label}
        </label>

        {/* Field wrapper */}
        <div className="relative flex items-center">
          {leadingIcon && (
            <span className="absolute left-3 text-ink-variant pointer-events-none" aria-hidden="true">
              {leadingIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            className={[
              'w-full rounded-sm border bg-surface text-ink placeholder:text-outline',
              'px-sp-4 font-sans text-sm',
              'transition-colors duration-fast',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              heightClass,
              leadingIcon ? 'pl-10' : '',
              trailingIcon ? 'pr-10' : '',
              hasError
                ? 'border-error focus:ring-error'
                : 'border-outline-variant focus:ring-primary focus:border-primary',
            ]
              .filter(Boolean)
              .join(' ')}
            {...rest}
          />

          {trailingIcon && (
            <span className="absolute right-3 text-ink-variant pointer-events-none" aria-hidden="true">
              {trailingIcon}
            </span>
          )}
        </div>

        {/* Helper or error */}
        {hasError ? (
          <p id={errorId} className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        ) : helper ? (
          <p id={helperId} className="text-xs text-ink-variant">
            {helper}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
