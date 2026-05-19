import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { communes, users } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'

const USER_ROLE = ['citizen', 'operator', 'admin', 'super_admin'] as const

const UserDTO = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(USER_ROLE),
  trustScore: z.number().int().min(0).max(100),
  totalReservations: z.number().int().nonnegative(),
  isBanned: z.boolean(),
  bannedReason: z.string().nullable(),
  commune: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }).nullable(),
  lastActiveAt: z.string().datetime().nullable(),
  gdprDeleteRequestedAt: z.string().datetime().nullable(),
  gdprDeletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

const ListQuery = z.object({
  role:     z.enum(USER_ROLE).optional(),
  banned:   z.enum(['true', 'false']).optional(),
  q:        z.string().min(1).max(100).optional(),
})

const UpdateBody = z.object({
  role:                 z.enum(USER_ROLE).optional(),
  isBanned:             z.boolean().optional(),
  bannedReason:         z.string().max(500).nullable().optional(),
  trustScore:           z.number().int().min(0).max(100).optional(),
  /** ISO date string ou null pour annuler la demande RGPD. */
  gdprDeleteRequestedAt: z.string().datetime().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

const ErrorDTO = z.object({ error: z.string() })

type UserRow = {
  id: string
  email: string
  displayName: string | null
  phone: string | null
  role: typeof USER_ROLE[number]
  trustScore: number
  totalReservations: number
  isBanned: boolean
  bannedReason: string | null
  communeId: string | null
  communeName: string | null
  lastActiveAt: Date | null
  gdprDeleteRequestedAt: Date | null
  gdprDeletedAt: Date | null
  createdAt: Date
}

function rowToDto(r: UserRow) {
  return {
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    phone: r.phone,
    role: r.role,
    trustScore: r.trustScore,
    totalReservations: r.totalReservations,
    isBanned: r.isBanned,
    bannedReason: r.bannedReason,
    commune: r.communeId && r.communeName
      ? { id: r.communeId, name: r.communeName }
      : null,
    lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
    gdprDeleteRequestedAt: r.gdprDeleteRequestedAt?.toISOString() ?? null,
    gdprDeletedAt: r.gdprDeletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

const baseSelect = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  phone: users.phone,
  role: users.role,
  trustScore: users.trustScore,
  totalReservations: users.totalReservations,
  isBanned: users.isBanned,
  bannedReason: users.bannedReason,
  communeId: communes.id,
  communeName: communes.name,
  lastActiveAt: users.lastActiveAt,
  gdprDeleteRequestedAt: users.gdprDeleteRequestedAt,
  gdprDeletedAt: users.gdprDeletedAt,
  createdAt: users.createdAt,
}

export async function adminUserRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/users — liste paginée. Filtres role, banned, recherche
   * floue sur email/displayName. Tri par createdAt DESC. Limite 200.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Utilisateurs'],
      summary: 'Liste des utilisateurs',
      description: 'Tri par createdAt DESC, limite 200. Filtres : `role`, `banned` ("true"/"false"), '
        + '`q` (recherche ILIKE sur email/displayName). Admin scopé : voit uniquement les users de sa commune.',
      security: [{ bearerAuth: [] }],
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(UserDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { role, banned, q } = req.query

    const conditions = []
    if (role) conditions.push(eq(users.role, role))
    if (banned !== undefined) conditions.push(eq(users.isBanned, banned === 'true'))
    if (q) {
      const pattern = `%${q}%`
      conditions.push(sql`(${users.email} ILIKE ${pattern} OR ${users.displayName} ILIKE ${pattern})`)
    }
    // Operator : voit uniquement les citoyens rattachés à sa commune.
    // Les autres operators/admins (sans commune_id ou avec autre commune) sont masqués.
    if (auth.scope) conditions.push(eq(users.communeId, auth.scope.communeId))

    const rows = await db
      .select(baseSelect)
      .from(users)
      .leftJoin(communes, eq(communes.id, users.communeId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(users.createdAt))
      .limit(200)

    return { items: rows.map(rowToDto) }
  })

  /**
   * PATCH /v1/admin/users/:id — actions admin sur un user :
   * - role : promouvoir/démouvoir
   * - isBanned + bannedReason : bannir/débannir
   * - trustScore : ajuster manuellement (0..100)
   * - gdprDeleteRequestedAt : déclencher ou annuler la suppression RGPD
   *
   * Note : on ne modifie PAS gdprDeletedAt depuis l'API admin — c'est le
   * cron RGPD qui le pose lors du nettoyage effectif après 30j.
   */
  app.patch('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Utilisateurs'],
      summary: 'Action admin sur un user (ban, role, RGPD, trust)',
      description: 'Champs : `role`, `isBanned` + `bannedReason`, `trustScore` (0..100), '
        + '`gdprDeleteRequestedAt` (ISO date ou null pour annuler).\n\n'
        + '**Sécurité** : seul super_admin peut changer le rôle (403 `forbidden_role_change_super_admin_only` '
        + 'pour un admin scopé). `gdprDeletedAt` n\'est jamais modifiable depuis l\'API — c\'est le cron RGPD '
        + 'qui le pose lors du nettoyage effectif après 30j.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: { 200: UserDTO, 400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const body = req.body

    // Sécurité : seul super_admin peut changer le rôle (élévation de privilège).
    // Un admin scoped peut bannir/débannir, ajuster trustScore, déclencher RGPD
    // — pas promouvoir quelqu'un en admin/super_admin.
    if (body.role !== undefined && auth.scope) {
      return reply.code(403).send({ error: 'forbidden_role_change_super_admin_only' })
    }

    // Scope check : operator doit confirmer que l'user cible est bien dans sa commune.
    if (auth.scope) {
      const [check] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, req.params.id), eq(users.communeId, auth.scope.communeId)))
        .limit(1)
      if (!check) return reply.code(404).send({ error: 'user_not_found' })
    }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.role !== undefined) update['role'] = body.role
    if (body.isBanned !== undefined) update['isBanned'] = body.isBanned
    if (body.bannedReason !== undefined) update['bannedReason'] = body.bannedReason
    if (body.trustScore !== undefined) update['trustScore'] = body.trustScore
    if (body.gdprDeleteRequestedAt !== undefined) {
      update['gdprDeleteRequestedAt'] = body.gdprDeleteRequestedAt
        ? new Date(body.gdprDeleteRequestedAt)
        : null
    }

    const [updated] = await db
      .update(users)
      .set(update)
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id })

    if (!updated) return reply.code(404).send({ error: 'user_not_found' })

    const [row] = await db
      .select(baseSelect)
      .from(users)
      .leftJoin(communes, eq(communes.id, users.communeId))
      .where(eq(users.id, updated.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'user_not_found' })
    return rowToDto(row)
  })
}
