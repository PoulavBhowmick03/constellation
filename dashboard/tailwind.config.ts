import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        syne: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        sans: ['system-ui', 'sans-serif'],
      },
      colors: {
        lf: {
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          ink: '#0A0A0B',
          muted: '#71717A',
          accent: '#00B37E',
          'accent-hover': '#009E6E',
          'accent-muted': '#DCFCE7',
          border: '#E4E4E7',
          'border-strong': '#A1A1AA',
          amber: '#D97706',
          'amber-bg': '#FFFBEB',
          pro: '#7C3AED',
          'pro-bg': '#F5F3FF',
          basic: '#2563EB',
          'basic-bg': '#EFF6FF',
          free: '#71717A',
          'free-bg': '#F4F4F5',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
