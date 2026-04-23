import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    borderRadius: { DEFAULT: '0', none: '0' },
    extend: {
      colors: {
        bg:            'var(--0)',
        surface:       'var(--1)',
        border:        'var(--2)',
        muted:         'var(--3)',
        fg:            'var(--fg)',
        hi:            'var(--hi)',
        hover:         'var(--hover)',
        'sel-bg':      'var(--sel-bg)',
        'sel-border':  'var(--sel-border)',
        'accent-amber':  '#b8872e',
        'accent-teal':   '#2e7f92',
        'accent-green':  '#4d8a32',
        'accent-purple': '#8b4fa0',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['Xray Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['10px', { lineHeight: '1.2' }],
        sm: ['12px', { lineHeight: '1.2' }],
        md: ['13px', { lineHeight: '1.2' }],
        lg: ['16px', { lineHeight: '1.4' }],
      },
      letterSpacing: { caps: '0.06em' },
      boxShadow: { none: 'none' },
      transitionDuration: { DEFAULT: '180ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
