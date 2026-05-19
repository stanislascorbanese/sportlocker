/**
 * Helpers partagés entre les tests d'intégration des routes /v1/admin/*.
 *
 *   - seedCommune(pgSql, name?) : crée une commune avec un INSEE aléatoire
 *     valide (5 chiffres) pour éviter les collisions entre tests.
 *   - seedUser(pgSql, opts) : crée un user avec firebase_uid + email uniques
 *     et un rôle paramétrable (par défaut citizen).
 *   - signSession(app, ...) : forge un JWT de session via fastify-jwt,
 *     pour bypasser le flow Firebase dans les routes admin.
 *
 * Le contrat respecte exactement la signature historiquement utilisée dans
 * admin-auth.test.ts — extraction sans changement de comportement.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type postgres from 'postgres'

export type Role = 'citizen' | 'operator' | 'admin' | 'super_admin'

export async function seedCommune(
  pgSql: ReturnType<typeof postgres>,
  name = 'Paris Test',
): Promise<string> {
  const id = randomUUID()
  // INSEE entre 10000 et 79999 → toujours 5 chiffres, marge confortable
  // pour les ~milliers d'inserts d'une suite complète sans collision.
  const insee = String(10000 + Math.floor(Math.random() * 70000))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, ${name}, '75001', '75', 'IDF')`
  return id
}

export async function seedUser(
  pgSql: ReturnType<typeof postgres>,
  opts: {
    role?: Role
    email?: string
    firebaseUid?: string
    communeId?: string | null
    displayName?: string | null
  } = {},
): Promise<{ id: string; firebaseUid: string; email: string }> {
  const id = randomUUID()
  const firebaseUid = opts.firebaseUid ?? 'fb-' + id.slice(0, 8)
  const email = opts.email ?? id.slice(0, 8) + '@test.local'
  const role: Role = opts.role ?? 'citizen'
  const displayName = opts.displayName ?? null
  await pgSql`INSERT INTO users (id, firebase_uid, email, display_name, role, commune_id)
    VALUES (${id}, ${firebaseUid}, ${email}, ${displayName}, ${role}, ${opts.communeId ?? null})`
  return { id, firebaseUid, email }
}

/**
 * Forge un JWT session valide pour les onRequest hooks `app.authenticate`.
 * Retourne le header `Authorization: Bearer ...` complet.
 */
export function signSession(
  app: FastifyInstance,
  userId: string,
  role: Role = 'citizen',
  communeId?: string,
): string {
  const token = app.jwt.sign({
    sub: userId,
    role,
    ...(communeId ? { communeId } : {}),
  })
  return `Bearer ${token}`
}
