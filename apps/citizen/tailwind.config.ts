import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Reprend la palette dashboard pour cohérence visuelle inter-apps.
        navy: { 900: '#0D1B2A', 800: '#1A2E42', 700: '#243447' },
        brand: { 400: '#3B73F7', 500: '#0150F6', 600: '#0140CC', 700: '#0033A8' },
        accent: { 500: '#1D9E75', 600: '#15785A' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
