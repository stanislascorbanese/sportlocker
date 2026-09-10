#!/usr/bin/env node
/**
 * Seed du modèle camping — de quoi faire tourner le parcours vacancier en vrai,
 * sans borne et sans PMS.
 *
 * Le seed historique (`seed.mjs`) monte un parc de distributeurs parisiens avec
 * des comptes citoyens : c'est l'ancien modèle. Celui-ci monte ce qu'un camping
 * de la côte a réellement — un site, une borne de huit casiers, la dotation du
 * catalogue, et des séjours en cours pour pouvoir s'identifier.
 *
 * Re-run safe : tout passe par ON CONFLICT sur la clé naturelle. Relancer ne
 * duplique rien et ne casse pas les emprunts déjà enregistrés.
 *
 * Usage :
 *   DATABASE_URL=postgres://... node ./scripts/seed-camping.mjs
 *
 * Ensuite, côté app vacancier :
 *   NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm dev
 *   puis http://localhost:3002/b/SL-DUNES-01
 *   séjour « 214 », nom « Martin ».
 */
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[seed-camping] DATABASE_URL absent.\n  → cp services/api/.env.example services/api/.env, puis remplis-le.\n  → base locale : docker compose up -d (à la racine du dépôt)')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 })

const SERIAL = process.env.SEED_SERIAL ?? 'SL-DUNES-01'

/**
 * La dotation « Pelouse » de la fiche produit : deux articles longs et six
 * articles qui tiennent dans un cube de 30 cm. Les slugs pilotent le
 * pictogramme de l'app (cf. kindOf dans routes/kiosk.ts).
 */
const DOTATION = [
  { slug: 'raquette-badminton', name: 'Set de badminton',      category: 'raquette' },
  { slug: 'plot-terrain',       name: 'Plots de terrain',      category: 'accessoire' },
  { slug: 'ballon-foot',        name: 'Ballon de football',    category: 'ballon' },
  { slug: 'ballon-basket',      name: 'Ballon de basket',      category: 'ballon' },
  { slug: 'ballon-volley',      name: 'Ballon de volley',      category: 'ballon' },
  { slug: 'frisbee',            name: 'Frisbee',               category: 'plage' },
  { slug: 'molkky',             name: 'Mölkky',                category: 'plage' },
  { slug: 'boules-petanque',    name: 'Jeu de boules',         category: 'plage' },
]

/** Quelques séjours en cours, comme après un import PMS. */
const SEJOURS = [
  { ref: '214', last: 'Martin',  first: 'Camille' },
  { ref: '87',  last: 'Lefèvre', first: 'Jean' },
  { ref: 'A12', last: "D'Arcy",  first: 'Sofia' },
]

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

async function main() {
  const [commune] = await sql`
    INSERT INTO communes (insee_code, name, postal_code, department, region)
    VALUES ('85222', 'Camping des Dunes', '85160', '85', 'Pays de la Loire')
    ON CONFLICT (insee_code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`
  console.log(`[seed-camping] camping ${commune.id}`)

  const [kiosk] = await sql`
    INSERT INTO distributors (serial_number, commune_id, name, status, locker_count, address_line)
    VALUES (${SERIAL}, ${commune.id}, 'Terrain multisports', 'online', 8, 'Près du city-stade')
    ON CONFLICT (serial_number) DO UPDATE SET
      commune_id = EXCLUDED.commune_id,
      name = EXCLUDED.name,
      status = 'online',
      last_seen_at = NOW()
    RETURNING id`
  console.log(`[seed-camping] borne ${SERIAL}`)

  // Huit casiers, un article par casier — c'est la règle du produit.
  for (let position = 0; position < DOTATION.length; position++) {
    const type = DOTATION[position]

    const [itemType] = await sql`
      INSERT INTO item_types (slug, name, category, caution_cents, max_duration_minutes)
      VALUES (${type.slug}, ${type.name}, ${type.category}, 0, 240)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
      RETURNING id`

    const [locker] = await sql`
      INSERT INTO lockers (distributor_id, position, state)
      VALUES (${kiosk.id}, ${position}, 'idle')
      ON CONFLICT (distributor_id, position) DO UPDATE SET state = 'idle'
      RETURNING id`

    const rfid = `${SERIAL}-${String(position + 1).padStart(2, '0')}`
    const [item] = await sql`
      INSERT INTO items (item_type_id, rfid_tag, current_locker_id, condition)
      VALUES (${itemType.id}, ${rfid}, ${locker.id}, 'good')
      ON CONFLICT (rfid_tag) DO UPDATE SET
        item_type_id = EXCLUDED.item_type_id,
        current_locker_id = EXCLUDED.current_locker_id
      RETURNING id`

    // On ne repose l'article que s'il n'est pas dehors : relancer le seed
    // pendant un emprunt ne doit pas faire réapparaître un ballon qui est
    // chez un client.
    await sql`
      UPDATE lockers SET current_item_id = ${item.id}
      WHERE id = ${locker.id}
        AND NOT EXISTS (
          SELECT 1 FROM loans l WHERE l.item_id = ${item.id} AND l.returned_at IS NULL
        )`
  }
  console.log(`[seed-camping] ${DOTATION.length} casiers garnis`)

  for (const s of SEJOURS) {
    await sql`
      INSERT INTO stays (commune_id, stay_ref, last_name, first_name, arrives_on, departs_on)
      VALUES (${commune.id}, ${s.ref}, ${s.last}, ${s.first}, ${isoDay(-2)}, ${isoDay(5)})
      ON CONFLICT (commune_id, stay_ref, arrives_on) DO UPDATE SET
        last_name = EXCLUDED.last_name,
        first_name = EXCLUDED.first_name,
        departs_on = EXCLUDED.departs_on`
  }
  console.log(`[seed-camping] ${SEJOURS.length} séjours en cours`)

  console.log('')
  console.log(`  Borne     : ${SERIAL}`)
  console.log(`  Séjours   : ${SEJOURS.map((s) => `${s.ref} / ${s.last}`).join('  ·  ')}`)
  console.log(`  Parcours  : http://localhost:3002/b/${SERIAL}`)
  console.log('')
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error('[seed-camping]', err)
    await sql.end()
    process.exit(1)
  })
