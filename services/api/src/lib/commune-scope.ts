import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Guard d'autorisation pour les routes /admin/* :
 * - admin : accès complet (renvoie null = pas de scope)
 * - operator : accès SCOPÉ à sa commune (renvoie { communeId })
 * - citizen : 403
 *
 * Renvoie `{ ok: true, scope }` ou envoie automatiquement 403 et renvoie
 * `{ ok: false }`. Pattern à utiliser en tête de handler :
 *
 *   const auth = requireAdminOrOperator(req, reply)
 *   if (!auth.ok) return
 *   const scope = auth.scope  // null si admin, { communeId } si operator
 *
 * Note : un operator sans communeId dans son token est traité comme un
 * "operator global" (scope null) — utile pendant la phase pilote où on
 * peut promouvoir un user sans encore l'assigner. Si on veut durcir
 * plus tard, ajouter `if (!communeId) return 403`.
 */
export type CommuneScope = { communeId: string } | null

export type AuthResult =
  | { ok: true; scope: CommuneScope }
  | { ok: false }

export function requireAdminOrOperator(
  req: FastifyRequest,
  reply: FastifyReply,
): AuthResult {
  const { role, communeId } = req.user

  if (role === 'admin') {
    return { ok: true, scope: null }
  }
  if (role === 'operator') {
    return { ok: true, scope: communeId ? { communeId } : null }
  }

  reply.code(403).send({ error: 'forbidden_admin_or_operator_required' })
  return { ok: false }
}

/**
 * Variante stricte : admin uniquement. Pour les actions sensibles
 * (ex : modifier le rôle d'un user, créer une commune, etc.).
 */
export function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (req.user.role !== 'admin') {
    reply.code(403).send({ error: 'forbidden_admin_required' })
    return false
  }
  return true
}
