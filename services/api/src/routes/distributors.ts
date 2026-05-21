import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, items, itemTypes, lockers, pricingRules, reservations,
} from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { PG_ERRORS, isPgViolation } from '../lib/pg-errors.js'
import {
  computeSlotEnd,
  enumerateSlotStarts,
  isoUtcDay,
  MAX_BOOKING_HORIZON_DAYS,
  type SlotDurationMinutes,
} from '../lib/slots.js'

const DistributorDTO = z.object({
  id: z.string().uuid().describe('UUID v4 du distributeur'),
  serialNumber: z.string().describe('Numéro de série physique gravé sur la borne, unique'),
  name: z.string().describe('Nom affiché côté UI (ex: "Stade Léo Lagrange")'),
  status: z.enum(['online', 'offline', 'maintenance', 'decommissioned'])
    .describe('État opérationnel synthétique. `online` = heartbeat récent. `decommissioned` = retiré du parc.'),
  communeId: z.string().uuid().describe('Tenant (commune) propriétaire du distributeur'),
  lockerCount: z.number().int().positive().describe('Nombre total de casiers physiques (1..64)'),
  idleLockers: z.number().int().min(0).describe('Nombre de casiers actuellement disponibles (state=idle)'),
  latitude: z.number().nullable().describe('Latitude WGS84. Null tant que la borne n\'a pas été géocodée.'),
  longitude: z.number().nullable().describe('Longitude WGS84. Null tant que la borne n\'a pas été géocodée.'),
  addressLine: z.string().max(200).nullable()
    .describe('Adresse postale formatée (typiquement label BAN), null si non renseignée.'),
  /** Pas encore tracé en DB (pas de colonne battery_percent sur heartbeats). */
  batteryPercent: z.number().int().min(0).max(100).nullable()
    .describe('Niveau batterie 0..100. Toujours null tant que le firmware ne le pousse pas.'),
  lastSeenAt: z.string().datetime().nullable()
    .describe('Dernier heartbeat MQTT reçu. Null = jamais vu en ligne.'),
})

const NearbyDistributorDTO = DistributorDTO.extend({
  distanceKm: z.number().min(0).describe('Distance Haversine depuis (lat,lng) du query, en km'),
})

const NearbyQuery = z.object({
  lat:       z.coerce.number().min(-90).max(90).describe('Latitude WGS84 du point de référence'),
  lng:       z.coerce.number().min(-180).max(180).describe('Longitude WGS84 du point de référence'),
  radius_km: z.coerce.number().positive().max(500).default(5).describe('Rayon de recherche en km (défaut 5, max 500)'),
})

const CreateDistributorBody = z.object({
  serialNumber: z.string().min(3).max(40).describe('Numéro de série gravé (unique, doit matcher le firmware)'),
  communeId:    z.string().uuid().describe('Tenant propriétaire (admin scopé = doit matcher son communeId)'),
  name:         z.string().min(1).max(120).describe('Nom d\'affichage'),
  latitude:     z.number().min(-90).max(90).nullable().optional(),
  longitude:    z.number().min(-180).max(180).nullable().optional(),
  addressLine:  z.string().max(200).nullable().optional().describe('Adresse postale (typiquement label BAN auto-rempli côté dashboard)'),
  lockerCount:  z.number().int().min(1).max(64).describe('Nombre de casiers physiques à créer (state=idle)'),
})

const UpdateDistributorBody = z.object({
  name:        z.string().min(1).max(120).optional(),
  status:      z.enum(['online', 'offline', 'maintenance', 'decommissioned']).optional(),
  latitude:    z.number().min(-90).max(90).nullable().optional(),
  longitude:   z.number().min(-180).max(180).nullable().optional(),
  addressLine: z.string().max(200).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'at_least_one_field_required',
})

const ErrorDTO = z.object({ error: z.string() })

export async function distributorRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/distributors — liste paginée du parc (limit 200), incluant lat/lng
   * et le compte de casiers idle (sous-requête COUNT).
   */
  app.get('/', {
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Liste paginée du parc de distributeurs',
      description: 'Renvoie jusqu\'à 200 distributeurs avec leur géolocalisation et le nombre de casiers disponibles. '
        + 'Route publique (pas d\'auth). Pour la recherche par proximité, préférer `GET /nearby`.',
      response: { 200: z.object({ items: z.array(DistributorDTO) }) },
    },
  }, async () => {
    const idleCount = sql<number>`(
      SELECT COUNT(*)::int FROM lockers
      WHERE lockers.distributor_id = distributors.id
        AND lockers.state = 'idle'
    )`.as('idle_lockers')

    const rows = await db
      .select({
        id: distributors.id,
        serialNumber: distributors.serialNumber,
        name: distributors.name,
        status: distributors.status,
        communeId: distributors.communeId,
        lockerCount: distributors.lockerCount,
        latitude: distributors.latitude,
        longitude: distributors.longitude,
        addressLine: distributors.addressLine,
        lastSeenAt: distributors.lastSeenAt,
        idleLockers: idleCount,
      })
      .from(distributors)
      .limit(200)

    return {
      items: rows.map((d) => ({
        id: d.id,
        serialNumber: d.serialNumber,
        name: d.name,
        status: d.status,
        communeId: d.communeId,
        lockerCount: d.lockerCount,
        idleLockers: d.idleLockers,
        latitude: d.latitude,
        longitude: d.longitude,
        addressLine: d.addressLine,
        batteryPercent: null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      })),
    }
  })

  /**
   * GET /v1/distributors/nearby — distributeurs dans un rayon `radius_km`
   * autour de (lat,lng), tri par distance croissante. Haversine SQL pur.
   *
   * Postgres vanilla : pas d'extension earthdistance (cf. migration 0003).
   * Le GREATEST/LEAST clamp évite acos(>1) en bord d'arrondi flottant.
   */
  app.get('/nearby', {
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Distributeurs autour d\'un point (haversine SQL)',
      description: 'Route publique consommée par la carte de l\'app mobile.\n\n'
        + '**Exemple** : `GET /v1/distributors/nearby?lat=48.8566&lng=2.3522&radius_km=2` renvoie '
        + 'les distributeurs dans un rayon de 2km autour du centre de Paris, triés par distance croissante. '
        + 'Limite dure 100 résultats. Postgres vanilla (pas d\'extension earthdistance/postgis).',
      querystring: NearbyQuery,
      response: { 200: z.object({ items: z.array(NearbyDistributorDTO) }) },
    },
  }, async (req) => {
    const { lat, lng, radius_km } = req.query

    const distanceExpr = sql<number>`(
      6371 * acos(
        GREATEST(-1, LEAST(1,
          cos(radians(${lat})) * cos(radians(${distributors.latitude}))
          * cos(radians(${distributors.longitude}) - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(${distributors.latitude}))
        ))
      )
    )`

    const idleCount = sql<number>`(
      SELECT COUNT(*)::int FROM lockers
      WHERE lockers.distributor_id = distributors.id
        AND lockers.state = 'idle'
    )`.as('idle_lockers')

    const rows = await db
      .select({
        id: distributors.id,
        serialNumber: distributors.serialNumber,
        name: distributors.name,
        status: distributors.status,
        communeId: distributors.communeId,
        lockerCount: distributors.lockerCount,
        latitude: distributors.latitude,
        longitude: distributors.longitude,
        addressLine: distributors.addressLine,
        lastSeenAt: distributors.lastSeenAt,
        idleLockers: idleCount,
        distanceKm: distanceExpr.as('distance_km'),
      })
      .from(distributors)
      .where(sql`
        ${distributors.latitude} IS NOT NULL
        AND ${distributors.longitude} IS NOT NULL
        AND ${distanceExpr} <= ${radius_km}
      `)
      .orderBy(distanceExpr)
      .limit(100)

    return {
      items: rows.map((d) => ({
        id: d.id,
        serialNumber: d.serialNumber,
        name: d.name,
        status: d.status,
        communeId: d.communeId,
        lockerCount: d.lockerCount,
        idleLockers: d.idleLockers,
        latitude: d.latitude,
        longitude: d.longitude,
        addressLine: d.addressLine,
        batteryPercent: null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        distanceKm: d.distanceKm,
      })),
    }
  })

  /**
   * GET /v1/distributors/:id — détail + casiers du distributeur.
   */
  app.get('/:id', {
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Détail d\'un distributeur + casiers',
      description: 'Renvoie le distributeur et la liste de ses casiers (position, state, item courant). '
        + 'Public (pas d\'auth). Utilisé par l\'écran "détail borne" de l\'app mobile.',
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: DistributorDTO.extend({
          lockers: z.array(z.object({
            id: z.string().uuid(),
            position: z.number().int().describe('Index physique du casier dans la borne (0..N-1)'),
            state: z.enum(['idle', 'reserved', 'active', 'returning', 'fault'])
              .describe('État machine du casier (cf. règles métier)'),
            currentItemId: z.string().uuid().nullable()
              .describe('Item physiquement présent dans le casier, null si vide'),
            itemType: z.object({
              id: z.string().uuid(),
              slug: z.string(),
              name: z.string(),
              category: z.string(),
              imageUrl: z.string().nullable(),
            }).nullable().describe('Type du matériel actuellement dans le casier (null si vide)'),
          })),
        }),
        404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const found = await db.select().from(distributors).where(eq(distributors.id, req.params.id)).limit(1)
    if (found.length === 0) return reply.code(404).send({ error: 'distributor_not_found' })

    const d = found[0]!
    // LEFT JOIN sur items + item_types pour exposer ce qui est chargé
    // dans chaque casier. Permet à l'app d'afficher "Ballon de foot · 3 dispos".
    const lockerRows = await db
      .select({
        id: lockers.id,
        position: lockers.position,
        state: lockers.state,
        currentItemId: lockers.currentItemId,
        itemTypeId: itemTypes.id,
        itemTypeSlug: itemTypes.slug,
        itemTypeName: itemTypes.name,
        itemTypeCategory: itemTypes.category,
        itemTypeImageUrl: itemTypes.imageUrl,
      })
      .from(lockers)
      .leftJoin(items, eq(lockers.currentItemId, items.id))
      .leftJoin(itemTypes, eq(items.itemTypeId, itemTypes.id))
      .where(eq(lockers.distributorId, d.id))
      .orderBy(lockers.position)

    const idleLockers = lockerRows.filter((l) => l.state === 'idle').length

    return {
      id: d.id,
      serialNumber: d.serialNumber,
      name: d.name,
      status: d.status,
      communeId: d.communeId,
      lockerCount: d.lockerCount,
      idleLockers,
      latitude: d.latitude,
      longitude: d.longitude,
      addressLine: d.addressLine,
      batteryPercent: null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      lockers: lockerRows.map((l) => ({
        id: l.id,
        position: l.position,
        state: l.state,
        currentItemId: l.currentItemId,
        itemType: l.itemTypeId
          ? {
              id: l.itemTypeId,
              slug: l.itemTypeSlug!,
              name: l.itemTypeName!,
              category: l.itemTypeCategory!,
              imageUrl: l.itemTypeImageUrl,
            }
          : null,
      })),
    }
  })

  /**
   * GET /v1/distributors/:id/availability — grille de slots dispos sur J→J+7.
   *
   * Pour chaque créneau aligné sur la granularité 30 min (slot durée 30/60/90/120),
   * indique si au moins un item du `itemTypeId` demandé est libre pendant la
   * fenêtre `[startsAt, endsAt)` sur ce distributeur, et le prix d'affichage
   * (depuis `pricing_rules` scopé commune du distributeur).
   *
   * Implémentation : 2 queries (items + reservations chevauchant) puis calcul
   * en mémoire, plutôt que N queries (une par slot). Acceptable pour MAX 7
   * jours × ~30 slots/jour = ~200 lignes.
   */
  app.get('/:id/availability', {
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Grille de slots dispos pour un sport et une durée',
      description:
        `Génère les créneaux 30 min alignés (06:00→22:00 UTC par défaut) sur la plage `
        + `[from, to] (max ${MAX_BOOKING_HORIZON_DAYS} jours). Pour chaque slot, retourne `
        + '`available` (au moins un item libre) et `priceCents` (depuis `pricing_rules`, '
        + 'null si pas de règle = créneau non réservable).\n\n'
        + 'Route publique : permet à un citoyen non logué de regarder les dispos. '
        + 'Création de la résa nécessitera ensuite `POST /v1/reservations` (authentifié).',
      params: z.object({ id: z.string().uuid() }),
      querystring: z.object({
        itemTypeId: z.string().uuid().describe('Type de matériel souhaité (sport)'),
        durationMinutes: z.coerce.number().int()
          .refine((n) => [30, 60, 90, 120].includes(n), { message: 'duration_not_allowed' })
          .describe('Durée du créneau, valeurs autorisées : 30, 60, 90, 120'),
        from: z.string().datetime({ offset: true }).optional()
          .describe('Début de la fenêtre (ISO 8601, défaut = maintenant)'),
        to: z.string().datetime({ offset: true }).optional()
          .describe(`Fin de la fenêtre (ISO 8601, défaut = from + ${MAX_BOOKING_HORIZON_DAYS} jours)`),
      }),
      response: {
        200: z.object({
          distributorId: z.string().uuid(),
          itemTypeId: z.string().uuid(),
          durationMinutes: z.number().int(),
          days: z.record(z.string(), z.array(z.object({
            startsAt: z.string().datetime(),
            endsAt: z.string().datetime(),
            durationMinutes: z.number().int(),
            available: z.boolean(),
            priceCents: z.number().int().nonnegative().nullable(),
          }))),
        }),
        404: ErrorDTO,
        422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const { id: distributorId } = req.params
    const { itemTypeId, durationMinutes } = req.query
    const duration = durationMinutes as SlotDurationMinutes

    const [dist] = await db
      .select({ id: distributors.id, communeId: distributors.communeId })
      .from(distributors)
      .where(eq(distributors.id, distributorId))
      .limit(1)
    if (!dist) return reply.code(404).send({ error: 'distributor_not_found' })

    // Fenêtre [from, to]. On normalise au début du jour UTC pour énumérer
    // toute la grille du dernier jour inclus. Cap à J+MAX pour éviter qu'un
    // client malicieux demande 365 jours et fasse du DOS PG.
    const now = new Date()
    const from = req.query.from ? new Date(req.query.from) : now
    const horizonMs = now.getTime() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000
    const requestedTo = req.query.to ? new Date(req.query.to).getTime() : horizonMs
    const to = new Date(Math.min(requestedTo, horizonMs))
    if (to.getTime() <= from.getTime()) {
      return reply.code(422).send({ error: 'invalid_window' })
    }

    const fromDayUtc = new Date(Date.UTC(
      from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    ))
    const toDayUtc = new Date(Date.UTC(
      to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(),
    ))

    // 1) Items du type demandé physiquement présents sur ce distributeur.
    //    Le join via lockers évite de compter les items "en transit".
    const itemRows = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(lockers, eq(items.currentLockerId, lockers.id))
      .where(and(
        eq(lockers.distributorId, distributorId),
        eq(items.itemTypeId, itemTypeId),
      ))
    const itemIds = itemRows.map((r) => r.id)
    const itemCount = itemIds.length

    // 2) Réservations "vivantes" qui occupent ces items sur la fenêtre.
    //    Critère overlap : slot_start_at < to AND slot_end_at > from.
    type ResRow = { itemId: string; slotStartAt: Date; slotEndAt: Date }
    const liveReservations: ResRow[] = itemCount === 0
      ? []
      : (await db
        .select({
          itemId: reservations.itemId,
          slotStartAt: reservations.slotStartAt,
          slotEndAt: reservations.slotEndAt,
        })
        .from(reservations)
        .where(and(
          inArray(reservations.itemId, itemIds),
          inArray(reservations.status, ['scheduled', 'pending', 'active']),
          // Overlap test : début de la résa avant fin de la fenêtre, ET fin
          // de la résa après début de la fenêtre. NULL impossibles côté
          // scheduled (CHECK reservations_slot_range_check), mais filtre
          // défensif pour les résas legacy.
          sql`${reservations.slotStartAt} IS NOT NULL`,
          sql`${reservations.slotEndAt} IS NOT NULL`,
          lt(reservations.slotStartAt, to),
          gte(reservations.slotEndAt, fromDayUtc),
        ))).map((r) => ({
          itemId: r.itemId,
          slotStartAt: r.slotStartAt!,
          slotEndAt: r.slotEndAt!,
        }))

    // 3) Tarif unique pour (commune × item_type × duration). Une seule ligne
    //    par triplet (UNIQUE en DB).
    const [price] = await db
      .select({ priceCents: pricingRules.priceCents })
      .from(pricingRules)
      .where(and(
        eq(pricingRules.communeId, dist.communeId),
        eq(pricingRules.itemTypeId, itemTypeId),
        eq(pricingRules.durationMinutes, duration),
      ))
      .limit(1)
    const priceCents = price?.priceCents ?? null

    // 4) Énumération en mémoire des slots de la fenêtre + check overlap.
    //    Si fromDayUtc != aujourd'hui, le premier jour aura ses heures
    //    passées marquées simplement comme "in past" → on les filtre.
    const slotStarts = enumerateSlotStarts({
      fromDayUtc,
      toDayUtcInclusive: toDayUtc,
      durationMinutes: duration,
    })

    const days: Record<string, Array<{
      startsAt: string
      endsAt: string
      durationMinutes: number
      available: boolean
      priceCents: number | null
    }>> = {}

    for (const start of slotStarts) {
      if (start.getTime() <= now.getTime()) continue
      const end = computeSlotEnd(start, duration)
      const day = isoUtcDay(start)

      // Compte les items occupés sur ce slot précis. Available = au moins
      // un item physique sans résa overlap. priceCents null => non
      // réservable (mais on affiche quand même la grille pour que l'UI
      // explique "configuration manquante").
      let busyItems = 0
      const seenBusy = new Set<string>()
      for (const r of liveReservations) {
        if (r.slotStartAt.getTime() < end.getTime() && r.slotEndAt.getTime() > start.getTime()) {
          if (!seenBusy.has(r.itemId)) {
            seenBusy.add(r.itemId)
            busyItems++
          }
        }
      }
      const available = priceCents !== null && busyItems < itemCount

      days[day] ??= []
      days[day]!.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMinutes: duration,
        available,
        priceCents,
      })
    }

    return {
      distributorId,
      itemTypeId,
      durationMinutes: duration,
      days,
    }
  })

  /**
   * POST /v1/distributors — création admin. Crée le distributeur ET ses
   * N casiers (position 0..N-1, state=idle) dans une transaction.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Crée un distributeur + ses casiers (admin)',
      description: 'Admin ou super_admin. Crée le distributeur et N casiers (state=idle) dans une transaction. '
        + 'Un admin scopé ne peut créer que dans sa propre commune (`communeId` doit matcher le scope).\n\n'
        + 'Erreurs : 409 `serial_number_conflict` si serialNumber déjà pris · 404 `commune_not_found` si FK invalide.',
      security: [{ bearerAuth: [] }],
      body: CreateDistributorBody,
      response: {
        201: DistributorDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const body = req.body

    // Admin scoped : ne peut créer que dans sa propre commune.
    if (auth.scope && body.communeId !== auth.scope.communeId) {
      return reply.code(403).send({ error: 'forbidden_cross_commune' })
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [d] = await tx
          .insert(distributors)
          .values({
            serialNumber: body.serialNumber,
            communeId:    body.communeId,
            name:         body.name,
            latitude:     body.latitude ?? null,
            longitude:    body.longitude ?? null,
            addressLine:  body.addressLine ?? null,
            lockerCount:  body.lockerCount,
          })
          .returning()

        const lockerRows = Array.from({ length: body.lockerCount }, (_, i) => ({
          distributorId: d!.id,
          position: i,
          state: 'idle' as const,
        }))
        await tx.insert(lockers).values(lockerRows)

        return d!
      })

      return reply.code(201).send({
        id: created.id,
        serialNumber: created.serialNumber,
        name: created.name,
        status: created.status,
        communeId: created.communeId,
        lockerCount: created.lockerCount,
        idleLockers: created.lockerCount,
        latitude: created.latitude,
        longitude: created.longitude,
        addressLine: created.addressLine,
        batteryPercent: null,
        lastSeenAt: created.lastSeenAt?.toISOString() ?? null,
      })
    } catch (err) {
      // Codes SQLSTATE robustes vs Drizzle 0.30/0.45+ (cf. lib/pg-errors.ts)
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'serial')) {
        return reply.code(409).send({ error: 'serial_number_conflict' })
      }
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION, 'commune')) {
        return reply.code(404).send({ error: 'commune_not_found' })
      }
      throw err
    }
  })

  /**
   * PUT /v1/distributors/:id — mise à jour admin (name, status, lat, lng).
   * locker_count NON modifiable (impacte la structure physique du distributeur).
   */
  app.put('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Distributeurs'],
      summary: 'Mise à jour partielle d\'un distributeur (admin)',
      description: 'Modifie name / status / latitude / longitude. `lockerCount` non modifiable '
        + '(structure physique). Admin scopé : 404 si le distributeur n\'est pas dans sa commune.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: UpdateDistributorBody,
      response: {
        200: DistributorDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Admin scoped : 404 si le distributeur n'existe pas OU n'est pas dans sa commune.
    if (auth.scope) {
      const [check] = await db
        .select({ communeId: distributors.communeId })
        .from(distributors)
        .where(eq(distributors.id, req.params.id))
        .limit(1)
      if (!check || check.communeId !== auth.scope.communeId) {
        return reply.code(404).send({ error: 'distributor_not_found' })
      }
    }

    const body = req.body
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined)        update['name'] = body.name
    if (body.status !== undefined)      update['status'] = body.status
    if (body.latitude !== undefined)    update['latitude'] = body.latitude
    if (body.longitude !== undefined)   update['longitude'] = body.longitude
    if (body.addressLine !== undefined) update['addressLine'] = body.addressLine

    const [updated] = await db
      .update(distributors)
      .set(update)
      .where(eq(distributors.id, req.params.id))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'distributor_not_found' })

    const [idle] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(lockers)
      .where(and(eq(lockers.distributorId, updated.id), eq(lockers.state, 'idle')))

    return {
      id: updated.id,
      serialNumber: updated.serialNumber,
      name: updated.name,
      status: updated.status,
      communeId: updated.communeId,
      lockerCount: updated.lockerCount,
      idleLockers: idle?.count ?? 0,
      latitude: updated.latitude,
      longitude: updated.longitude,
      addressLine: updated.addressLine,
      batteryPercent: null,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
    }
  })
}
