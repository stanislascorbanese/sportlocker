/**
 * Helpers de seed pour les tests d'intégration qui agrègent des réservations
 * (stats / dashboard / reporting). On évite de dupliquer la cinquantaine
 * d'INSERTs nécessaires pour avoir des données « intéressantes » à agréger.
 *
 * Conventions :
 *   - Tous les IDs sont des UUID v4 générés ici (pas de DEFAULT côté DB)
 *     pour que le test puisse les ré-utiliser dans ses assertions.
 *   - `pgSql` est un client `postgres` (pas Drizzle) — on suit le pattern
 *     existant dans `admin-auth.test.ts` / `reservations.test.ts`.
 *   - Les rangées de réservation peuvent forcer `created_at` (clé des
 *     agrégats time-series) ; un offset relatif en jours est fourni pour
 *     éviter de bricoler des Dates dans chaque test.
 */
import { randomUUID } from 'node:crypto'

import type postgres from 'postgres'

type PgSql = ReturnType<typeof postgres>

export type ReservationStatus =
  | 'pending'
  | 'active'
  | 'returned'
  | 'overdue'
  | 'cancelled'
  | 'expired'

export interface SeededCommune {
  id: string
  name: string
}

export interface SeededDistributor {
  id: string
  communeId: string
  name: string
  serialNumber: string
}

export interface SeededItemType {
  id: string
  name: string
}

export interface SeededItem {
  id: string
  itemTypeId: string
}

export interface SeededLocker {
  id: string
  distributorId: string
  position: number
}

export interface SeededUser {
  id: string
  role: 'citizen' | 'admin' | 'super_admin'
}

export interface ReservationFixturesResult {
  communes: SeededCommune[]
  distributors: SeededDistributor[]
  itemTypes: SeededItemType[]
  items: SeededItem[]
  lockers: SeededLocker[]
  user: SeededUser
  reservationIds: string[]
}

export interface SeedReservationSpec {
  /** Distributeur cible (par index dans `distributors`). */
  distributorIdx: number
  /** Item cible (par index dans `items`). */
  itemIdx: number
  /** Statut final écrit en DB. */
  status: ReservationStatus
  /** Décalage en jours avant aujourd'hui pour `created_at` (0 = aujourd'hui). */
  daysAgo: number
  /** Heure (0–23) à utiliser pour `created_at`. Default 12h. */
  hour?: number
}

export interface SeedFixturesOptions {
  /**
   * Définit la « forme » du graphe :
   *   - 2 communes par défaut (A et B)
   *   - N distributeurs par commune (default 2 → 4 distributeurs)
   *   - 2 item_types par défaut (Ballon, Raquette)
   *   - 1 item par item_type par défaut (2 items)
   *   - 1 locker par distributeur par défaut
   */
  communeCount?: number
  distributorsPerCommune?: number
  itemTypeCount?: number
  itemsPerType?: number
}

/**
 * Seed minimal mais réaliste pour les tests stats :
 * - communes + distributeurs (scopés par commune)
 * - item_types + items (item_id -> item_type_id permet d'agréger topItemTypes)
 * - lockers (FK requise sur reservations)
 * - 1 user "citizen" qui possède toutes les réservations
 *
 * Les réservations elles-mêmes ne sont PAS insérées ici — voir
 * `seedReservations()` qui prend une liste de specs.
 */
export async function seedReservationFixtures(
  pgSql: PgSql,
  opts: SeedFixturesOptions = {},
): Promise<ReservationFixturesResult> {
  const communeCount = opts.communeCount ?? 2
  const distPerCommune = opts.distributorsPerCommune ?? 2
  const itemTypeCount = opts.itemTypeCount ?? 2
  const itemsPerType = opts.itemsPerType ?? 1

  const communes: SeededCommune[] = []
  for (let i = 0; i < communeCount; i++) {
    const id = randomUUID()
    const name = `Commune-${String.fromCharCode(65 + i)}` // A, B, C…
    const insee = String(70000 + Math.floor(Math.random() * 9999))
    await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
      VALUES (${id}, ${insee}, ${name}, '75001', '75', 'IDF')`
    communes.push({ id, name })
  }

  const distributors: SeededDistributor[] = []
  for (let c = 0; c < communes.length; c++) {
    for (let d = 0; d < distPerCommune; d++) {
      const id = randomUUID()
      const name = `Dist-${communes[c]!.name}-${d}`
      const serial = `SN-${id.slice(0, 8)}`
      await pgSql`INSERT INTO distributors
        (id, serial_number, commune_id, name, latitude, longitude, locker_count)
        VALUES (${id}, ${serial}, ${communes[c]!.id}, ${name}, 48.85, 2.35, 4)`
      distributors.push({ id, communeId: communes[c]!.id, name, serialNumber: serial })
    }
  }

  const itemTypes: SeededItemType[] = []
  const itemTypeNames = ['Ballon', 'Raquette', 'Frisbee', 'Volant', 'Filet']
  for (let i = 0; i < itemTypeCount; i++) {
    const id = randomUUID()
    const name = itemTypeNames[i] ?? `Type-${i}`
    await pgSql`INSERT INTO item_types (id, slug, name, category)
      VALUES (${id}, ${'slug-' + id.slice(0, 8)}, ${name}, 'sport')`
    itemTypes.push({ id, name })
  }

  const items: SeededItem[] = []
  for (const it of itemTypes) {
    for (let k = 0; k < itemsPerType; k++) {
      const id = randomUUID()
      await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
        VALUES (${id}, ${it.id}, ${'RFID-' + id.slice(0, 8)})`
      items.push({ id, itemTypeId: it.id })
    }
  }

  const lockers: SeededLocker[] = []
  for (const d of distributors) {
    const id = randomUUID()
    await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
      VALUES (${id}, ${d.id}, 0, 'idle')`
    lockers.push({ id, distributorId: d.id, position: 0 })
  }

  // User propriétaire des reservations — un seul suffit pour les agrégats stats.
  const userId = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)},
            ${userId.slice(0, 8) + '@test.local'}, 'citizen')`

  return {
    communes,
    distributors,
    itemTypes,
    items,
    lockers,
    user: { id: userId, role: 'citizen' },
    reservationIds: [],
  }
}

/**
 * Insère N réservations en forçant `created_at` (clé du `daily` series).
 * Renvoie les IDs créés, dans l'ordre des specs.
 */
/**
 * Liste des statuts couverts par l'index unique `idx_reservations_one_live_per_user`
 * (migration 0008). Le seeder doit allouer un user dédié pour chaque résa qui
 * tombe dans ces statuts, sinon la 2e violation déclenche un 23505.
 */
const LIVE_STATUSES = new Set(['scheduled', 'pending', 'active'])

export async function seedReservations(
  pgSql: PgSql,
  fixtures: ReservationFixturesResult,
  specs: SeedReservationSpec[],
): Promise<string[]> {
  const ids: string[] = []
  let liveCounter = 0
  for (const spec of specs) {
    const dist = fixtures.distributors[spec.distributorIdx]
    const item = fixtures.items[spec.itemIdx]
    if (!dist || !item) {
      throw new Error(
        `seedReservations: index hors limites (dist=${spec.distributorIdx}, item=${spec.itemIdx})`,
      )
    }
    // Trouve un locker rattaché à ce distributeur (le premier suffit pour la FK).
    const locker = fixtures.lockers.find((l) => l.distributorId === dist.id)
    if (!locker) {
      throw new Error(`seedReservations: aucun locker pour le distributeur ${dist.id}`)
    }

    // Anti-monopole : 1 résa "vivante" max par user (index partiel unique sur
    // scheduled/pending/active). On alloue un user dédié quand le statut est
    // dans ce set ; pour les statuts terminaux (returned/cancelled/expired/
    // overdue) on garde le user "principal" pour minimiser la pollution.
    let ownerId = fixtures.user.id
    if (LIVE_STATUSES.has(spec.status)) {
      ownerId = randomUUID()
      const short = ownerId.slice(0, 8)
      await pgSql`INSERT INTO users (id, firebase_uid, email, role)
        VALUES (${ownerId}, ${'fb-live-' + short + '-' + liveCounter},
                ${'live-' + short + '-' + liveCounter + '@test.local'}, 'citizen')`
      liveCounter++
    }

    const id = randomUUID()
    const jti = randomUUID()
    const hour = spec.hour ?? 12
    // `daysAgo` → expression SQL relative ; on combine avec une heure fixe pour
    // que les jours « voisins de minuit » ne basculent pas selon la TZ du runner.
    const days = spec.daysAgo
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, created_at)
      VALUES (
        ${id}, ${ownerId}, ${locker.id}, ${item.id}, ${dist.id},
        ${spec.status}::reservation_status, ${jti},
        NOW() + INTERVAL '15 minutes',
        date_trunc('day', NOW()) - (${days}::int * INTERVAL '1 day')
          + (${hour}::int * INTERVAL '1 hour')
      )`
    ids.push(id)
    fixtures.reservationIds.push(id)
  }
  return ids
}
