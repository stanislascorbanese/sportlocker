import preset from '@sportlocker/config/tailwind/preset'

/**
 * La vitrine hérite du preset partagé (packages/config/tailwind). Elle n'ajoute
 * que la liste de fichiers à scanner : couleurs, typographies et animations
 * viennent désormais de la même source que le dashboard et l'app vacancier.
 */
/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
}
