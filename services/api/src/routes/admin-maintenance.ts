import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors, maintenanceTickets, users } from '../db/schema.js'

const MAINTENANCE_STATUS = ['open', 'in_progress', 'resolved', 'wontfix'] as const

const TicketDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(MAINTENANCE_STATUS),
  severity: z.number().int().min(1).max(5),
  title: z.string(),
  description: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
  }),
  assignee: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }).nullable(),
})

const ListQuery = z.object({
  status: z.enum(MAINTENANCE_STATUS).optional(),
  distributorId: z.string().uuid().optional(),
})

const UpdateBody = z.object({
  status:         z.enum(MAINTENANCE_STATUS).optional(),
  assignedTo:     z.string().uuid().nullable().optional(),
  resolutionNote: z.string().max(2000).nullable().optional(),
  severity:       z.number().int().min(1).max(5).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

const ErrorDTO = z.object({ error: z.string() })

type TicketRow = {
  id: string
  status: typeof MAINTENANCE_STATUS[number]
  severity: number
  title: string
  description: string | null
  resolutionNote: string | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  distributorId: string
  distributorName: string
  distributorSerial: string
  assigneeId: string | null
  assigneeEmail: string | null
  assigneeDisplayName: string | null
}

function rowToDto(r: TicketRow) {
  return {
    id: r.id,
    status: r.status,
    severity: r.severity,
    title: r.title,
    description: r.description,
    resolutionNote: r.resolutionNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    distributor: {
      id: r.distributorId,
      name: r.distributorName,
      serialNumber: r.distributorSerial,
    },
    assignee: r.assigneeId && r.assigneeEmail
      ? { id: r.assigneeId, email: r.assigneeEmail, displayName: r.assigneeDisplayName }
      : null,
  }
}

const baseSelect = {
  id: maintenanceTickets.id,
  status: maintenanceTickets.status,
  severity: maintenanceTickets.severity,
  title: maintenanceTickets.title,
  description: maintenanceTickets.description,
  resolutionNote: maintenanceTickets.resolutionNote,
  resolvedAt: maintenanceTickets.resolvedAt,
  createdAt: maintenanceTickets.createdAt,
  updatedAt: maintenanceTickets.updatedAt,
  distributorId: distributors.id,
  distributorName: distributors.name,
  distributorSerial: distributors.serialNumber,
  assigneeId: users.id,
  assigneeEmail: users.email,
  assigneeDisplayName: users.displayName,
}

export async function adminMaintenanceRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/maintenance-tickets — liste tous les tickets, tri par
   * sévérité DESC puis createdAt DESC. Filtre par status/distributorId.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(TicketDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden_admin_required' })
    }

    const { status, distributorId } = req.query

    const conditions = []
    if (status) conditions.push(eq(maintenanceTickets.status, status))
    if (distributorId) conditions.push(eq(maintenanceTickets.distributorId, distributorId))

    const rows = await db
      .select(baseSelect)
      .from(maintenanceTickets)
      .innerJoin(distributors, eq(distributors.id, maintenanceTickets.distributorId))
      .leftJoin(users, eq(users.id, maintenanceTickets.assignedTo))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(maintenanceTickets.severity), desc(maintenanceTickets.createdAt))
      .limit(500)

    return { items: rows.map(rowToDto) }
  })

  /**
   * PATCH /v1/admin/maintenance-tickets/:id — met à jour status/assignee/severity/resolutionNote.
   *
   * Side effect : si status passe à 'resolved', resolvedAt = NOW().
   * Si status repasse en open/in_progress/wontfix, resolvedAt = NULL.
   */
  app.patch('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: {
        200: TicketDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden_admin_required' })
    }

    const body = req.body
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.status !== undefined) {
      update['status'] = body.status
      update['resolvedAt'] = body.status === 'resolved' ? new Date() : null
    }
    if (body.assignedTo !== undefined)     update['assignedTo'] = body.assignedTo
    if (body.resolutionNote !== undefined) update['resolutionNote'] = body.resolutionNote
    if (body.severity !== undefined)       update['severity'] = body.severity

    const [updated] = await db
      .update(maintenanceTickets)
      .set(update)
      .where(eq(maintenanceTickets.id, req.params.id))
      .returning({ id: maintenanceTickets.id })

    if (!updated) return reply.code(404).send({ error: 'ticket_not_found' })

    const [row] = await db
      .select(baseSelect)
      .from(maintenanceTickets)
      .innerJoin(distributors, eq(distributors.id, maintenanceTickets.distributorId))
      .leftJoin(users, eq(users.id, maintenanceTickets.assignedTo))
      .where(eq(maintenanceTickets.id, updated.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'ticket_not_found' })

    return rowToDto(row)
  })
}
