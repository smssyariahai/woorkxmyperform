/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EAF5FF',
          100: '#D6EBFF',
          DEFAULT: '#087BFF',
          500: '#087BFF',
          600: '#0670E8',
          700: '#0559B8',
          900: '#0F2A4A',
        },
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        canvas: 'rgb(var(--canvas-rgb) / <alpha-value>)',
        wa: '#22C55E',
        warn: '#F59E0B',
        danger: '#EF4444',
      },
      borderRadius: {
        card: '14px',
        input: '10px',
        btn: '9px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,42,74,.05), 0 4px 16px rgba(15,42,74,.06)',
        pop: '0 8px 32px rgba(15,42,74,.14)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
