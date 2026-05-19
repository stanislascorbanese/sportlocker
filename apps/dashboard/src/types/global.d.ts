/**
 * Déclarations de modules globales pour le dashboard Next.js.
 *
 * POURQUOI CE FICHIER ?
 *   Next 14 référence `next/image-types/global` via `next-env.d.ts`, qui est
 *   *censé* déclarer les modules CSS pour autoriser `import './foo.css'`.
 *   Dans notre config (Next 14 + tsconfig moduleResolution: Bundler), ces
 *   types CSS ne sont pas exposés et `tsc --noEmit` plante avec :
 *     TS2882 — Cannot find module or type declarations for side-effect import of './globals.css'.
 *
 *   Déclarer `*.css` comme module side-effect-only règle le typecheck sans
 *   impacter le runtime (Next gère les imports CSS via PostCSS/Tailwind).
 */

declare module '*.css'
