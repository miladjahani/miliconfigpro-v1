/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd6ff',
          300: '#8ebbff',
          400: '#5b95ff',
          500: '#3b6ef5',
          600: '#2551e0',
          700: '#1e40af',
          800: '#1e3799',
          900: '#172554',
        },
        error: {
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
        },
        warning: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 18px rgba(59, 110, 245, 0.35)' },
          '50%': { boxShadow: '0 0 34px rgba(59, 110, 245, 0.65)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'slide-up': 'slide-up 0.4s ease-out both',
        'slide-in': 'slide-in 0.3s ease-out both',
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
