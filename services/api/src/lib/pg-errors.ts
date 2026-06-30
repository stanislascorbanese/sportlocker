/**
 * Helpers pour extraire le code SQLSTATE et le nom de contrainte d'une erreur
 * remontée par Drizzle ORM (driver postgres-js sous-jacent).
 *
 * Pourquoi un helper centralisé :
 *   1. **Robustesse cross-version Drizzle** — Drizzle ≥ 0.36 a introduit
 *      `DrizzleQueryError` qui wrappe l'erreur native du driver dans `.cause`.
 *      Avant 0.36, le code SQLSTATE et le nom de contrainte sont directement
 *      sur l'erreur. Le helper sonde les deux pour rester compatible pendant
 *      le bump 0.30 → 0.45.
 *   2. **Stop au matching par regex sur message** — le pattern `(err as Error)
 *      .message` utilisé historiquement dans le code casse silencieusement
 *      quand Drizzle change le format de son message. Lire `.code` et
 *      `.constraint_name` est la doctrine officielle Postgres (cf. doc
 *      `SQLSTATE`), stable depuis ~20 ans.
 *   3. **Centralisation des codes SQLSTATE 23xxx** — au lieu de codes
 *      magiques disséminés, on a une constante typée.
 *
 * Spec SQLSTATE 23xxx (integrity_constraint_violation) :
 *   https://www.postgresql.org/docs/16/errcodes-appendix.html
 */

export const PG_ERRORS = {
  NOT_NULL_VIOLATION:    '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION:      '23505',
  CHECK_VIOLATION:       '23514',
  EXCLUSION_VIOLATION:   '23P01',
} as const

/**
 * Extrait le code SQLSTATE 5 caractères (ex. `'23505'`) d'une erreur.
 *
 * Cherche dans cet ordre :
 *   1. `err.cause.code` — Drizzle ≥ 0.36 (DrizzleQueryError)
 *   2. `err.code` — Drizzle ≤ 0.35 ou erreur driver directe
 *
 * Retourne `undefined` si l'erreur n'est pas une erreur DB (timeout, network,
 * erreur applicative, etc.).
 */
export function pgErrorCode(err: unknown): string | undefined {
  return pickStringProp(err, 'code', 'cause.code')
}

/**
 * Extrait le nom de la contrainte violée. Utile pour distinguer plusieurs
 * UNIQUE indexes sur la même table (ex. `distributors_serial_number_key` vs
 * `distributors_pkey`).
 *
 * En postgres-js, ce champ peut être nommé `constraint_name` (snake_case
 * comme Postgres) ou `constraint` selon la version. On sonde les deux pour
 * être sûr.
 */
export function pgErrorConstraint(err: unknown): string | undefined {
  return (
    pickStringProp(err, 'constraint_name', 'cause.constraint_name') ??
    pickStringProp(err, 'constraint', 'cause.constraint')
  )
}

/**
 * Extrait le champ `detail` de l'erreur Postgres (souvent plus lisible que
 * le message principal — ex. `Key (serial_number)=(SL-001) already exists`).
 */
export function pgErrorDetail(err: unknown): string | undefined {
  return pickStringProp(err, 'detail', 'cause.detail')
}

/**
 * Convenance : test combiné "code SQLSTATE + nom de contrainte contient X".
 * Évite l'idiome `pgErrorCode(err) === '23505' && pgErrorConstraint(err)?.includes('foo')`
 * qui devient verbeux quand on a 3+ contraintes à distinguer.
 */
export function isPgViolation(
  err: unknown,
  code: string,
  constraintHint?: string,
): boolean {
  if (pgErrorCode(err) !== code) return false
  if (!constraintHint) return true
  const constraint = pgErrorConstraint(err) ?? ''
  const detail = pgErrorDetail(err) ?? ''
  // Insensible à la casse, cherche le hint dans le nom de la contrainte
  // OU dans le detail (qui inclut souvent le nom de colonne).
  const hint = constraintHint.toLowerCase()
  return constraint.toLowerCase().includes(hint) || detail.toLowerCase().includes(hint)
}

/**
 * Implémentation interne : essaie une liste de chemins type "a.b.c" et
 * renvoie la première valeur string trouvée.
 */
function pickStringProp(obj: unknown, ...paths: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  for (const path of paths) {
    const parts = path.split('.')
    let cur: unknown = obj
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = (cur as Record<string, unknown>)[part]
      } else {
        cur = undefined
        break
      }
    }
    if (typeof cur === 'string') return cur
  }
  return undefined
}
