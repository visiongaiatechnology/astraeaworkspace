/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vgt: {
          bg: 'var(--as-bg-environment, #07080d)',
          surface: 'var(--as-bg-workbench, #0b0d14)',
          surfaceRaised: 'var(--as-bg-floating, #090b12)',
          border: 'var(--as-border-control, rgb(169 178 200 / 20%))',
          card: 'var(--as-bg-control, #131724)',
          accent: 'var(--as-accent, #8b63ff)',
          accentHover: 'var(--as-bg-control-hover, #151927)',
          accentActive: 'var(--as-bg-control-active, #171b2a)',
          accentGlow: 'var(--as-accent-soft, rgb(139 99 255 / 12%))',
          success: 'var(--as-success, #4bc98b)',
          warning: 'var(--as-warning, #f0ba58)',
          danger: 'var(--as-critical, #ff625f)',
          info: 'var(--as-info, #68baf2)',
          writer: 'oklch(0.60 0.18 250)',
          grid: 'oklch(0.60 0.18 150)',
          present: 'oklch(0.65 0.18 50)',
          pdf: 'oklch(0.60 0.22 25)',
          database: 'oklch(0.60 0.20 300)',
        }
      },
      borderRadius: {
        'vgt-control': 'var(--as-radius-control, 5px)',
        'vgt-input': 'var(--as-radius-control, 5px)',
        'vgt-panel': 'var(--as-radius-panel, 9px)',
        'vgt-dialog': 'var(--as-radius-modal, 14px)',
      },
      fontFamily: {
        sans: ['"VGT Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans"', '"Liberation Sans"', 'sans-serif'],
        mono: ['"VGT Mono"', 'ui-monospace', '"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        'vgt-caption': ['11px', { lineHeight: '14px' }],
        'vgt-body': ['14px', { lineHeight: '20px' }],
        'vgt-h3': ['16px', { lineHeight: '22px' }],
        'vgt-h2': ['20px', { lineHeight: '26px' }],
        'vgt-h1': ['28px', { lineHeight: '34px' }],
        'vgt-display': ['36px', { lineHeight: '44px' }],
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        'vgt-raised': 'var(--as-shadow-z2, 0 3px 9px rgb(2 4 10 / 22%))',
        'vgt-overlay': 'var(--as-shadow-z3, 0 16px 38px rgb(2 4 10 / 34%))',
      },
    },
  },
  plugins: [],
}
