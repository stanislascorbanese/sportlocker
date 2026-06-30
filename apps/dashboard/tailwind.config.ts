import type { Config } from 'tailwindcss'

/**
 * Config Tailwind du dashboard ops.
 *
 * Aligné sur `apps/citizen/tailwind.config.ts` :
 *   - `darkMode: 'class'` — indispensable pour que le ThemeToggle pilote
 *     les variants `dark:` via la classe `.dark` posée sur <html> par
 *     ThemeProvider. Sans ça, Tailwind retombe sur la media query
 *     `prefers-color-scheme` et le toggle UI n'a aucun effet visible.
 *   - Tokens design system (eyebrow/meta, rounded-card/sheet, shadow-card,
 *     duration-base, ease-out-soft, animations) — utilisés par les atomes
 *     du lot C (PR #204→#210). Avant ce fix ils étaient silencieusement
 *     ignorés par Tailwind donc les styles n'étaient pas générés.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0D1B2A', 800: '#1A2E42', 700: '#243447', 600: '#2D4358' },
        // Palette historique du dashboard (bleu). Conservée pour ne pas
        // casser les composants legacy (Button, PageHeader, etc.) qui
        // l'utilisent en `bg-brand-500`. Les composants refondus du lot C
        // utilisent emerald-X pour cohérence avec la marque (cf. vitrine
        // qui a son propre `brand: #1D9E75` aligné emerald).
        brand: { 400: '#3B73F7', 500: '#0150F6', 600: '#0140CC', 700: '#0033A8' },
        accent: { 500: '#1D9E75', 600: '#15785A' },
        // alias retro-compat
        green: { 500: '#1D9E75', 600: '#15785A' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        eyebrow: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        meta: ['0.75rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        card: '1rem',
        sheet: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.08)',
        elevated: '0 10px 30px -10px rgb(0 0 0 / 0.5)',
        pop: '0 4px 14px -2px rgb(16 185 129 / 0.25)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '250ms',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.92)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
