import type { HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width (CSS value or Tailwind class). Defaults to full width. */
  width?: string;
  /** Height (CSS value or Tailwind class). Defaults to 16px. */
  height?: string;
  /** Whether to use circular shape. */
  circle?: boolean;
}

/**
 * Skeleton loading placeholder.
 *
 * Uses a subtle pulse animation that respects prefers-reduced-motion
 * (the global CSS rule disables animation automatically).
 *
 * ```tsx
 * <Skeleton className="h-4 w-32" />
 * <Skeleton circle width="40px" height="40px" />
 * ```
 */
export function Skeleton({
  width,
  height,
  circle = false,
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={[
        'animate-pulse bg-surface-container-high',
        circle ? 'rounded-full' : 'rounded-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: width ?? '100%',
        height: height ?? '16px',
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}

/* ── Preset compositions ──────────────────────────────────────── */

/** Skeleton mimicking a text line (body size). */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-sp-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height="14px"
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

/** Skeleton mimicking a card layout. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`border border-outline-variant rounded-md p-sp-4 space-y-sp-3 ${className}`}
      aria-hidden="true"
    >
      <Skeleton height="20px" width="40%" />
      <SkeletonText lines={2} />
      <div className="flex gap-sp-2">
        <Skeleton height="36px" width="80px" />
        <Skeleton height="36px" width="80px" />
      </div>
    </div>
  );
}
