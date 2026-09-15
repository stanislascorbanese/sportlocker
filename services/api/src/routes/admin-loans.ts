/**
 * Emprunts, côté exploitation.
 *
 * C'est ce que le camping regarde tous les jours : qui a quoi, depuis quand,
 * et qu'est-ce qui n'est pas rentré. Deux différences avec l'ancien écran des
 * réservations, et elles comptent :
 *
 *   - on affiche un nom et un numéro d'emplacement, pas une adresse e-mail.
 *     Le saisonnier de l'accueil cherche « la 214 », il ne cherche pas
 *     camille.martin@gmail.com ;
 *
 *   - on peut marquer une ligne « passée en compte séjour ». SportLocker ne
 *     facture rien et ne connaît aucun tarif — cette case dit seulement que le
 *     camping s'en est occupé, pour que la ligne cesse de remonter tous les
 *     matins.
 */
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { ItemKind } from '@sportlocker/types'

import { db } from '../db/client.js'
import { distributors, itemTypes, items, loans, lockers, stays } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { kindOf } from '../lib/item-kind.js'

const LoanRowDTO = z.object({
  id: z.string().uuid(),
  borrowedAt: z.string(),
  returnedAt: z.string().nullable(),
  chargedAt: z.string().nullable(),
  /** Heures écoulées depuis la sortie — calculé côté serveur, pour que tous
   *  les écrans soient d'accord sur « depuis quand ». */
  hoursOut: z.number(),
  stay: z.object({
    id: z.string().uuid(),
    stayRef: z.string(),
    lastName: z.string(),
    firstName: z.string().nullable(),
    departsOn: z.string(),
  }),
  item: z.object({ label: z.string(), kind: ItemKind }),
  distributor: z.object({ id: z.string().uuid(), name: z.string(), serialNumber: z.string() }),
  lockerNumber: z.number().int(),
})

const ErrorDTO = z.object({ error: z.string() })

export async function adminLoanRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // ─── GET / ───────────────────────────────────────────────────────────────
  r.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Emprunts'],
      summary: 'Emprunts du camping — en cours, rendus, ou tout.',
      querystring: z.object({
        status: z.enum(['open', 'returned', 'all']).default('open'),
        /** Ne garde que ce qui est dehors depuis au moins N heures. */
        minHoursOut: z.coerce.number().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      response: { 200: z.array(LoanRowDTO), 403: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const filters = [
      req.query.status === 'open' ? isNull(loans.returnedAt)
        : req.query.status === 'returned' ? isNotNull(loans.returnedAt)
        : undefined,
      auth.scope ? eq(stays.communeId, auth.scope.communeId) : undefined,
    ].filter((f) => f !== undefined)

    const rows = await db
      .select({
        id: loans.id,
        borrowedAt: loans.borrowedAt,
        returnedAt: loans.returnedAt,
        chargedAt: loans.chargedAt,
        stayId: stays.id,
        stayRef: stays.stayRef,
        lastName: stays.lastName,
        firstName: stays.firstName,
        departsOn: stays.departsOn,
        typeName: itemTypes.name,
        typeSlug: itemTypes.slug,
        distributorId: distributors.id,
        distributorName: distributors.name,
        serialNumber: distributors.serialNumber,
        position: lockers.position,
      })
      .from(loans)
      .innerJoin(stays, eq(stays.id, loans.stayId))
      .innerJoin(lockers, eq(lockers.id, loans.lockerId))
      .innerJoin(items, eq(items.id, loans.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .innerJoin(distributors, eq(distributors.id, loans.distributorId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(loans.borrowedAt))
      .limit(req.query.limit)

    const now = Date.now()
    const mapped = rows.map((row) => ({
      id: row.id,
      borrowedAt: row.borrowedAt.toISOString(),
      returnedAt: row.returnedAt?.toISOString() ?? null,
      chargedAt: row.chargedAt?.toISOString() ?? null,
      hoursOut: Math.round(
        ((row.returnedAt?.getTime() ?? now) - row.borrowedAt.getTime()) / 3_600_000 * 10,
      ) / 10,
      stay: {
        id: row.stayId,
        stayRef: row.stayRef,
        lastName: row.lastName,
        firstName: row.firstName,
        departsOn: row.departsOn,
      },
      item: { label: row.typeName, kind: kindOf(row.typeSlug, row.typeName) },
      distributor: {
        id: row.distributorId,
        name: row.distributorName,
        serialNumber: row.serialNumber,
      },
      // Le numéro peint sur la porte, pas la position en base.
      lockerNumber: row.position + 1,
    }))

    const min = req.query.minHoursOut
    return min === undefined ? mapped : mapped.filter((l) => l.hoursOut >= min)
  })

  // ─── POST /:id/charge ────────────────────────────────────────────────────
  r.post('/:id/charge', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Emprunts'],
      summary: 'Marque un emprunt comme passé en compte séjour, ou annule ce marquage.',
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ charged: z.boolean().default(true) }),
      response: {
        200: z.object({ id: z.string().uuid(), chargedAt: z.string().nullable() }),
        403: ErrorDTO,
        404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Un admin ne marque que les emprunts de son camping. La vérification passe
    // par le séjour, seul lien entre un emprunt et une commune.
    const [existing] = await db
      .select({ id: loans.id, communeId: stays.communeId })
      .from(loans)
      .innerJoin(stays, eq(stays.id, loans.stayId))
      .where(eq(loans.id, req.params.id))
      .limit(1)

    if (!existing) return reply.code(404).send({ error: 'loan_not_found' })
    if (auth.scope && existing.communeId !== auth.scope.communeId) {
      return reply.code(404).send({ error: 'loan_not_found' })
    }

    const chargedAt = req.body.charged ? new Date() : null
    await db
      .update(loans)
      .set({
        chargedAt,
        chargedByUserId: req.body.charged ? req.user.sub : null,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, req.params.id))

    req.log.info({ loanId: req.params.id, charged: req.body.charged }, 'loan_charge_marked')
    return { id: req.params.id, chargedAt: chargedAt?.toISOString() ?? null }
  })

  // ─── GET /daily ──────────────────────────────────────────────────────────
  r.get('/daily', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Emprunts'],
      summary: 'Nombre d\'emprunts par jour, pour la courbe de la page Aujourd\'hui.',
      querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }),
      response: {
        200: z.array(z.object({ date: z.string(), count: z.number().int() })),
        403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // On génère la série de dates côté SQL pour que les journées sans emprunt
    // apparaissent à zéro : une courbe qui saute les jours creux ment sur la
    // fréquentation.
    //
    // Le filtre par camping est dans le ON du LEFT JOIN, pas dans un WHERE.
    // Mis en WHERE, il éliminerait les lignes où la jointure n'a rien trouvé —
    // c'est-à-dire précisément les jours creux qu'on veut garder.
    const days = req.query.days
    const scopeFilter = auth.scope
      ? sql`AND EXISTS (
              SELECT 1 FROM stays s
              WHERE s.id = l.stay_id AND s.commune_id = ${auth.scope.communeId}
            )`
      : sql``

    const rows = await db.execute(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             COUNT(l.id)::int AS count
      FROM generate_series(
             (CURRENT_DATE - ${days - 1}::int), CURRENT_DATE, '1 day'
           ) AS d(day)
      LEFT JOIN loans l
        ON l.borrowed_at >= d.day
       AND l.borrowed_at < d.day + interval '1 day'
       ${scopeFilter}
      GROUP BY d.day
      ORDER BY d.day
    `)

    return (rows as unknown as { date: string; count: number }[]).map((row) => ({
      date: row.date,
      count: Number(row.count),
    }))
  })
}
