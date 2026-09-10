import type { Config } from 'tailwindcss'
import preset from '@sportlocker/config/tailwind/preset'

/**
 * Le dashboard hérite du preset partagé (packages/config/tailwind). Il garde
 * ses palettes historiques `navy` et `emerald` pour les composants existants ;
 * la nouveauté est que `brand` désigne désormais le vert de la marque et non
 * plus le bleu — les trois applications parlent enfin de la même couleur.
 */
const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx}'],
}
export default config
