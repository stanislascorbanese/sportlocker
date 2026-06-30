#!/usr/bin/env node
/**
 * Onboarding tenant — seed idempotent paramétrable par config JSON.
 *
 * Crée d'un coup en base : 1 commune (tenant) + N distributeurs avec
 * leurs lockers + items + pricing_rules. Aucun user n'est créé ici —
 * la promotion de l'admin tenant passe par `admin_invites` (route
 * /admin/invites) ou `bootstrap-super-admin.mjs` pour le super_admin.
 *
 * Pré-requis :
 *   1. Migrations à jour (au minimum 0008_pricing_and_slots.sql).
 *   2. Les `item_types` référencés dans le config doivent exister en
 *      base (ils sont partagés cross-tenant, créés une fois par seed.mjs
 *      ou une migration de référentiel). Le script vérifie et abort
 *      sinon plutôt que de créer un item_type bricolé pour ce tenant.
 *
 * Usage :
 *   DATABASE_URL=postgres://... node ./scripts/onboard-tenant.mjs \
 *     --config ./scripts/templates/tenant-mairie-example.json
 *
 * Idempotence : tous les inserts utilisent ON CONFLICT DO UPDATE sur la
 * clé naturelle (insee_code, serial_number, rfid_tag,
 * lockers(distributor_id, position), pricing_rules(commune_id,
 * item_type_id, duration_minutes)). Relancer le script ne crée pas
 * de doublon et ne casse pas les FK existantes — pratique si on a
 * changé le prix d'un slot dans le JSON et qu'on veut juste resynchro.
 *
 * Limite connue : `communes.insee_code` est UNIQUE et VARCHAR(5). Pour
 * une mairie c'est le vrai code INSEE. Pour un hôtel/camping (entités
 * privées sans INSEE) il faut utiliser un code arbitraire à 5 caractères
 * — voir doc ONBOARDING-TENANT.md. Une vraie migration multi-tenant
 * (table dédiée `tenants` séparée de `communes`) est un chantier futur.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[onboard-tenant] DATABASE_URL env var manquante.')
  console.error('Récupère-la depuis Railway → @sportlocker/api → Variables → DATABASE_URL')
  process.exit(1)
}

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=')
      return [k, rest.join('=') || true]
    }),
)

const configPath = args.config
if (!configPath || typeof configPath !== 'string') {
  console.error('[onboard-tenant] --config=<path-to-tenant.json> requis')
  console.error('Exemples disponibles dans services/api/scripts/templates/')
  process.exit(1)
}

let config
try {
  const raw = readFileSync(resolve(configPath), 'utf8')
  config = JSON.parse(raw)
} catch (err) {
  console.error(`[onboard-tenant] config illisible : ${err.message}`)
  process.exit(1)
}

// Validation explicite — meilleur signal d'erreur qu'un crash SQL sibyllin.
function validateConfig(cfg) {
  const errors = []

  if (!cfg.commune || typeof cfg.commune !== 'object') {
    errors.push('commune (object) requis')
  } else {
    const c = cfg.commune
    if (!c.insee_code || !/^[A-Za-z0-9]{5}$/.test(c.insee_code)) {
      errors.push('commune.insee_code requis (5 chars alphanum)')
    }
    if (!c.name) errors.push('commune.name requis')
    if (!c.postal_code) errors.push('commune.postal_code requis')
    if (!c.department) errors.push('commune.department requis')
    if (!c.region) errors.push('commune.region requis')
  }

  if (!Array.isArray(cfg.distributors) || cfg.distributors.length === 0) {
    errors.push('distributors (array non-vide) requis')
  } else {
    cfg.distributors.forEach((d, i) => {
      if (!d.serial_number) errors.push(`distributors[${i}].serial_number requis`)
      if (!d.name) errors.push(`distributors[${i}].name requis`)
      if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') {
        errors.push(`distributors[${i}].latitude/longitude (number) requis`)
      }
      if (!Array.isArray(d.locker_layout) || d.locker_layout.length === 0) {
        errors.push(`distributors[${i}].locker_layout (array de slugs item_type) requis`)
      }
    })
  }

  if (!Array.isArray(cfg.pricing_rules) || cfg.pricing_rules.length === 0) {
    errors.push('pricing_rules (array non-vide) requis — sans règle, aucun slot n\'est proposable')
  } else {
    cfg.pricing_rules.forEach((r, i) => {
      if (!r.item_type_slug) errors.push(`pricing_rules[${i}].item_type_slug requis`)
      if (![30, 60, 90, 120, 1440].includes(r.duration_minutes)) {
        errors.push(`pricing_rules[${i}].duration_minutes doit être 30/60/90/120/1440`)
      }
      if (typeof r.price_cents !== 'number' || r.price_cents < 0) {
        errors.push(`pricing_rules[${i}].price_cents (number ≥ 0) requis`)
      }
    })
  }

  return errors
}

const validationErrors = validateConfig(config)
if (validationErrors.length > 0) {
  console.error('[onboard-tenant] config invalide :')
  validationErrors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 })

async function upsertCommune(c) {
  const [row] = await sql`
    INSERT INTO communes
      (insee_code, name, postal_code, department, region,
       population, contact_email, contact_phone,
       contract_start, contract_end, monthly_fee_cents)
    VALUES
      (${c.insee_code}, ${c.name}, ${c.postal_code}, ${c.department}, ${c.region},
       ${c.population ?? null}, ${c.contact_email ?? null}, ${c.contact_phone ?? null},
       ${c.contract_start ?? null}, ${c.contract_end ?? null},
       ${c.monthly_fee_cents ?? 0})
    ON CONFLICT (insee_code) DO UPDATE SET
      name              = EXCLUDED.name,
      postal_code       = EXCLUDED.postal_code,
      department        = EXCLUDED.department,
      region            = EXCLUDED.region,
      population        = COALESCE(EXCLUDED.population, communes.population),
      contact_email     = COALESCE(EXCLUDED.contact_email, communes.contact_email),
      contact_phone     = COALESCE(EXCLUDED.contact_phone, communes.contact_phone),
      contract_start    = COALESCE(EXCLUDED.contract_start, communes.contract_start),
      contract_end      = COALESCE(EXCLUDED.contract_end, communes.contract_end),
      monthly_fee_cents = EXCLUDED.monthly_fee_cents,
      updated_at        = NOW()
    RETURNING id
  `
  return row.id
}

async function resolveItemTypeIds(slugs) {
  if (slugs.length === 0) return {}
  const rows = await sql`
    SELECT id, slug FROM item_types WHERE slug IN ${sql(slugs)}
  `
  const found = Object.fromEntries(rows.map((r) => [r.slug, r.id]))
  const missing = slugs.filter((s) => !(s in found))
  if (missing.length > 0) {
    throw new Error(
      `item_types absents en base : ${missing.join(', ')}. ` +
      `Lance d'abord seed.mjs ou crée-les via une migration référentiel.`,
    )
  }
  return found
}

async function upsertDistributor(d, communeId) {
  const [row] = await sql`
    INSERT INTO distributors
      (serial_number, commune_id, name, latitude, longitude, address_line,
       locker_count, status)
    VALUES
      (${d.serial_number}, ${communeId}, ${d.name},
       ${d.latitude}, ${d.longitude}, ${d.address_line ?? null},
       ${d.locker_layout.length}, ${d.status ?? 'offline'})
    ON CONFLICT (serial_number) DO UPDATE SET
      commune_id   = EXCLUDED.commune_id,
      name         = EXCLUDED.name,
      latitude     = EXCLUDED.latitude,
      longitude    = EXCLUDED.longitude,
      address_line = COALESCE(EXCLUDED.address_line, distributors.address_line),
      locker_count = EXCLUDED.locker_count,
      updated_at   = NOW()
    RETURNING id
  `
  return row.id
}

async function upsertLockerAndItem(distributorId, position, itemTypeId, distSerial) {
  const rfid = `RFID-${distSerial}-${position}`

  // Item AVANT locker car lockers.current_item_id est une FK vers items.id.
  const [itemRow] = await sql`
    INSERT INTO items (item_type_id, rfid_tag, condition)
    VALUES (${itemTypeId}, ${rfid}, 'new')
    ON CONFLICT (rfid_tag) DO UPDATE
      SET item_type_id = EXCLUDED.item_type_id
    RETURNING id
  `

  await sql`
    INSERT INTO lockers (distributor_id, position, state, current_item_id)
    VALUES (${distributorId}, ${position}, 'idle', ${itemRow.id})
    ON CONFLICT (distributor_id, position) DO UPDATE
      SET current_item_id = EXCLUDED.current_item_id,
          state           = 'idle'
  `
}

async function upsertPricingRule(communeId, itemTypeId, durationMinutes, priceCents) {
  await sql`
    INSERT INTO pricing_rules (commune_id, item_type_id, duration_minutes, price_cents)
    VALUES (${communeId}, ${itemTypeId}, ${durationMinutes}, ${priceCents})
    ON CONFLICT (commune_id, item_type_id, duration_minutes) DO UPDATE
      SET price_cents = EXCLUDED.price_cents,
          updated_at  = NOW()
  `
}

async function main() {
  console.log(`[onboard-tenant] starting — config: ${configPath}`)
  console.log(`[onboard-tenant] tenant: ${config.commune.name} (${config.commune.insee_code})`)

  const communeId = await upsertCommune(config.commune)
  console.log(`[onboard-tenant] ✓ commune ${config.commune.name} (${communeId})`)

  // Collecte tous les slugs item_type référencés (lockers + pricing) en une
  // seule requête plutôt qu'un round-trip par distributeur.
  const allSlugs = new Set()
  for (const d of config.distributors) {
    for (const slug of d.locker_layout) allSlugs.add(slug)
  }
  for (const r of config.pricing_rules) allSlugs.add(r.item_type_slug)

  const itemTypeIds = await resolveItemTypeIds([...allSlugs])
  console.log(`[onboard-tenant] ✓ item_types résolus (${Object.keys(itemTypeIds).length})`)

  for (const d of config.distributors) {
    const distributorId = await upsertDistributor(d, communeId)
    for (let i = 0; i < d.locker_layout.length; i++) {
      const slug = d.locker_layout[i]
      await upsertLockerAndItem(distributorId, i, itemTypeIds[slug], d.serial_number)
    }
    console.log(
      `[onboard-tenant] ✓ ${d.name} — ${d.locker_layout.length} lockers (${distributorId})`,
    )
  }

  for (const rule of config.pricing_rules) {
    await upsertPricingRule(
      communeId,
      itemTypeIds[rule.item_type_slug],
      rule.duration_minutes,
      rule.price_cents,
    )
  }
  console.log(`[onboard-tenant] ✓ ${config.pricing_rules.length} pricing_rules`)

  console.log('')
  console.log(`✓ Tenant "${config.commune.name}" onboardé.`)
  console.log('')
  console.log('Étape suivante — promouvoir l\'admin tenant :')
  console.log('  Soit via la route /admin/invites (super_admin doit être connecté au dashboard)')
  console.log('  Soit directement en SQL pour un setup initial :')
  console.log('')
  console.log(`    UPDATE users`)
  console.log(`    SET role = 'admin', commune_id = '${communeId}'`)
  console.log(`    WHERE email = '<admin-email-here>';`)
  console.log('')
}

main()
  .then(async () => {
    await sql.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[onboard-tenant] aborted:', err.message)
    await sql.end({ timeout: 5 }).catch(() => undefined)
    process.exit(1)
  })
