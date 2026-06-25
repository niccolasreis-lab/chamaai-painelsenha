/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#f8fafc',
        surface: '#ffffff',
        'surface-variant': '#f1f5f9',
        primary: 'var(--color-primary, #2563eb)',
        'primary-hover': 'var(--color-primary-hover, #1d4ed8)',
        'on-primary': 'var(--color-on-primary, #ffffff)',
        ink: '#0f172a',
        'ink-secondary': '#475569',
        success: '#059669',
        warning: '#d97706',
        error: '#dc2626',
        'outline-variant': '#cbd5e1'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        syne: ['Syne', 'sans-serif'],
        dmsans: ['DM Sans', 'sans-serif']
      },
      animation: {
        'pulse-call': 'pulse-call 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out'
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
        }
      }
    },
  },
  plugins: [],
}
