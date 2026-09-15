/// <reference types="astro/client" />

/**
 * Le preset Tailwind partagé est un module CommonJS sans typage : on le déclare
 * ici plutôt que de laisser `astro check` remonter un implicit any sur chaque
 * build.
 */
declare module '@sportlocker/config/tailwind/preset' {
  import type { Config } from 'tailwindcss'
  const preset: Partial<Config>
  export default preset
}
