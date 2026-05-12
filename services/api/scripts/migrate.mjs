#!/usr/bin/env node
/**
 * Migrateur SQL lightweight, exécuté au boot du container API (cf. entrypoint.sh).
 *
 * Comportement :
 *   1. Si la table `users` n'existe pas → applique database/schema.sql (bootstrap).
 *   2. Crée si besoin la table `schema_migrations(filename, applied_at)`.
 *   3. Itère sur database/migrations/*.sql triés alphabétiquement et applique
 *      ceux qui ne sont pas encore présents dans `schema_migrations`.
 *
 * Convention : chaque migration DOIT être idempotente (CREATE/ADD ... IF NOT EXISTS,
 * ALTER TYPE ... ADD VALUE IF NOT EXISTS) afin de ne pas péter sur ré-application.
 *
 * Les migrations sont appliquées SANS wrapping transactionnel — certaines
 * commandes (ALTER TYPE ADD VALUE) ne peuvent pas vivre dans une transaction.
 * À chaque migration de fournir son propre BEGIN/COMMIT si l'atomicité est requise.
 */
import postgres from 'postgres'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Le dossier `database/` n'a pas la même position relative en prod et en dev :
 *   - Docker prod : /app/scripts/migrate.mjs  → /app/database/
 *   - Dev monorepo : services/api/scripts/    → <repo>/database/
 * On laisse aussi la possibilité de l'override via DATABASE_SQL_DIR.
 */
function resolveDbDir() {
  if (process.env.DATABASE_SQL_DIR) return resolve(process.env.DATABASE_SQL_DIR)
  for (const candidate of [
    join(HERE, '..', 'database'),         // Docker production
    join(HERE, '..', '..', '..', 'database'), // dev (services/api/scripts → repo root)
  ]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('[migrate] cannot locate database/ folder')
}

const DB_DIR = resolveDbDir()
const SCHEMA_PATH = join(DB_DIR, 'schema.sql')
const MIGRATIONS_DIR = join(DB_DIR, 'migrations')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => undefined,
  // Retry pour gérer la course au boot d'un nouveau service Railway
  // (Postgres pas toujours prêt à l'instant où l'API démarre).
  connect_timeout: 10,
})

async function tableExists(name) {
  const r = await sql`SELECT to_regclass(${name}) AS t`
  return r[0].t !== null
}

async function alreadyApplied(filename) {
  const r = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${filename}`
  return r.length > 0
}

async function recordApplied(filename) {
  await sql`
    INSERT INTO schema_migrations (filename) VALUES (${filename})
    ON CONFLICT (filename) DO NOTHING
  `
}

async function applyRaw(filename, sqlText) {
  console.log(`[migrate] applying ${filename}…`)
  await sql.unsafe(sqlText)
  await recordApplied(filename)
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

async function main() {
  const fresh = !(await tableExists('users'))

  if (fresh) {
    console.log('[migrate] empty DB detected, applying schema.sql…')
    const text = readFileSync(SCHEMA_PATH, 'utf8')
    await sql.unsafe(text)
  }

  // Table de tracking (idempotent)
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const files = listMigrationFiles()
  if (files.length === 0) {
    console.log('[migrate] no incremental migrations found')
  }

  for (const f of files) {
    if (await alreadyApplied(f)) {
      console.log(`[migrate] skip ${f} (already applied)`)
      continue
    }
    const text = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    try {
      await applyRaw(f, text)
    } catch (err) {
      console.error(`[migrate] FAILED on ${f}:`, err.message)
      throw err
    }
  }

  console.log('[migrate] done')
}

main()
  .then(async () => {
    await sql.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[migrate] aborted:', err.message)
    await sql.end().catch(() => undefined)
    process.exit(1)
  })
