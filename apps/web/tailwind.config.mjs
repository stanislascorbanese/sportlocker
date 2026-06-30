/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0D1B2A',
          800: '#1A2E42',
          700: '#243447',
        },
        brand: {
          400: '#2BC295',
          500: '#1D9E75',
          600: '#15785A',
          700: '#0F6E56',
        },
        accent: {
          500: '#1D9E75',
          600: '#15785A',
          700: '#0F6E56',
        },
        ink: '#1C2833',
        muted: '#5E7080',
        off: '#F2F5F8',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        'display-xl': ['clamp(2.4rem, 5vw, 4.2rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(1.8rem, 3vw, 2.8rem)', { lineHeight: '1.12', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(1.5rem, 2.4vw, 2rem)', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      maxWidth: {
        container: '1160px',
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(ellipse 80% 60% at 60% 40%, rgba(29,158,117,.14) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(43,194,149,.06) 0%, transparent 60%)',
        'cta-gradient':
          'linear-gradient(135deg, #0F6E56 0%, #15785A 50%, #1D9E75 100%)',
      },
    },
  },
  plugins: [],
}
