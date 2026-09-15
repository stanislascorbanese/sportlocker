/**
 * Preset Tailwind partagé par la vitrine, l'app vacancier et le dashboard.
 *
 * Avant septembre 2026, les trois applications avaient chacune leur config et
 * deux définitions contradictoires de `brand` : vert #1D9E75 sur la vitrine,
 * bleu #0150F6 sur le dashboard et l'app. Une même classe `bg-brand-500` ne
 * donnait donc pas la même couleur selon l'application. Ce preset est
 * désormais la seule source de vérité ; le vert l'emporte, c'est la couleur
 * du logo.
 *
 * Les couleurs sémantiques (`surface`, `ink`, `line`, `brand`…) viennent des
 * variables CSS de `tokens.css` : elles basculent clair/sombre sans que le
 * composant ait à écrire un seul `dark:`.
 */

/** Couleur pilotée par une variable CSS, compatible avec l'opacité Tailwind. */
const token = (name) => `rgb(var(--sl-${name}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
        },
        line: token('line'),
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
        },
        brand: {
          DEFAULT: token('brand'),
          strong: token('brand-strong'),
          soft: token('brand-soft'),
          on: token('on-brand'),
          // Paliers fixes conservés pour les composants existants.
          400: '#2BC295',
          500: '#1D9E75',
          600: '#15785A',
          700: '#0F6E56',
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
        },
        warn: {
          DEFAULT: token('warn'),
          soft: token('warn-soft'),
        },

        // ─── Palettes héritées ────────────────────────────────────────────
        // Le dashboard et la vitrine s'appuient sur ces échelles numériques
        // depuis mai 2026 (`bg-navy-800`, `text-brand-400`…). Elles restent
        // définies ici pour que le passage au preset ne demande pas de
        // réécrire des milliers de classes.
        //
        // Le changement de fond : `brand` était bleu (#0150F6) côté dashboard
        // et vert (#1D9E75) côté vitrine. Une même classe ne donnait donc pas
        // la même couleur selon l'application. Le vert l'emporte — c'est la
        // couleur du logo.
        navy: {
          900: '#0D1B2A',
          800: '#1A2E42',
          700: '#243447',
          600: '#2D4358',
        },
        accent: {
          500: '#1D9E75',
          600: '#15785A',
          700: '#0F6E56',
        },
        muted: '#5E7080',
        off: '#F2F5F8',
      },
      fontFamily: {
        sans: [
          '"DM Sans"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
        display: ['Syne', '"DM Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      fontSize: {
        eyebrow: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        meta: ['0.75rem', { lineHeight: '1rem' }],
        'display-xl': ['clamp(2.4rem, 5vw, 4.2rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(1.8rem, 3vw, 2.8rem)', { lineHeight: '1.12', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(1.5rem, 2.4vw, 2rem)', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        // Chiffre de casier affiché en plein soleil, à bout de bras.
        locker: ['clamp(4rem, 22vw, 7rem)', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      spacing: {
        // Hauteur minimale d'une cible tactile utilisable avec les mains
        // mouillées, debout devant une borne. 44px est le minimum Apple ;
        // on part de 56 et on monte à 64 pour l'action principale.
        tap: '3.5rem',
        'tap-lg': '4rem',
      },
      borderRadius: {
        card: 'var(--sl-radius-card)',
        sheet: 'var(--sl-radius-sheet)',
      },
      maxWidth: {
        container: '1160px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.08)',
        elevated: '0 10px 30px -10px rgb(0 0 0 / 0.35)',
        pop: '0 4px 14px -2px rgb(29 158 117 / 0.25)',
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(ellipse 80% 60% at 60% 40%, rgba(29,158,117,.14) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(43,194,149,.06) 0%, transparent 60%)',
        'cta-gradient': 'linear-gradient(135deg, #0F6E56 0%, #15785A 50%, #1D9E75 100%)',
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
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
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
        draw: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        draw: 'draw 400ms cubic-bezier(0.65, 0, 0.45, 1) both',
      },
    },
  },
}
