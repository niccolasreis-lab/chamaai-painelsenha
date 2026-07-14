/**
 * ChamaAí Design System — TypeScript Tokens
 *
 * Mirrors the CSS custom properties defined in index.css.
 * Use these constants when you need token values in JS/TS
 * (e.g., inline styles, dynamic calculations, canvas rendering).
 *
 * Source of truth: docs/ui-ux/design-system.md
 */

/* ── Colors ───────────────────────────────────────────────────── */

export const colors = {
  primary: '#3525CD',
  primaryRgb: '53, 37, 205',
  onPrimary: '#ffffff',
  primaryContainer: '#4f46e5',
  onPrimaryContainer: '#dad7ff',
  inversePrimary: '#c3c0ff',

  secondary: '#00687A',
  secondaryRgb: '0, 104, 122',
  onSecondary: '#ffffff',
  secondaryContainer: '#57dffe',

  tertiary: '#7e3000',
  onTertiary: '#ffffff',

  surface: '#ffffff',
  surfaceContainerLow: '#f5f2ff',
  surfaceContainer: '#f0ecf9',
  surfaceContainerHigh: '#eae6f4',
  surfaceContainerHighest: '#e4e1ee',
  surfaceDim: '#dcd8e5',
  background: '#fcf8ff',

  ink: '#1B1B24',
  inkVariant: '#464555',
  inverseSurface: '#302f39',
  inverseOnSurface: '#f3effc',

  outline: '#777587',
  outlineVariant: '#c7c4d8',

  success: '#059669',
  successInk: '#047857',
  successContainer: '#ecfdf5',

  warning: '#d97706',
  warningInk: '#b45309',
  warningContainer: '#fffbeb',

  error: '#dc2626',
  errorInk: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
} as const;

/* ── Spacing ──────────────────────────────────────────────────── */

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

/* ── Radii ────────────────────────────────────────────────────── */

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
} as const;

/* ── Elevation ────────────────────────────────────────────────── */

export const shadows = {
  sm: '0 1px 2px 0 rgba(27,27,36,0.05)',
  md: '0 4px 6px -1px rgba(27,27,36,0.07), 0 2px 4px -2px rgba(27,27,36,0.05)',
  lg: '0 10px 15px -3px rgba(27,27,36,0.08), 0 4px 6px -4px rgba(27,27,36,0.04)',
} as const;

/* ── Z-Index ──────────────────────────────────────────────────── */

export const zIndex = {
  dropdown: 10,
  sticky: 20,
  backdrop: 30,
  modal: 40,
  toast: 50,
  tooltip: 60,
} as const;

/* ── Motion ───────────────────────────────────────────────────── */

export const duration = {
  fast: 150,
  normal: 200,
  slow: 250,
} as const;

export const easing = {
  out: 'cubic-bezier(0.25, 0, 0.5, 1)',
  in: 'cubic-bezier(0.5, 0, 1, 1)',
} as const;

/* ── Typography ───────────────────────────────────────────────── */

export const fontFamily = {
  body: '"DM Sans", system-ui, sans-serif',
  display: '"Syne", system-ui, sans-serif',
} as const;

export const fontSize = {
  ticketDisplay: 120,
  h1: 48,
  h2: 24,
  h3: 20,
  body: 16,
  bodySm: 14,
  label: 14,
  labelCaps: 11,
  caption: 12,
} as const;
