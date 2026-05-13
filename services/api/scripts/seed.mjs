#!/usr/bin/env node
/**
 * Seed idempotent pour la DB SportLocker.
 *
 * Re-run safe : tous les inserts utilisent ON CONFLICT DO UPDATE sur la
 * clé naturelle de chaque table (insee_code, slug, serial_number, rfid_tag,
 * firebase_uid, lockers(distributor_id, position)) — relancer le script ne
 * crée jamais de doublon et ne casse pas les FK existantes.
 *
 * Usage :
 *   pnpm --filter @sportlocker/api db:seed
 *   ou : DATABASE_URL=postgres://... node ./scripts/seed.mjs
 *
 * Dataset (Paris) :
 *   - 1 commune (Paris 75056)
 *   - 4 item_types (foot, basket, raquette, frisbee)
 *   - 2 users de test (citizen + admin)
 *   - 3 distributeurs (Châtelet, République, Bastille) avec 4/6/8 casiers
 *   - 1 item par casier, state = idle
 */
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[seed] DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 })

const COMMUNE = {
  insee_code: '75056',
  name: 'Paris',
  postal_code: '75001',
  department: '75',
  region: 'Île-de-France',
}

const ITEM_TYPES = [
  { slug: 'ballon-foot',     name: 'Ballon de foot',     category: 'ballon' },
  { slug: 'ballon-basket',   name: 'Ballon de basket',   category: 'ballon' },
  { slug: 'raquette-tennis', name: 'Raquette de tennis', category: 'raquette' },
  { slug: 'frisbee',         name: 'Frisbee',            category: 'autre' },
]

const USERS = [
  {
    firebase_uid: 'seed-user-citizen',
    email:        'citizen@sportlocker.test',
    display_name: 'Citizen Test',
    role:         'citizen',
  },
  {
    firebase_uid: 'seed-user-admin',
    email:        'admin@sportlocker.test',
    display_name: 'Admin Test',
    role:         'admin',
  },
]

const DISTRIBUTORS = [
  {
    serial_number: 'SL-CHATELET-001',
    name:          'Distributeur Châtelet',
    latitude:      48.8581,
    longitude:     2.3470,
    lockerLayout: ['ballon-foot', 'ballon-basket', 'raquette-tennis', 'frisbee'],
  },
  {
    serial_number: 'SL-REPUBLIQUE-001',
    name:          'Distributeur République',
    latitude:      48.8676,
    longitude:     2.3631,
    lockerLayout: [
      'ballon-foot', 'ballon-foot',
      'ballon-basket', 'ballon-basket',
      'raquette-tennis', 'frisbee',
    ],
  },
  {
    serial_number: 'SL-BASTILLE-001',
    name:          'Distributeur Bastille',
    latitude:      48.8532,
    longitude:     2.3692,
    lockerLayout: [
      'ballon-foot', 'ballon-foot', 'ballon-foot',
      'ballon-basket', 'ballon-basket',
      'raquette-tennis', 'raquette-tennis',
      'frisbee',
    ],
  },
]

async function upsertCommune() {
  const [row] = await sql`
    INSERT INTO communes (insee_code, name, postal_code, department, region)
    VALUES (${COMMUNE.insee_code}, ${COMMUNE.name}, ${COMMUNE.postal_code},
            ${COMMUNE.department}, ${COMMUNE.region})
    ON CONFLICT (insee_code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  return row.id
}

async function upsertItemTypes() {
  const ids = {}
  for (const t of ITEM_TYPES) {
    const [row] = await sql`
      INSERT INTO item_types (slug, name, category)
      VALUES (${t.slug}, ${t.name}, ${t.category})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    ids[t.slug] = row.id
  }
  return ids
}

async function upsertUsers() {
  for (const u of USERS) {
    await sql`
      INSERT INTO users (firebase_uid, email, display_name, role)
      VALUES (${u.firebase_uid}, ${u.email}, ${u.display_name}, ${u.role})
      ON CONFLICT (firebase_uid) DO UPDATE SET role = EXCLUDED.role
    `
  }
}

async function upsertDistributor(d, communeId) {
  const [row] = await sql`
    INSERT INTO distributors
      (serial_number, commune_id, name, latitude, longitude, locker_count, status)
    VALUES (${d.serial_number}, ${communeId}, ${d.name},
            ${d.latitude}, ${d.longitude}, ${d.lockerLayout.length}, 'online')
    ON CONFLICT (serial_number) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  return row.id
}

/**
 * Item DOIT être inséré AVANT le locker car lockers.current_item_id est une
 * FK vers items.id (ALTER TABLE après items dans schema.sql).
 */
async function upsertLockerAndItem(distributorId, position, itemTypeId, distSerial) {
  const rfid = `RFID-${distSerial}-${position}`

  const [itemRow] = await sql`
    INSERT INTO items (item_type_id, rfid_tag)
    VALUES (${itemTypeId}, ${rfid})
    ON CONFLICT (rfid_tag) DO UPDATE SET item_type_id = EXCLUDED.item_type_id
    RETURNING id
  `

  await sql`
    INSERT INTO lockers (distributor_id, position, state, current_item_id)
    VALUES (${distributorId}, ${position}, 'idle', ${itemRow.id})
    ON CONFLICT (distributor_id, position) DO UPDATE
      SET current_item_id = EXCLUDED.current_item_id,
          state = 'idle'
  `
}

async function main() {
  console.log('[seed] starting…')

  const communeId = await upsertCommune()
  console.log(`[seed] commune Paris ✓ (${communeId})`)

  const itemTypeIds = await upsertItemTypes()
  console.log(`[seed] item_types ✓ (${Object.keys(itemTypeIds).join(', ')})`)

  await upsertUsers()
  console.log(`[seed] users ✓ (${USERS.map((u) => u.role).join(', ')})`)

  for (const d of DISTRIBUTORS) {
    const distributorId = await upsertDistributor(d, communeId)
    for (let i = 0; i < d.lockerLayout.length; i++) {
      const slug = d.lockerLayout[i]
      await upsertLockerAndItem(distributorId, i, itemTypeIds[slug], d.serial_number)
    }
    console.log(`[seed] ${d.name} ✓ (${d.lockerLayout.length} lockers)`)
  }

  console.log('[seed] done')
}

main()
  .then(async () => {
    await sql.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[seed] aborted:', err.message)
    await sql.end().catch(() => undefined)
    process.exit(1)
  })
