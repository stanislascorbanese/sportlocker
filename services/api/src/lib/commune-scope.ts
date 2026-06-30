import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Guard d'autorisation pour les routes /v1/admin/* — multi-tenant strict.
 *
 *   - super_admin : accès complet (renvoie scope=null = bypass)
 *   - admin       : accès SCOPÉ à sa commune (renvoie { communeId })
 *   - operator    : DEPRECATED (migration 0004) — traité comme admin
 *   - citizen     : 403
 *
 * Pattern à utiliser en tête de handler :
 *
 *   const auth = requireAdminScope(req, reply)
 *   if (!auth.ok) return
 *   const scope = auth.scope  // null si super_admin, { communeId } si admin
 *
 * Un admin sans communeId dans son JWT est rejeté (403) : aucun fallback
 * silencieux qui pourrait laisser fuiter des données cross-commune. Pour
 * la rétrocompatibilité avec un operator legacy (orphan), on accepte
 * communeId absent → scope null (mais cette branche disparaîtra).
 */
export type CommuneScope = { communeId: string } | null

export type AuthResult =
  | { ok: true; scope: CommuneScope }
  | { ok: false }

export function requireAdminScope(
  req: FastifyRequest,
  reply: FastifyReply,
): AuthResult {
  const { role, communeId } = req.user

  if (role === 'super_admin') {
    return { ok: true, scope: null }
  }
  if (role === 'admin') {
    if (!communeId) {
      reply.code(403).send({ error: 'forbidden_admin_missing_commune' })
      return { ok: false }
    }
    return { ok: true, scope: { communeId } }
  }
  if (role === 'operator') {
    // Legacy avant migration 0004 — orphan en pratique.
    return { ok: true, scope: communeId ? { communeId } : null }
  }

  reply.code(403).send({ error: 'forbidden_admin_required' })
  return { ok: false }
}

/**
 * Variante stricte : super_admin uniquement. Pour les actions cross-tenant
 * (créer un invite, créer une commune, modifier des données système).
 */
export function requireSuperAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (req.user.role !== 'super_admin') {
    reply.code(403).send({ error: 'forbidden_super_admin_required' })
    return false
  }
  return true
}

// ─── Aliases retro-compat (à supprimer après update des callers) ─────────
export const requireAdminOrOperator = requireAdminScope
export const requireAdmin = requireSuperAdmin
