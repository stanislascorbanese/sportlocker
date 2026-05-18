import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { communes, distributors } from '../db/schema.js'
import { requireAdminScope, requireSuperAdmin } from '../lib/commune-scope.js'

const CommuneDTO = z.object({
  id: z.string().uuid(),
  inseeCode: z.string().length(5),
  name: z.string(),
  postalCode: z.string().length(5),
  department: z.string(),
  region: z.string(),
  population: z.number().int().nullable(),
  contractStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  contractEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  monthlyFeeCents: z.number().int().min(0),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  distributorCount: z.number().int().min(0),
})

const CreateBody = z.object({
  inseeCode:    z.string().regex(/^\d{5}$/, 'must_be_5_digits'),
  name:         z.string().min(1).max(120),
  postalCode:   z.string().regex(/^\d{5}$/, 'must_be_5_digits'),
  department:   z.string().min(2).max(3),
  region:       z.string().min(1).max(60),
  population:   z.number().int().positive().nullable().optional(),
  contractStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractEnd:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyFeeCents: z.number().int().min(0).max(1_000_000).default(0),
  contactEmail: z.string().email().max(180).nullable().optional(),
  contactPhone: z.string().min(6).max(20).nullable().optional(),
})

const UpdateBody = z.object({
  name:            z.string().min(1).max(120).optional(),
  postalCode:      z.string().regex(/^\d{5}$/).optional(),
  department:      z.string().min(2).max(3).optional(),
  region:          z.string().min(1).max(60).optional(),
  population:      z.number().int().positive().nullable().optional(),
  contractStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractEnd:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyFeeCents: z.number().int().min(0).max(1_000_000).optional(),
  contactEmail:    z.string().email().max(180).nullable().optional(),
  contactPhone:    z.string().min(6).max(20).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

const ErrorDTO = z.object({ error: z.string() })

const distributorCountExpr = sql<number>`(
  SELECT COUNT(*)::int FROM distributors
  WHERE distributors.commune_id = communes.id
)`.as('distributor_count')

type CommuneRow = {
  id: string
  inseeCode: string
  name: string
  postalCode: string
  department: string
  region: string
  population: number | null
  contractStart: string | null
  contractEnd: string | null
  monthlyFeeCents: number
  contactEmail: string | null
  contactPhone: string | null
  distributorCount: number
}

function rowToDto(r: CommuneRow) {
  return {
    id: r.id,
    inseeCode: r.inseeCode,
    name: r.name,
    postalCode: r.postalCode,
    department: r.department,
    region: r.region,
    population: r.population,
    contractStart: r.contractStart,
    contractEnd: r.contractEnd,
    monthlyFeeCents: r.monthlyFeeCents,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    distributorCount: r.distributorCount,
  }
}

const baseSelect = {
  id: communes.id,
  inseeCode: communes.inseeCode,
  name: communes.name,
  postalCode: communes.postalCode,
  department: communes.department,
  region: communes.region,
  population: communes.population,
  contractStart: communes.contractStart,
  contractEnd: communes.contractEnd,
  monthlyFeeCents: communes.monthlyFeeCents,
  contactEmail: communes.contactEmail,
  contactPhone: communes.contactPhone,
  distributorCount: distributorCountExpr,
}

export async function adminCommuneRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/communes — liste paginée des communes, tri par nom ASC.
   * Inclut le compte de distributeurs rattachés.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      response: {
        200: z.object({ items: z.array(CommuneDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Admin scoped : ne voit que sa propre commune.
    const rows = auth.scope
      ? await db
          .select(baseSelect)
          .from(communes)
          .where(eq(communes.id, auth.scope.communeId))
          .limit(1)
      : await db
          .select(baseSelect)
          .from(communes)
          .orderBy(asc(communes.name))
          .limit(500)

    return { items: rows.map(rowToDto) }
  })

  /**
   * GET /v1/admin/communes/:id — détail single commune.
   */
  app.get('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: { 200: CommuneDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Admin scoped : 404 si pas sa commune.
    if (auth.scope && req.params.id !== auth.scope.communeId) {
      return reply.code(404).send({ error: 'commune_not_found' })
    }

    const [row] = await db
      .select(baseSelect)
      .from(communes)
      .where(eq(communes.id, req.params.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'commune_not_found' })
    return rowToDto(row)
  })

  /**
   * POST /v1/admin/communes — créer une commune.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      body: CreateBody,
      response: { 201: CommuneDTO, 400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 409: ErrorDTO },
    },
  }, async (req, reply) => {
    // Création de tenant = action système, super_admin uniquement.
    if (!requireSuperAdmin(req, reply)) return

    const body = req.body
    try {
      const [created] = await db.insert(communes).values({
        inseeCode:       body.inseeCode,
        name:            body.name,
        postalCode:      body.postalCode,
        department:      body.department,
        region:          body.region,
        population:      body.population ?? null,
        contractStart:   body.contractStart ?? null,
        contractEnd:     body.contractEnd ?? null,
        monthlyFeeCents: body.monthlyFeeCents,
        contactEmail:    body.contactEmail ?? null,
        contactPhone:    body.contactPhone ?? null,
      }).returning()

      return reply.code(201).send({
        id: created!.id,
        inseeCode: created!.inseeCode,
        name: created!.name,
        postalCode: created!.postalCode,
        department: created!.department,
        region: created!.region,
        population: created!.population,
        contractStart: created!.contractStart,
        contractEnd: created!.contractEnd,
        monthlyFeeCents: created!.monthlyFeeCents,
        contactEmail: created!.contactEmail,
        contactPhone: created!.contactPhone,
        distributorCount: 0,
      })
    } catch (err) {
      const msg = (err as Error).message
      if (/duplicate key|unique/i.test(msg) && /insee/i.test(msg)) {
        return reply.code(409).send({ error: 'insee_code_conflict' })
      }
      throw err
    }
  })

  /**
   * PUT /v1/admin/communes/:id — mise à jour partielle d'une commune.
   * inseeCode non modifiable (identité administrative).
   */
  app.put('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: { 200: CommuneDTO, 400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Admin scoped : ne peut modifier QUE sa propre commune.
    if (auth.scope && req.params.id !== auth.scope.communeId) {
      return reply.code(404).send({ error: 'commune_not_found' })
    }

    const body = req.body
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined)            update['name'] = body.name
    if (body.postalCode !== undefined)      update['postalCode'] = body.postalCode
    if (body.department !== undefined)      update['department'] = body.department
    if (body.region !== undefined)          update['region'] = body.region
    if (body.population !== undefined)      update['population'] = body.population
    if (body.contractStart !== undefined)   update['contractStart'] = body.contractStart
    if (body.contractEnd !== undefined)     update['contractEnd'] = body.contractEnd
    if (body.monthlyFeeCents !== undefined) update['monthlyFeeCents'] = body.monthlyFeeCents
    if (body.contactEmail !== undefined)    update['contactEmail'] = body.contactEmail
    if (body.contactPhone !== undefined)    update['contactPhone'] = body.contactPhone

    const [updated] = await db
      .update(communes)
      .set(update)
      .where(eq(communes.id, req.params.id))
      .returning({ id: communes.id })

    if (!updated) return reply.code(404).send({ error: 'commune_not_found' })

    const [row] = await db
      .select(baseSelect)
      .from(communes)
      .where(eq(communes.id, updated.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'commune_not_found' })
    return rowToDto(row)
  })
}
