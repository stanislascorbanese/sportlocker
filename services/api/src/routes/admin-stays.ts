/**
 * Séjours — import depuis l'export du PMS, et consultation.
 *
 * SportLocker ne se branche pas sur le logiciel du camping : le site le promet
 * noir sur blanc, et c'est ce qui rend l'installation possible en une
 * demi-journée. La liste des séjours arrive donc par un fichier que le gérant
 * dépose, en général une fois par semaine — tous les PMS savent exporter les
 * arrivées, aucun ne sait ouvrir une API à un fournisseur de bornes.
 *
 * L'import se fait en deux temps. `POST /preview` lit le fichier et rend ce
 * qu'il a compris sans rien écrire ; `POST /import` écrit. Cette séparation
 * n'est pas du confort : un gérant qui charge par erreur l'export de l'an
 * dernier doit s'en rendre compte avant, pas après.
 */
import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { db } from '../db/client.js'
import { stays } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { parseStaysCsv } from '../lib/stays-csv.js'

/** Un export de saison complet fait quelques milliers de lignes, pas plus. */
const MAX_CSV_BYTES = 4 * 1024 * 1024
const MAX_ROWS = 20_000

const ParsedStayDTO = z.object({
  stayRef: z.string(),
  lastName: z.string(),
  firstName: z.string().nullable(),
  arrivesOn: z.string(),
  departsOn: z.string(),
})

const RejectedDTO = z.object({
  line: z.number().int(),
  reason: z.string(),
  raw: z.string(),
})

const PreviewDTO = z.object({
  rows: z.array(ParsedStayDTO),
  rejected: z.array(RejectedDTO),
  mapping: z.record(z.string(), z.string()),
  ignoredColumns: z.array(z.string()),
  separator: z.string(),
  totalRows: z.number().int(),
})

const ImportResultDTO = z.object({
  batchId: z.string().uuid(),
  inserted: z.number().int(),
  updated: z.number().int(),
  rejected: z.array(RejectedDTO),
})

const StayDTO = z.object({
  id: z.string().uuid(),
  stayRef: z.string(),
  lastName: z.string(),
  firstName: z.string().nullable(),
  arrivesOn: z.string(),
  departsOn: z.string(),
  hasOpenLoan: z.boolean(),
})

const ErrorDTO = z.object({ error: z.string() })

const CsvBody = z.object({
  csv: z.string().min(1).max(MAX_CSV_BYTES),
  /** Obligatoire pour un super-admin, ignoré pour un admin de camping. */
  communeId: z.string().uuid().optional(),
})

export async function adminStayRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  /**
   * Détermine le camping visé. Un admin est scopé sur le sien et ne peut pas
   * en désigner un autre ; un super-admin doit le nommer explicitement, parce
   * qu'importer les séjours d'un camping dans un autre ne se rattrape pas.
   */
  function targetCommune(
    scope: { communeId: string } | null,
    asked: string | undefined,
  ): { ok: true; communeId: string } | { ok: false; error: string } {
    if (scope) return { ok: true, communeId: scope.communeId }
    if (!asked) return { ok: false, error: 'commune_id_required' }
    return { ok: true, communeId: asked }
  }

  // ─── POST /preview ───────────────────────────────────────────────────────
  r.post('/preview', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Séjours'],
      summary: 'Lit un export PMS et montre ce qui serait importé, sans rien écrire.',
      body: CsvBody,
      response: { 200: PreviewDTO, 400: ErrorDTO, 403: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const parsed = parseStaysCsv(req.body.csv)
    if (parsed.rows.length > MAX_ROWS) {
      return reply.code(400).send({ error: 'too_many_rows' })
    }

    return {
      ...parsed,
      // L'aperçu n'a pas besoin des 4 000 lignes : les cinquante premières
      // suffisent à voir si le fichier est le bon. Le compte total, lui, est
      // l'information qui compte.
      rows: parsed.rows.slice(0, 50),
      totalRows: parsed.rows.length,
    }
  })

  // ─── POST /import ────────────────────────────────────────────────────────
  r.post('/import', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Séjours'],
      summary: 'Importe les séjours d\'un export PMS.',
      body: CsvBody,
      response: { 200: ImportResultDTO, 400: ErrorDTO, 403: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const target = targetCommune(auth.scope, req.body.communeId)
    if (!target.ok) return reply.code(400).send({ error: target.error })

    const parsed = parseStaysCsv(req.body.csv)
    if (parsed.rows.length === 0) {
      return reply.code(400).send({ error: 'no_valid_row' })
    }
    if (parsed.rows.length > MAX_ROWS) {
      return reply.code(400).send({ error: 'too_many_rows' })
    }

    const batchId = randomUUID()
    let inserted = 0
    let updated = 0

    // Un même fichier est souvent redéposé — le gérant ajoute les arrivées de
    // la semaine et renvoie tout. La clé (camping, référence, date d'arrivée)
    // rend l'opération idempotente : on met à jour le nom plutôt que de créer
    // un doublon qui ferait échouer l'identification.
    for (const row of parsed.rows) {
      const res = await db
        .insert(stays)
        .values({
          communeId: target.communeId,
          stayRef: row.stayRef,
          lastName: row.lastName,
          firstName: row.firstName,
          arrivesOn: row.arrivesOn,
          departsOn: row.departsOn,
          importBatch: batchId,
        })
        .onConflictDoUpdate({
          target: [stays.communeId, stays.stayRef, stays.arrivesOn],
          set: {
            lastName: row.lastName,
            firstName: row.firstName,
            departsOn: row.departsOn,
            importBatch: batchId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: stays.id, createdAt: stays.createdAt, updatedAt: stays.updatedAt })

      const saved = res[0]
      if (saved && saved.createdAt.getTime() === saved.updatedAt.getTime()) inserted++
      else updated++
    }

    req.log.info(
      { batchId, communeId: target.communeId, inserted, updated, rejected: parsed.rejected.length },
      'stays_imported',
    )

    return { batchId, inserted, updated, rejected: parsed.rejected }
  })

  // ─── GET / ───────────────────────────────────────────────────────────────
  r.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin · Séjours'],
      summary: 'Séjours en cours ou à venir, avec leur emprunt éventuel.',
      querystring: z.object({
        communeId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      response: { 200: z.array(StayDTO), 400: ErrorDTO, 403: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const target = targetCommune(auth.scope, req.query.communeId)
    if (!target.ok) return reply.code(400).send({ error: target.error })

    const today = new Date().toISOString().slice(0, 10)
    const rows = await db
      .select({
        id: stays.id,
        stayRef: stays.stayRef,
        lastName: stays.lastName,
        firstName: stays.firstName,
        arrivesOn: stays.arrivesOn,
        departsOn: stays.departsOn,
        openLoans: sql<number>`(
          SELECT count(*) FROM loans l
          WHERE l.stay_id = ${stays.id} AND l.returned_at IS NULL
        )::int`,
      })
      .from(stays)
      .where(and(eq(stays.communeId, target.communeId), gte(stays.departsOn, today)))
      .orderBy(asc(stays.arrivesOn), asc(stays.stayRef))
      .limit(req.query.limit)

    return rows.map((row) => ({
      id: row.id,
      stayRef: row.stayRef,
      lastName: row.lastName,
      firstName: row.firstName,
      arrivesOn: row.arrivesOn,
      departsOn: row.departsOn,
      hasOpenLoan: row.openLoans > 0,
    }))
  })
}
