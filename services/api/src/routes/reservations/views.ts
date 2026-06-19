/**
 * Routes de lecture des réservations citoyennes — `GET /active` + `GET /me`.
 *
 * Extraites de `routes/reservations.ts` (audit dette tech §2). Read-only, pas
 * de transaction métier ni d'effet de bord — c'est le sous-module le moins
 * risqué à isoler en premier dans le split du fichier monolithique.
 *
 * Registered comme sous-plugin Fastify par `reservations.ts` via
 * `app.register(reservationViewsRoutes)`.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/client.js'
import {
  distributors, itemTypes, items, reservations,
} from '../../db/schema.js'
import { signDeviceToken } from '../../lib/jwt-device.js'

import {
  ErrorDTO, ReservationActiveEnrichedDTO, ReservationHistoryDTO,
} from './dtos.js'

export async function reservationViewsRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/reservations/active — résa "vivante" du citoyen courant.
   *
   * Renvoie au plus 1 row (cf. l'unique index `idx_reservations_one_active_per_user`
   * de la migration 0018). Joint distributeur + item type pour éviter au client
   * un round-trip supplémentaire, et re-signe un device JWT à TTL ajusté.
   *
   * Cas `pending_payment` : la réservation existe (slot + item tenus) mais
   * aucun QR n'est émis tant que le paiement n'a pas réussi. La PWA citizen
   * affiche alors l'écran de paiement Stripe au lieu du QR.
   */
  app.get('/active', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réservation scheduled/pending/active du citoyen courant',
      description: 'Renvoie la réservation vivante du user (au plus 1 par contrainte métier), '
        + 'enrichie avec le nom du distributeur, le type d\'item et un qrToken JWT prêt à scanner. '
        + '404 `no_active_reservation` si aucune.',
      security: [{ bearerAuth: [] }],
      response: { 200: ReservationActiveEnrichedDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const [row] = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        lockerId: reservations.lockerId,
        itemId: reservations.itemId,
        distributorId: reservations.distributorId,
        qrJti: reservations.qrJti,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        dueAt: reservations.dueAt,
        extensionCount: reservations.extensionCount,
        slotStartAt: reservations.slotStartAt,
        slotEndAt: reservations.slotEndAt,
        durationMinutes: reservations.durationMinutes,
        priceCents: reservations.priceCents,
        distributorName: distributors.name,
        distributorAddressLine: distributors.addressLine,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(and(
        eq(reservations.userId, req.user.sub),
        inArray(reservations.status, ['pending_payment', 'scheduled', 'pending', 'active']),
      ))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'no_active_reservation' })

    // Re-signe un device JWT avec le qr_jti stable. TTL = jusqu'à expiresAt
    // (clamp à 60s minimum pour éviter un token déjà expiré sur un edge case).
    // Embarque `slotStartAt` pour les résas scheduled — le firmware s'en sert
    // pour bloquer un scan trop tôt (cf. PR 0010 slot-aware check-in).
    //
    // Exception `pending_payment` : aucun QR tant que le paiement n'a pas
    // réussi. Le client affiche l'écran de paiement, pas le QR.
    const qrToken = row.status === 'pending_payment'
      ? null
      : await signDeviceToken({
        reservationId: row.id,
        lockerId: row.lockerId,
        distributorId: row.distributorId,
        ...(row.slotStartAt ? { slotStartAt: Math.floor(row.slotStartAt.getTime() / 1000) } : {}),
      }, Math.max(60, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000)), row.qrJti)

    return reply.code(200).send({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      extensionCount: row.extensionCount,
      qrToken,
      distributor: {
        id: row.distributorId,
        name: row.distributorName,
        addressLine: row.distributorAddressLine,
      },
      item: {
        id: row.itemId,
        typeName: row.itemTypeName,
      },
      slotStartAt: row.slotStartAt?.toISOString() ?? null,
      slotEndAt: row.slotEndAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      priceCents: row.priceCents,
    })
  })

  /**
   * GET /v1/reservations/me — historique de l'utilisateur courant.
   *
   * DTO enrichi (distributor.name, item.typeName, champs slot) pour permettre
   * à la page /profile citizen d'afficher la liste sans round-trip
   * supplémentaire. Trié createdAt DESC (la plus récente en premier).
   */
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Historique du citoyen courant',
      description: 'Renvoie les 50 dernières réservations du user authentifié, '
        + 'enrichies avec le nom du distributeur, le type d\'item et les champs slot, '
        + 'triées par createdAt DESC. Inclut les statuts terminaux (returned/cancelled/'
        + 'expired) en plus des vivants (scheduled/pending/active/overdue).',
      security: [{ bearerAuth: [] }],
      response: { 200: z.object({ items: z.array(ReservationHistoryDTO) }) },
    },
  }, async (req) => {
    const rows = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        dueAt: reservations.dueAt,
        openedAt: reservations.openedAt,
        returnedAt: reservations.returnedAt,
        extensionCount: reservations.extensionCount,
        slotStartAt: reservations.slotStartAt,
        slotEndAt: reservations.slotEndAt,
        durationMinutes: reservations.durationMinutes,
        priceCents: reservations.priceCents,
        distributorId: reservations.distributorId,
        distributorName: distributors.name,
        itemId: reservations.itemId,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(eq(reservations.userId, req.user.sub))
      .orderBy(desc(reservations.createdAt))
      .limit(50)

    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        dueAt: row.dueAt?.toISOString() ?? null,
        openedAt: row.openedAt?.toISOString() ?? null,
        returnedAt: row.returnedAt?.toISOString() ?? null,
        extensionCount: row.extensionCount,
        slotStartAt: row.slotStartAt?.toISOString() ?? null,
        slotEndAt: row.slotEndAt?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        priceCents: row.priceCents,
        distributor: { id: row.distributorId, name: row.distributorName },
        item: { id: row.itemId, typeName: row.itemTypeName },
      })),
    }
  })
}
