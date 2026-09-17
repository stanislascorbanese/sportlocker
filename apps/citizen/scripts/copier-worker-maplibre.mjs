// Copie le worker de MapLibre dans public/maplibre/, avant `next dev` et
// `next build`.
//
// Depuis la v6, MapLibre est distribue en ESM pur et son worker est un fichier
// a part (`maplibre-gl-worker.mjs`, qui importe `maplibre-gl-shared.mjs`).
// La bibliotheque en deduit l'URL depuis `import.meta.url` — ce qui ne marche
// que si le module est servi tel quel par un CDN. Sous webpack, c'est un
// `file://` : MapLibre retombe sur `new Worker('')`, le worker charge la page
// HTML comme script, meurt sans bruit, et chaque tuile reste « en cours »
// pour toujours. Symptome : controles affiches, fond vide, aucune erreur.
//
// D'ou ces deux fichiers servis depuis /public, et `setWorkerUrl()` dans
// CarteBornes.tsx. Recette documentee par MapLibre pour Next.js.
// Le dossier cible est ignore par git : il suit la version installee.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dist = path.join(
  path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
  'dist',
)
const dest = path.join(process.cwd(), 'public', 'maplibre')

mkdirSync(dest, { recursive: true })
for (const fichier of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, fichier), path.join(dest, fichier))
}
