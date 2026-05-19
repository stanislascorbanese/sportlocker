#!/usr/bin/env node
/**
 * Génère openapi.json à la racine du repo (pour SDK clients TypeScript futurs).
 *
 * Stratégie : on instancie buildApp() avec des secrets factices (le fichier
 * env.ts impose des minimums sur les JWT_*_SECRET), on appelle app.ready()
 * pour finaliser l'enregistrement Fastify Swagger, puis on dump la spec via
 * app.swagger() — qui renvoie l'OpenAPI 3 sérialisable.
 *
 * Aucune connexion DB / Redis n'est ouverte tant qu'on n'envoie pas de requête.
 *
 * Usage :
 *   pnpm --filter @sportlocker/api gen:openapi
 *   → écrit openapi.json à la racine du repo (3 niveaux au-dessus de scripts/).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..')

// Active le loader tsx pour pouvoir importer src/app.ts directement (TypeScript ESM).
register('tsx/esm', import.meta.url)

// Secrets dummy : JWT_SESSION_SECRET et JWT_DEVICE_SECRET exigent ≥32 caractères
// (cf. services/api/src/config/env.ts). On utilise des chaînes longues prévisibles
// pour rester reproductible — elles ne servent à rien hors de cette exécution.
process.env.NODE_ENV ??= 'development'
process.env.DATABASE_URL ??= 'postgres://gen:gen@localhost:5432/gen'
process.env.REDIS_URL ??= 'redis://localhost:6379'
process.env.JWT_SESSION_SECRET ??= 'gen_openapi_dummy_session_secret_32_chars_min'
process.env.JWT_DEVICE_SECRET ??= 'gen_openapi_dummy_device_secret_32_chars_min'

const { buildApp } = await import('../src/app.ts')

const app = await buildApp()
await app.ready()

const spec = app.swagger()
const outPath = join(REPO_ROOT, 'openapi.json')

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n', 'utf8')

const routeCount = Object.keys(spec.paths ?? {}).reduce((acc, path) => {
  const ops = spec.paths[path] ?? {}
  return acc + Object.keys(ops).filter((m) => ['get','post','put','patch','delete'].includes(m)).length
}, 0)

console.log(`[gen-openapi] wrote ${outPath} (${routeCount} routes)`)

await app.close()
process.exit(0)
