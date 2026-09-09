/**
 * Parcours vacancier — les cinq routes de `docs/API-VACANCIER.md`.
 *
 * Ce sont les seules routes du produit qu'un client final touche, et elles
 * n'ont ni compte, ni mot de passe, ni paiement. Ce qui fait foi est le couple
 * (numéro de séjour, nom de famille), que le camping a vérifié au check-in
 * pièce d'identité en main. On s'appuie sur cette vérification-là plutôt que
 * d'en inventer une deuxième.
 *
 * Le `stayId` renvoyé par /identify n'est pas un secret fort et n'a pas à
 * l'être : le seul pouvoir qu'il confère est d'ouvrir un casier de matériel de
 * sport, devant lequel il faut physiquement se trouver. Il est court (30 min),
 * lié à la borne, et meurt avec le séjour.
 *
 * Le serveur ne renvoie jamais de message utilisateur — seulement un code.
 * Les libellés français vivent dans l'app (apps/citizen/src/lib/contract.ts),
 * ce qui évite d'avoir deux endroits où corriger une tournure.
 */
import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors,
  itemTypes,
  items,
  loans,
  lockers,
  stays,
} from '../db/schema.js'
import { signDeviceToken, verifyDeviceToken } from '../lib/jwt-device.js'
import { LockerStuckError, openLocker } from '../lib/locker-open.js'

/** Durée de vie du `stayId` : le temps de choisir un ballon, pas davantage. */
const STAY_TOKEN_TTL_SEC = 30 * 60

/**
 * Pictogramme affiché par l'app. Il ne pilote que le dessin, jamais une règle
 * métier : un type inconnu tombe sur `autre` et reste empruntable.
 */
const KINDS = ['ballon', 'basket', 'volley', 'raquette', 'disque', 'plot', 'corde', 'boule', 'autre'] as const
type Kind = typeof KINDS[number]

/**
 * Déduit le pictogramme d'un type d'article. On regarde le slug puis le nom,
 * parce qu'un catalogue rempli par un camping contient autant « ballon-foot »
 * que « Ballon de football ».
 */
export function kindOf(slug: string, name: string): Kind {
  const h = `${slug} ${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/basket/.test(h)) return 'basket'
  if (/volley/.test(h)) return 'volley'
  if (/raquette|badminton|tennis|ping/.test(h)) return 'raquette'
  if (/frisbee|disque/.test(h)) return 'disque'
  if (/plot|cone|plots/.test(h)) return 'plot'
  if (/corde/.test(h)) return 'corde'
  if (/boule|petanque|molkky|molky/.test(h)) return 'boule'
  if (/ballon|football|foot|hand|rugby/.test(h)) return 'ballon'
  return 'autre'
}

/**
 * Comparaison de nom de famille : insensible à la casse, aux accents, aux
 * espaces et aux traits d'union. « de la Fontaine », « DE LA FONTAINE » et
 * « delafontaine » doivent passer — un vacancier qui tape son propre nom sur
 * un téléphone au soleil ne doit pas être renvoyé pour une apostrophe.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s'\u2019-]/g, '')
}

const KioskItem = z.object({
  itemTypeId: z.string().uuid(),
  label: z.string(),
  kind: z.enum(KINDS),
  available: z.number().int().nonnegative(),
})

const KioskState = z.object({
  serial: z.string(),
  siteName: z.string(),
  items: z.array(KioskItem),
})

const LoanView = z.object({
  id: z.string().uuid(),
  itemLabel: z.string(),
  kind: z.enum(KINDS),
  lockerNumber: z.number().int(),
  borrowedAt: z.string(),
  serial: z.string(),
  siteName: z.string(),
})

const err = <T extends string>(code: T) => z.object({ error: z.literal(code) })

/** Claims du `stayId`. Il est lié à une borne : il ne vaut pas ailleurs. */
interface StayTokenClaims {
  stayId: string
  distributorId: string
}

async function signStayToken(claims: StayTokenClaims): Promise<string> {
  // On réutilise la signature device : même secret, même vérification, et une
  // audience déjà comprise par le reste du code. Les champs sont détournés de
  // leur nom d'origine, d'où ce commentaire plutôt qu'un troisième schéma JWT.
  return signDeviceToken(
    { reservationId: claims.stayId, lockerId: claims.stayId, distributorId: claims.distributorId },
    STAY_TOKEN_TTL_SEC,
  )
}

async function readStayToken(token: string): Promise<StayTokenClaims | null> {
  try {
    const payload = await verifyDeviceToken(token)
    return { stayId: payload.reservationId, distributorId: payload.distributorId }
  } catch {
    return null
  }
}

/** Le format d'emprunt renvoyé par trois routes sur cinq. */
async function loadLoanView(loanId: string): Promise<z.infer<typeof LoanView> | null> {
  const [row] = await db
    .select({
      id: loans.id,
      borrowedAt: loans.borrowedAt,
      returnedAt: loans.returnedAt,
      position: lockers.position,
      typeName: itemTypes.name,
      typeSlug: itemTypes.slug,
      serial: distributors.serialNumber,
      siteName: distributors.name,
    })
    .from(loans)
    .innerJoin(lockers, eq(lockers.id, loans.lockerId))
    .innerJoin(items, eq(items.id, loans.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .innerJoin(distributors, eq(distributors.id, loans.distributorId))
    .where(eq(loans.id, loanId))
    .limit(1)

  if (!row || row.returnedAt !== null) return null

  return {
    id: row.id,
    itemLabel: row.typeName,
    kind: kindOf(row.typeSlug, row.typeName),
    // Le numéro peint sur la porte, pas la position en base : les casiers sont
    // stockés en 0..N-1 et étiquetés 1..N sur la machine.
    lockerNumber: row.position + 1,
    borrowedAt: row.borrowedAt.toISOString(),
    serial: row.serial,
    siteName: row.siteName,
  }
}

export async function kioskRoutes(app: FastifyInstance): Promise<void> {
  // ─── GET /:serial ────────────────────────────────────────────────────────
  app.get('/:serial', {
    schema: {
      tags: ['Kiosk'],
      summary: 'État public d\'une borne — ce qu\'elle contient, en un coup d\'œil.',
      params: z.object({ serial: z.string().min(1) }),
      response: { 200: KioskState, 404: err('kiosk_not_found') },
    },
  }, async (req, reply) => {
    const { serial } = req.params as { serial: string }

    const [kiosk] = await db
      .select({ id: distributors.id, serial: distributors.serialNumber, name: distributors.name })
      .from(distributors)
      .where(eq(distributors.serialNumber, serial))
      .limit(1)

    if (!kiosk) return reply.code(404).send({ error: 'kiosk_not_found' as const })

    // Un type d'article présent dans au moins un casier de cette borne, avec le
    // nombre d'exemplaires réellement posés. Les types à 0 sont renvoyés quand
    // même : l'app les grise, ce qui vaut mieux que de laisser croire qu'ils
    // n'existent pas — un vacancier qui ne voit pas « raquette » suppose que la
    // borne n'en propose pas, et n'y revient pas.
    const rows = await db
      .select({
        itemTypeId: itemTypes.id,
        label: itemTypes.name,
        slug: itemTypes.slug,
        available: sql<number>`count(${items.id})::int`,
      })
      .from(itemTypes)
      .leftJoin(
        items,
        and(
          eq(items.itemTypeId, itemTypes.id),
          sql`${items.currentLockerId} IN (SELECT id FROM lockers WHERE distributor_id = ${kiosk.id})`,
        ),
      )
      .groupBy(itemTypes.id, itemTypes.name, itemTypes.slug)
      .orderBy(itemTypes.name)

    return {
      serial: kiosk.serial,
      siteName: kiosk.name,
      items: rows.map((r) => ({
        itemTypeId: r.itemTypeId,
        label: r.label,
        kind: kindOf(r.slug, r.label),
        available: r.available,
      })),
    }
  })

  // ─── POST /:serial/identify ──────────────────────────────────────────────
  app.post('/:serial/identify', {
    config: {
      // Un numéro d'emplacement se devine en trois chiffres. La limite est par
      // IP et volontairement basse : un vacancier légitime s'identifie une fois
      // par emprunt, pas vingt fois par minute.
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
    schema: {
      tags: ['Kiosk'],
      summary: 'Échange (numéro de séjour, nom) contre un stayId de courte durée.',
      params: z.object({ serial: z.string().min(1) }),
      body: z.object({
        stayRef: z.string().min(1).max(32),
        lastName: z.string().min(1).max(120),
      }),
      response: {
        200: z.object({
          stayId: z.string(),
          guestName: z.string(),
          activeLoan: LoanView.nullable(),
        }),
        404: err('stay_not_found'),
      },
    },
  }, async (req, reply) => {
    const { serial } = req.params as { serial: string }
    const { stayRef, lastName } = req.body as { stayRef: string; lastName: string }

    const [kiosk] = await db
      .select({ id: distributors.id, communeId: distributors.communeId })
      .from(distributors)
      .where(eq(distributors.serialNumber, serial))
      .limit(1)

    if (!kiosk) return reply.code(404).send({ error: 'kiosk_not_found' as const })

    // On filtre en SQL sur la référence (indexée), et on compare le nom en
    // mémoire : la normalisation accents/apostrophes est plus lisible en JS
    // qu'en SQL, et il n'y a jamais qu'une poignée de lignes par référence.
    const today = new Date().toISOString().slice(0, 10)
    const candidates = await db
      .select({
        id: stays.id,
        lastName: stays.lastName,
        firstName: stays.firstName,
      })
      .from(stays)
      .where(and(
        eq(stays.communeId, kiosk.communeId),
        eq(stays.stayRef, stayRef.trim()),
        // Séjour encore en cours : un client parti ne rouvre plus de casier.
        sql`${stays.departsOn} >= ${today}`,
        sql`${stays.arrivesOn} <= ${today}`,
      ))

    const wanted = normalizeName(lastName)
    const stay = candidates.find((c) => normalizeName(c.lastName) === wanted)
    if (!stay) return reply.code(404).send({ error: 'stay_not_found' as const })

    const [live] = await db
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.stayId, stay.id), isNull(loans.returnedAt)))
      .limit(1)

    return {
      stayId: await signStayToken({ stayId: stay.id, distributorId: kiosk.id }),
      guestName: [stay.firstName, stay.lastName].filter(Boolean).join(' '),
      activeLoan: live ? await loadLoanView(live.id) : null,
    }
  })

  // ─── POST /:serial/loans ─────────────────────────────────────────────────
  app.post('/:serial/loans', {
    schema: {
      tags: ['Kiosk'],
      summary: 'Ouvre un casier contenant l\'article demandé et enregistre l\'emprunt.',
      params: z.object({ serial: z.string().min(1) }),
      body: z.object({
        stayId: z.string().min(1),
        itemTypeId: z.string().uuid(),
      }),
      response: {
        200: LoanView,
        401: err('stay_not_found'),
        404: err('kiosk_not_found'),
        409: z.union([err('item_unavailable'), err('loan_already_active')]),
        502: err('locker_stuck'),
      },
    },
  }, async (req, reply) => {
    const { serial } = req.params as { serial: string }
    const { stayId, itemTypeId } = req.body as { stayId: string; itemTypeId: string }

    const claims = await readStayToken(stayId)
    if (!claims) return reply.code(401).send({ error: 'stay_not_found' as const })

    const [kiosk] = await db
      .select({ id: distributors.id })
      .from(distributors)
      .where(eq(distributors.serialNumber, serial))
      .limit(1)

    if (!kiosk) return reply.code(404).send({ error: 'kiosk_not_found' as const })
    // Le jeton vaut pour la borne devant laquelle il a été obtenu.
    if (kiosk.id !== claims.distributorId) {
      return reply.code(401).send({ error: 'stay_not_found' as const })
    }

    const [live] = await db
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.stayId, claims.stayId), isNull(loans.returnedAt)))
      .limit(1)

    if (live) return reply.code(409).send({ error: 'loan_already_active' as const })

    // Un casier de cette borne qui contient un exemplaire du type demandé, et
    // dont l'exemplaire n'est pas déjà dehors.
    const [candidate] = await db
      .select({ lockerId: lockers.id, itemId: items.id })
      .from(lockers)
      .innerJoin(items, eq(items.id, lockers.currentItemId))
      .where(and(
        eq(lockers.distributorId, kiosk.id),
        eq(items.itemTypeId, itemTypeId),
        eq(lockers.state, 'idle'),
        sql`NOT EXISTS (SELECT 1 FROM loans l WHERE l.item_id = ${items.id} AND l.returned_at IS NULL)`,
      ))
      .limit(1)

    if (!candidate) return reply.code(409).send({ error: 'item_unavailable' as const })

    // L'identifiant de l'emprunt est tiré avant l'ouverture : il voyage dans le
    // jeton envoyé à la borne, et l'événement de confirmation le renvoie. On
    // n'insère la ligne qu'une fois la porte ouverte — un emprunt enregistré
    // pour une porte restée close ferait porter au vacancier une dette qu'il
    // n'a pas contractée.
    const loanId = randomUUID()

    try {
      await openLocker({
        client: app.mqttSubscriber,
        distributorId: kiosk.id,
        lockerId: candidate.lockerId,
        openingId: loanId,
      })
    } catch (e) {
      if (e instanceof LockerStuckError) {
        return reply.code(502).send({ error: 'locker_stuck' as const })
      }
      throw e
    }

    try {
      await db.insert(loans).values({
        id: loanId,
        stayId: claims.stayId,
        distributorId: kiosk.id,
        lockerId: candidate.lockerId,
        itemId: candidate.itemId,
      })
    } catch {
      // L'index unique partiel a tranché : deux requêtes simultanées pour le
      // même séjour, ou le même article. Le premier a gagné.
      return reply.code(409).send({ error: 'loan_already_active' as const })
    }

    await db
      .update(lockers)
      .set({ state: 'active', currentItemId: null, lastStateAt: new Date() })
      .where(eq(lockers.id, candidate.lockerId))

    await db
      .update(items)
      .set({ currentLockerId: null, totalLoans: sql`${items.totalLoans} + 1` })
      .where(eq(items.id, candidate.itemId))

    const view = await loadLoanView(loanId)
    if (!view) return reply.code(502).send({ error: 'locker_stuck' as const })
    return view
  })

  // ─── GET /loans/:loanId ──────────────────────────────────────────────────
  app.get('/loans/:loanId', {
    schema: {
      tags: ['Kiosk'],
      summary: 'État d\'un emprunt en cours.',
      params: z.object({ loanId: z.string().uuid() }),
      response: { 200: LoanView, 404: err('loan_not_found') },
    },
  }, async (req, reply) => {
    const { loanId } = req.params as { loanId: string }
    const view = await loadLoanView(loanId)
    // Emprunt clôturé : l'app efface sa trace locale sans afficher d'erreur.
    if (!view) return reply.code(404).send({ error: 'loan_not_found' as const })
    return view
  })

  // ─── POST /loans/:loanId/return ──────────────────────────────────────────
  app.post('/loans/:loanId/return', {
    schema: {
      tags: ['Kiosk'],
      summary: 'Ouvre un casier libre pour le dépôt et clôture l\'emprunt.',
      params: z.object({ loanId: z.string().uuid() }),
      response: {
        200: z.object({ lockerNumber: z.number().int() }),
        404: err('loan_not_found'),
        409: err('no_free_locker'),
        502: err('locker_stuck'),
      },
    },
  }, async (req, reply) => {
    const { loanId } = req.params as { loanId: string }

    const [loan] = await db
      .select({
        id: loans.id,
        itemId: loans.itemId,
        distributorId: loans.distributorId,
        returnedAt: loans.returnedAt,
      })
      .from(loans)
      .where(eq(loans.id, loanId))
      .limit(1)

    if (!loan || loan.returnedAt !== null) {
      return reply.code(404).send({ error: 'loan_not_found' as const })
    }

    // On rend où il y a de la place, pas forcément là où on a pris. Le premier
    // casier libre et vide fait l'affaire ; l'ordre par position rend le
    // comportement prévisible pour le saisonnier qui fait le tour ensuite.
    const [free] = await db
      .select({ id: lockers.id, position: lockers.position })
      .from(lockers)
      .where(and(
        eq(lockers.distributorId, loan.distributorId),
        eq(lockers.state, 'active'),
        isNull(lockers.currentItemId),
      ))
      .orderBy(lockers.position)
      .limit(1)

    const target = free ?? (await db
      .select({ id: lockers.id, position: lockers.position })
      .from(lockers)
      .where(and(
        eq(lockers.distributorId, loan.distributorId),
        eq(lockers.state, 'idle'),
        isNull(lockers.currentItemId),
      ))
      .orderBy(lockers.position)
      .limit(1))[0]

    if (!target) return reply.code(409).send({ error: 'no_free_locker' as const })

    try {
      await openLocker({
        client: app.mqttSubscriber,
        distributorId: loan.distributorId,
        lockerId: target.id,
        openingId: loan.id,
      })
    } catch (e) {
      if (e instanceof LockerStuckError) {
        return reply.code(502).send({ error: 'locker_stuck' as const })
      }
      throw e
    }

    await db
      .update(loans)
      .set({ returnedAt: new Date(), returnLockerId: target.id, updatedAt: new Date() })
      .where(eq(loans.id, loan.id))

    // L'article est de nouveau dans la borne. Le capteur de fermeture confirmera
    // la porte ; on n'attend pas ce signal pour rendre la main au vacancier, qui
    // est déjà reparti jouer.
    await db
      .update(lockers)
      .set({ state: 'idle', currentItemId: loan.itemId, lastStateAt: new Date() })
      .where(eq(lockers.id, target.id))

    await db
      .update(items)
      .set({ currentLockerId: target.id })
      .where(eq(items.id, loan.itemId))

    return { lockerNumber: target.position + 1 }
  })
}
