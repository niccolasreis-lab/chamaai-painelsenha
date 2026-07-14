/**
 * ChamaAí Design System — Component Barrel Export
 *
 * Import components from this file:
 *   import { Button, Input, Card, Dialog, Toast, StatusBadge, Skeleton } from '@/shared/components';
 *
 * Or if not using path aliases:
 *   import { Button } from '../shared/components';
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';

export { ToastContainer, useToast } from './Toast';
export type { ToastData, ToastVariant, ToastContainerProps } from './Toast';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusVariant } from './StatusBadge';

export { Skeleton, SkeletonText, SkeletonCard } from './Skeleton';
export type { SkeletonProps } from './Skeleton';
