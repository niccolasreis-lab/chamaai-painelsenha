import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional card header content. */
  header?: ReactNode;
  /** Optional card footer content. */
  footer?: ReactNode;
  /**
   * Elevation style: 'flat' (border only), 'raised' (shadow only).
   * Never combines border + shadow (design system rule).
   */
  elevation?: 'flat' | 'raised';
  /** Optional padding override. Defaults to sp-4 (16px). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-sp-2',
  md: 'p-sp-4',
  lg: 'p-sp-6',
} as const;

/**
 * Design system card — flat (border) or raised (shadow), never both.
 * Max border-radius: radius-md (10px). No nested cards.
 */
export function Card({
  header,
  footer,
  elevation = 'flat',
  padding = 'md',
  className = '',
  children,
  ...rest
}: CardProps) {
  const elevationClass =
    elevation === 'raised'
      ? 'shadow-md'
      : 'border border-outline-variant';

  return (
    <div
      className={[
        'bg-surface rounded-md overflow-hidden',
        elevationClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {header && (
        <div className="px-sp-4 py-sp-3 border-b border-outline-variant">
          {header}
        </div>
      )}

      <div className={paddingClasses[padding]}>
        {children}
      </div>

      {footer && (
        <div className="px-sp-4 py-sp-3 border-t border-outline-variant">
          {footer}
        </div>
      )}
    </div>
  );
}
