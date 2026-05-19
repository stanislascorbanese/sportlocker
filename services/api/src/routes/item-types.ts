import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { itemTypes } from '../db/schema.js'

const ItemTypeDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  cautionCents: z.number().int(),
  maxDurationMinutes: z.number().int(),
})

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function itemTypeRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/item-types — catalogue paginé.
   * Public (pas d'auth) : le mobile l'appelle au démarrage pour peupler le filtre.
   */
  app.get('/', {
    schema: {
      tags: ['Citoyens — Item types'],
      summary: 'Catalogue paginé des types d\'objets',
      description: 'Public (pas d\'auth). Appelé par l\'app mobile au démarrage pour peupler le filtre de la carte. '
        + 'Inclut caution en cents et durée d\'emprunt max en minutes.',
      querystring: ListQuery,
      response: {
        200: z.object({
          items: z.array(ItemTypeDTO),
          total: z.number().int(),
          limit: z.number().int(),
          offset: z.number().int(),
        }),
      },
    },
  }, async (req) => {
    const { limit, offset } = req.query

    const [count] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(itemTypes)

    const rows = await db
      .select()
      .from(itemTypes)
      .orderBy(itemTypes.name)
      .limit(limit)
      .offset(offset)

    return {
      items: rows.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        description: t.description,
        imageUrl: t.imageUrl,
        cautionCents: t.cautionCents,
        maxDurationMinutes: t.maxDurationMinutes,
      })),
      total: count!.total,
      limit,
      offset,
    }
  })
}
