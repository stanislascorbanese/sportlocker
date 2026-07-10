import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, items, itemTypes, lockers, maintenanceTickets, users,
  type MaintenanceComment, type MaintenanceStatusChange,
} from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'

const MAINTENANCE_STATUS = ['open', 'in_progress', 'resolved', 'wontfix'] as const

// Alias explicites : un ticket référence deux users distincts (l'ouvreur et
// l'assigné). `opened_by` NULL = ticket créé automatiquement (cron/watchdog).
const assignee = alias(users, 'ticket_assignee')
const opener = alias(users, 'ticket_opener')

const UserRefDTO = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
}).nullable()

const CommentDTO = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  authorEmail: z.string(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.string().datetime(),
})

const StatusChangeDTO = z.object({
  from: z.enum(MAINTENANCE_STATUS).nullable(),
  to: z.enum(MAINTENANCE_STATUS),
  at: z.string().datetime(),
  byId: z.string().uuid().nullable(),
  byEmail: z.string().nullable(),
})

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
  // opened_by NULL = ticket auto (cron/watchdog). Le front affiche un badge.
  isAuto: z.boolean(),
  openedBy: UserRefDTO,
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
  }),
  assignee: UserRefDTO,
})

const TicketDetailDTO = TicketDTO.extend({
  locker: z.object({
    id: z.string().uuid(),
    position: z.number().int(),
  }).nullable(),
  item: z.object({
    id: z.string().uuid(),
    rfidTag: z.string(),
    typeName: z.string(),
  }).nullable(),
  comments: z.array(CommentDTO),
  statusHistory: z.array(StatusChangeDTO),
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

const CommentBody = z.object({
  body: z.string().trim().min(1).max(2000),
})

const ErrorDTO = z.object({ error: z.string() })

// ─── Sélections Drizzle ──────────────────────────────────────────────────────

/** Colonnes communes liste + détail (sans les champs lourds JSONB/joins détail). */
const listSelect = {
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
  openerId: opener.id,
  openerEmail: opener.email,
  openerDisplayName: opener.displayName,
  assigneeId: assignee.id,
  assigneeEmail: assignee.email,
  assigneeDisplayName: assignee.displayName,
}

const detailSelect = {
  ...listSelect,
  comments: maintenanceTickets.comments,
  statusHistory: maintenanceTickets.statusHistory,
  lockerId: lockers.id,
  lockerPosition: lockers.position,
  itemId: items.id,
  itemRfid: items.rfidTag,
  itemTypeName: itemTypes.name,
}

type ListRow = {
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
  openerId: string | null
  openerEmail: string | null
  openerDisplayName: string | null
  assigneeId: string | null
  assigneeEmail: string | null
  assigneeDisplayName: string | null
}

type DetailRow = ListRow & {
  comments: MaintenanceComment[]
  statusHistory: MaintenanceStatusChange[]
  lockerId: string | null
  lockerPosition: number | null
  itemId: string | null
  itemRfid: string | null
  itemTypeName: string | null
}

function userRef(id: string | null, email: string | null, displayName: string | null) {
  return id && email ? { id, email, displayName } : null
}

function listRowToDto(r: ListRow) {
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
    isAuto: r.openerId === null,
    openedBy: userRef(r.openerId, r.openerEmail, r.openerDisplayName),
    distributor: {
      id: r.distributorId,
      name: r.distributorName,
      serialNumber: r.distributorSerial,
    },
    assignee: userRef(r.assigneeId, r.assigneeEmail, r.assigneeDisplayName),
  }
}

function detailRowToDto(r: DetailRow) {
  return {
    ...listRowToDto(r),
    locker: r.lockerId && r.lockerPosition !== null
      ? { id: r.lockerId, position: r.lockerPosition }
      : null,
    item: r.itemId && r.itemRfid && r.itemTypeName
      ? { id: r.itemId, rfidTag: r.itemRfid, typeName: r.itemTypeName }
      : null,
    // Fils JSONB triés du plus ancien au plus récent (append-only, mais on
    // sécurise l'ordre côté API pour ne rien supposer du storage).
    comments: [...r.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    statusHistory: [...r.statusHistory].sort((a, b) => a.at.localeCompare(b.at)),
  }
}

export async function adminMaintenanceRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * Charge un ticket détaillé, en appliquant le scope commune de l'admin.
   * Retourne null si le ticket n'existe pas OU sort du scope (→ 404 côté caller).
   */
  async function loadDetail(id: string, communeId: string | null): Promise<DetailRow | null> {
    const conditions = [eq(maintenanceTickets.id, id)]
    if (communeId) conditions.push(eq(distributors.communeId, communeId))

    const [row] = await db
      .select(detailSelect)
      .from(maintenanceTickets)
      .innerJoin(distributors, eq(distributors.id, maintenanceTickets.distributorId))
      .leftJoin(lockers, eq(lockers.id, maintenanceTickets.lockerId))
      .leftJoin(items, eq(items.id, maintenanceTickets.itemId))
      .leftJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .leftJoin(opener, eq(opener.id, maintenanceTickets.openedBy))
      .leftJoin(assignee, eq(assignee.id, maintenanceTickets.assignedTo))
      .where(and(...conditions))
      .limit(1)

    return (row as DetailRow | undefined) ?? null
  }

  /** Email + displayName de l'admin qui agit (pour dénormaliser dans le JSONB). */
  async function actingUser(userId: string): Promise<{ email: string; displayName: string | null }> {
    const [u] = await db
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return u ?? { email: 'unknown', displayName: null }
  }

  /**
   * GET /v1/admin/maintenance-tickets — liste tous les tickets, tri par
   * sévérité DESC puis createdAt DESC. Filtre par status/distributorId.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Maintenance'],
      summary: 'Liste des tickets de maintenance',
      description: 'Tri par sévérité DESC puis createdAt DESC. Limite 500. Filtres : `status`, `distributorId`. '
        + 'Admin scopé : tickets de sa commune uniquement. `isAuto=true` = ticket ouvert automatiquement '
        + '(opened_by NULL, cron/watchdog).',
      security: [{ bearerAuth: [] }],
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(TicketDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { status, distributorId } = req.query

    const conditions = []
    if (status) conditions.push(eq(maintenanceTickets.status, status))
    if (distributorId) conditions.push(eq(maintenanceTickets.distributorId, distributorId))
    if (auth.scope) conditions.push(eq(distributors.communeId, auth.scope.communeId))

    const rows = await db
      .select(listSelect)
      .from(maintenanceTickets)
      .innerJoin(distributors, eq(distributors.id, maintenanceTickets.distributorId))
      .leftJoin(opener, eq(opener.id, maintenanceTickets.openedBy))
      .leftJoin(assignee, eq(assignee.id, maintenanceTickets.assignedTo))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(maintenanceTickets.severity), desc(maintenanceTickets.createdAt))
      .limit(500)

    return { items: rows.map(listRowToDto) }
  })

  /**
   * GET /v1/admin/maintenance-tickets/:id — détail complet d'un ticket :
   * distributeur, casier/article liés, ouvreur (ou auto), assigné, fil de
   * commentaires internes et historique des transitions de statut.
   */
  app.get('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Maintenance'],
      summary: 'Détail d\'un ticket de maintenance',
      description: 'Inclut casier/article liés, commentaires internes et historique des transitions. '
        + 'Admin scopé : 404 si ticket hors commune.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: TicketDetailDTO,
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const row = await loadDetail(req.params.id, auth.scope?.communeId ?? null)
    if (!row) return reply.code(404).send({ error: 'ticket_not_found' })

    return detailRowToDto(row)
  })

  /**
   * GET /v1/admin/maintenance-tickets/:id/comments — fil de commentaires seul.
   */
  app.get('/:id/comments', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Maintenance'],
      summary: 'Commentaires internes d\'un ticket',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: z.object({ items: z.array(CommentDTO) }),
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const row = await loadDetail(req.params.id, auth.scope?.communeId ?? null)
    if (!row) return reply.code(404).send({ error: 'ticket_not_found' })

    return {
      items: [...row.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }
  })

  /**
   * POST /v1/admin/maintenance-tickets/:id/comments — ajoute un commentaire
   * interne. Append-only dans la colonne JSONB `comments`. L'auteur est
   * dénormalisé (email + displayName) pour l'affichage sans JOIN.
   */
  app.post('/:id/comments', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Maintenance'],
      summary: 'Ajoute un commentaire interne à un ticket',
      description: 'Append-only. Admin scopé : 404 si ticket hors commune.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: CommentBody,
      response: {
        201: CommentDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const row = await loadDetail(req.params.id, auth.scope?.communeId ?? null)
    if (!row) return reply.code(404).send({ error: 'ticket_not_found' })

    const author = await actingUser(req.user.sub)
    const comment: MaintenanceComment = {
      id: randomUUID(),
      authorId: req.user.sub,
      authorEmail: author.email,
      authorName: author.displayName,
      body: req.body.body,
      createdAt: new Date().toISOString(),
    }

    await db
      .update(maintenanceTickets)
      .set({
        comments: [...row.comments, comment],
        updatedAt: new Date(),
      })
      .where(eq(maintenanceTickets.id, req.params.id))

    return reply.code(201).send(comment)
  })

  /**
   * PATCH /v1/admin/maintenance-tickets/:id — met à jour status/assignee/severity/resolutionNote.
   *
   * Side effects :
   *   - `status=resolved` pose `resolvedAt=NOW()` ; retour vers un statut ouvert
   *     remet `resolvedAt=null`.
   *   - tout changement de statut est journalisé dans `status_history` (JSONB).
   */
  app.patch('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Maintenance'],
      summary: 'Met à jour un ticket (status, assignee, severity, note)',
      description: 'Side effect : `status=resolved` pose `resolvedAt=NOW()`. Retour vers open/in_progress/wontfix '
        + 'remet `resolvedAt=null`. Chaque changement de statut est journalisé dans `statusHistory`. '
        + 'Admin scopé : 404 si ticket hors commune.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: {
        200: TicketDetailDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // On charge d'abord l'état courant : nécessaire pour le scope 404, pour
    // connaître le statut source de la transition, et pour l'append JSONB.
    const current = await loadDetail(req.params.id, auth.scope?.communeId ?? null)
    if (!current) return reply.code(404).send({ error: 'ticket_not_found' })

    const body = req.body
    const now = new Date()
    const update: Record<string, unknown> = { updatedAt: now }

    if (body.status !== undefined) {
      update['status'] = body.status
      update['resolvedAt'] = body.status === 'resolved' ? now : null
      // Journalise uniquement les vraies transitions (statut différent).
      if (body.status !== current.status) {
        const actor = await actingUser(req.user.sub)
        const entry: MaintenanceStatusChange = {
          from: current.status,
          to: body.status,
          at: now.toISOString(),
          byId: req.user.sub,
          byEmail: actor.email,
        }
        update['statusHistory'] = [...current.statusHistory, entry]
      }
    }
    if (body.assignedTo !== undefined)     update['assignedTo'] = body.assignedTo
    if (body.resolutionNote !== undefined) update['resolutionNote'] = body.resolutionNote
    if (body.severity !== undefined)       update['severity'] = body.severity

    await db
      .update(maintenanceTickets)
      .set(update)
      .where(eq(maintenanceTickets.id, req.params.id))

    const row = await loadDetail(req.params.id, auth.scope?.communeId ?? null)
    if (!row) return reply.code(404).send({ error: 'ticket_not_found' })

    return detailRowToDto(row)
  })
}
