import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { itemTypes, pricingRules } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { isPgViolation, PG_ERRORS } from '../lib/pg-errors.js'

/**
 * CRUD `/v1/admin/pricing-rules` — configuration tarifaire par tenant.
 *
 * Sémantique : une ligne = un prix pour un triplet (commune × item_type ×
 * durationMinutes). Une ligne absente = le slot n'est pas proposé. `priceCents
 * = 0` est autorisé (cas "ballon enfant gratuit").
 *
 * Scoping :
 *   - admin (commune scopé) : voit / édite UNIQUEMENT ses propres règles
 *   - super_admin : voit / édite toutes les communes (en passant ?communeId=)
 */

const ALLOWED_DURATIONS = [30, 60, 90, 120, 1440] as const
const DurationSchema = z.number().int()
  .refine((n) => (ALLOWED_DURATIONS as readonly number[]).includes(n), {
    message: 'duration_not_allowed',
  })

const PricingRuleDTO = z.object({
  id: z.string().uuid(),
  communeId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  itemTypeSlug: z.string(),
  itemTypeName: z.string(),
  durationMinutes: z.number().int(),
  priceCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const ErrorDTO = z.object({ error: z.string() })

const UpsertBody = z.object({
  itemTypeId: z.string().uuid(),
  durationMinutes: DurationSchema,
  priceCents: z.number().int().nonnegative().max(100_000_000),
})

const BulkUpsertBody = z.object({
  rules: z.array(UpsertBody).min(1).max(200)
    .describe('Liste de règles à upserter (insert ou update sur le triplet unique).'),
})

const ListQuery = z.object({
  communeId: z.string().uuid().optional()
    .describe('Override scope (super_admin uniquement). Ignoré pour admin scopé.'),
})

/**
 * Resout la commune cible : super_admin peut passer ?communeId=, sinon le
 * scope admin impose. Renvoie null si pas autorisé (réponse déjà envoyée).
 */
function resolveCommuneId(
  authScope: { communeId: string } | null,
  override: string | undefined,
): string | null {
  if (authScope) return authScope.communeId
  // super_admin : doit fournir communeId pour les opérations write.
  return override ?? null
}

export async function adminPricingRuleRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/pricing-rules — liste des règles de la commune scopée.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Tarification'],
      summary: 'Liste des règles tarifaires de la commune',
      description: 'Renvoie toutes les `pricing_rules` de la commune scopée (admin) '
        + 'ou de la commune passée en `?communeId=` (super_admin). Joint le `slug`/`name` '
        + 'de l\'item_type pour faciliter l\'affichage matriciel côté dashboard.',
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(PricingRuleDTO) }),
        401: ErrorDTO, 403: ErrorDTO, 422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const communeId = resolveCommuneId(auth.scope, req.query.communeId)
    if (!communeId) return reply.code(422).send({ error: 'commune_id_required' })

    const rows = await db
      .select({
        id: pricingRules.id,
        communeId: pricingRules.communeId,
        itemTypeId: pricingRules.itemTypeId,
        itemTypeSlug: itemTypes.slug,
        itemTypeName: itemTypes.name,
        durationMinutes: pricingRules.durationMinutes,
        priceCents: pricingRules.priceCents,
        createdAt: pricingRules.createdAt,
        updatedAt: pricingRules.updatedAt,
      })
      .from(pricingRules)
      .innerJoin(itemTypes, eq(itemTypes.id, pricingRules.itemTypeId))
      .where(eq(pricingRules.communeId, communeId))
      .orderBy(asc(itemTypes.name), asc(pricingRules.durationMinutes))

    return {
      items: rows.map((r) => ({
        id: r.id,
        communeId: r.communeId,
        itemTypeId: r.itemTypeId,
        itemTypeSlug: r.itemTypeSlug,
        itemTypeName: r.itemTypeName,
        durationMinutes: r.durationMinutes,
        priceCents: r.priceCents,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    }
  })

  /**
   * PUT /v1/admin/pricing-rules — upsert d'une ligne unique (triplet).
   */
  app.put('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Tarification'],
      summary: 'Upsert d\'une règle tarifaire',
      description: 'Insère ou met à jour le prix pour le triplet (commune × item_type × duration). '
        + 'Idempotent : appeler 2× avec le même payload renvoie la ligne mise à jour.',
      body: UpsertBody.extend({
        communeId: z.string().uuid().optional()
          .describe('Override scope (super_admin uniquement).'),
      }),
      response: {
        200: PricingRuleDTO,
        401: ErrorDTO, 403: ErrorDTO, 422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const communeId = resolveCommuneId(auth.scope, req.body.communeId)
    if (!communeId) return reply.code(422).send({ error: 'commune_id_required' })

    const { itemTypeId, durationMinutes, priceCents } = req.body
    const now = new Date()

    try {
      await db
        .insert(pricingRules)
        .values({ communeId, itemTypeId, durationMinutes, priceCents })
        .onConflictDoUpdate({
          target: [pricingRules.communeId, pricingRules.itemTypeId, pricingRules.durationMinutes],
          set: { priceCents, updatedAt: now },
        })
    } catch (err) {
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION)) {
        return reply.code(422).send({ error: 'invalid_reference' })
      }
      throw err
    }

    const [row] = await db
      .select({
        id: pricingRules.id,
        communeId: pricingRules.communeId,
        itemTypeId: pricingRules.itemTypeId,
        itemTypeSlug: itemTypes.slug,
        itemTypeName: itemTypes.name,
        durationMinutes: pricingRules.durationMinutes,
        priceCents: pricingRules.priceCents,
        createdAt: pricingRules.createdAt,
        updatedAt: pricingRules.updatedAt,
      })
      .from(pricingRules)
      .innerJoin(itemTypes, eq(itemTypes.id, pricingRules.itemTypeId))
      .where(and(
        eq(pricingRules.communeId, communeId),
        eq(pricingRules.itemTypeId, itemTypeId),
        eq(pricingRules.durationMinutes, durationMinutes),
      ))
      .limit(1)

    return {
      id: row!.id,
      communeId: row!.communeId,
      itemTypeId: row!.itemTypeId,
      itemTypeSlug: row!.itemTypeSlug,
      itemTypeName: row!.itemTypeName,
      durationMinutes: row!.durationMinutes,
      priceCents: row!.priceCents,
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    }
  })

  /**
   * POST /v1/admin/pricing-rules/bulk — applique un template (ou n'importe
   * quel batch de règles) en une seule transaction.
   */
  app.post('/bulk', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Tarification'],
      summary: 'Upsert en lot d\'une grille tarifaire',
      description: 'Applique un template (ou une grille complète) en une transaction. '
        + 'Chaque triplet (commune × item_type × duration) déjà présent est mis à jour. '
        + 'Renvoie le nombre de règles traitées.',
      body: BulkUpsertBody.extend({
        communeId: z.string().uuid().optional(),
      }),
      response: {
        200: z.object({ applied: z.number().int().nonnegative() }),
        401: ErrorDTO, 403: ErrorDTO, 422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const communeId = resolveCommuneId(auth.scope, req.body.communeId)
    if (!communeId) return reply.code(422).send({ error: 'commune_id_required' })

    const now = new Date()
    try {
      await db.transaction(async (tx) => {
        for (const rule of req.body.rules) {
          await tx
            .insert(pricingRules)
            .values({
              communeId,
              itemTypeId: rule.itemTypeId,
              durationMinutes: rule.durationMinutes,
              priceCents: rule.priceCents,
            })
            .onConflictDoUpdate({
              target: [pricingRules.communeId, pricingRules.itemTypeId, pricingRules.durationMinutes],
              set: { priceCents: rule.priceCents, updatedAt: now },
            })
        }
      })
    } catch (err) {
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION)) {
        return reply.code(422).send({ error: 'invalid_reference' })
      }
      throw err
    }

    return { applied: req.body.rules.length }
  })

  /**
   * DELETE /v1/admin/pricing-rules/:id — supprime une règle (revient à
   * "retirer ce slot du catalogue pour ce sport dans cette commune").
   */
  app.delete('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Tarification'],
      summary: 'Supprime une règle tarifaire',
      params: z.object({ id: z.string().uuid() }),
      response: {
        204: z.null(),
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Avant le DELETE, on vérifie que la règle appartient à la commune
    // scopée (sinon un admin pourrait supprimer une règle d'un autre tenant
    // s'il devine l'UUID). super_admin (scope=null) bypass.
    const [existing] = await db
      .select({ communeId: pricingRules.communeId })
      .from(pricingRules)
      .where(eq(pricingRules.id, req.params.id))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'pricing_rule_not_found' })

    if (auth.scope && existing.communeId !== auth.scope.communeId) {
      return reply.code(404).send({ error: 'pricing_rule_not_found' })
    }

    await db.delete(pricingRules).where(eq(pricingRules.id, req.params.id))
    return reply.code(204).send(null)
  })
}
