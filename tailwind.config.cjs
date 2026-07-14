/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Brand */
        primary: 'var(--primary, #3525CD)',
        'primary-container': 'var(--primary-container, #4f46e5)',
        'on-primary': 'var(--on-primary, #ffffff)',
        'on-primary-container': 'var(--on-primary-container, #dad7ff)',
        'inverse-primary': 'var(--inverse-primary, #c3c0ff)',
        secondary: 'var(--secondary, #00687A)',
        'secondary-container': 'var(--secondary-container, #57dffe)',
        'on-secondary': 'var(--on-secondary, #ffffff)',
        tertiary: 'var(--tertiary, #7e3000)',
        'on-tertiary': 'var(--on-tertiary, #ffffff)',

        /* Surfaces */
        background: 'var(--background, #fcf8ff)',
        surface: 'var(--surface, #ffffff)',
        'surface-container-low': 'var(--surface-container-low, #f5f2ff)',
        'surface-container': 'var(--surface-container, #f0ecf9)',
        'surface-container-high': 'var(--surface-container-high, #eae6f4)',
        'surface-container-highest': 'var(--surface-container-highest, #e4e1ee)',
        'surface-dim': 'var(--surface-dim, #dcd8e5)',
        'surface-variant': 'var(--surface-container, #f0ecf9)',

        /* Text */
        ink: 'var(--ink, #1B1B24)',
        'ink-variant': 'var(--ink-variant, #464555)',
        'inverse-surface': 'var(--inverse-surface, #302f39)',
        'inverse-on-surface': 'var(--inverse-on-surface, #f3effc)',

        /* Borders */
        outline: 'var(--outline, #777587)',
        'outline-variant': 'var(--outline-variant, #c7c4d8)',

        /* Semantic */
        success: 'var(--success, #059669)',
        'success-ink': 'var(--success-ink, #047857)',
        'success-container': 'var(--success-container, #ecfdf5)',
        warning: 'var(--warning, #d97706)',
        'warning-ink': 'var(--warning-ink, #b45309)',
        'warning-container': 'var(--warning-container, #fffbeb)',
        error: 'var(--error, #dc2626)',
        'error-ink': 'var(--error-ink, #ba1a1a)',
        'error-container': 'var(--error-container, #ffdad6)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        /* Legacy aliases */
        dmsans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        syne: ['"Syne"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm, 6px)',
        DEFAULT: 'var(--radius-md, 10px)',
        md: 'var(--radius-md, 10px)',
        lg: 'var(--radius-lg, 14px)',
        full: 'var(--radius-full, 9999px)',
      },
      spacing: {
        'sp-1': 'var(--sp-1, 4px)',
        'sp-2': 'var(--sp-2, 8px)',
        'sp-3': 'var(--sp-3, 12px)',
        'sp-4': 'var(--sp-4, 16px)',
        'sp-6': 'var(--sp-6, 24px)',
        'sp-8': 'var(--sp-8, 32px)',
        'sp-12': 'var(--sp-12, 48px)',
        'sp-16': 'var(--sp-16, 64px)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown, 10)',
        sticky: 'var(--z-sticky, 20)',
        backdrop: 'var(--z-backdrop, 30)',
        modal: 'var(--z-modal, 40)',
        toast: 'var(--z-toast, 50)',
        tooltip: 'var(--z-tooltip, 60)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast, 150ms)',
        normal: 'var(--duration-normal, 200ms)',
        slow: 'var(--duration-slow, 250ms)',
      },
      transitionTimingFunction: {
        'ease-out-ds': 'var(--ease-out)',
        'ease-in-ds': 'var(--ease-in)',
      },
      animation: {
        'pulse-call': 'pulse-call 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        'pulse-call': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.6' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
