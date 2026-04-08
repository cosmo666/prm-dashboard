/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Operations Desk palette — warm neutrals + cobalt accent
        bg: '#fafaf7',
        surface: '#ffffff',
        'surface-2': '#f5f5f4',
        border: {
          DEFAULT: '#e7e5e4',
          strong: '#d6d3d1',
        },
        ink: {
          DEFAULT: '#0c0c0c',
          muted: '#44403c',
        },
        muted: '#78716c',
        accent: {
          DEFAULT: '#1d4ed8',
          hover: '#1e40af',
          bg: '#eff6ff',
          fg: '#1e3a8a',
        },
        success: '#047857',
        warning: '#b45309',
        danger: '#b91c1c',
      },
      fontSize: {
        // Editorial scale
        'micro': ['11px', { lineHeight: '14px', letterSpacing: '0.06em' }],
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['13px', { lineHeight: '18px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'lg': ['16px', { lineHeight: '22px' }],
        'xl': ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '34px' }],
        '4xl': ['36px', { lineHeight: '42px' }],
        '5xl': ['48px', { lineHeight: '54px' }],
        'display': ['64px', { lineHeight: '68px', letterSpacing: '-0.02em' }],
      },
      boxShadow: {
        'hairline': '0 0 0 1px rgba(12, 12, 12, 0.06)',
        'card': '0 1px 2px rgba(12, 12, 12, 0.04), 0 0 0 1px rgba(12, 12, 12, 0.05)',
        'card-hover': '0 4px 12px rgba(12, 12, 12, 0.06), 0 0 0 1px rgba(12, 12, 12, 0.08)',
        'elevated': '0 8px 24px rgba(12, 12, 12, 0.08), 0 0 0 1px rgba(12, 12, 12, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 400ms ease-out forwards',
        'fade-up': 'fadeUp 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'shimmer': 'shimmer 1.6s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [],
};
