#!/usr/bin/env node
/**
 * Bootstrap d'un compte super_admin en base — l'œuf et la poule du système
 * d'invites. Avant que ce script ne tourne, aucun super_admin n'existe et
 * personne ne peut émettre une invitation. Lancer une fois en setup initial
 * (ou pour récupérer l'accès si on a perdu le seul super_admin existant).
 *
 * Pré-requis :
 *   1. La migration 0004_admin_multi_tenant.sql doit être appliquée
 *      (sinon l'enum user_role n'a pas la valeur 'super_admin').
 *   2. Le compte Firebase Auth correspondant à --email doit exister
 *      (Firebase Console → Authentication → Add user → récupérer l'UID).
 *
 * Usage :
 *   DATABASE_URL=postgres://... node ./scripts/bootstrap-super-admin.mjs \
 *     --email=ops@sportlocker.fr \
 *     --firebase-uid=<uid-firebase> \
 *     --display-name="Stanislas C."
 *
 * Idempotent : ON CONFLICT (email) DO UPDATE bascule le role en super_admin
 * et synchronise firebase_uid + display_name. Relance safe.
 */

import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[bootstrap-super-admin] DATABASE_URL env var manquante.')
  console.error('Récupère-la depuis Railway → @sportlocker/api → Variables → DATABASE_URL')
  process.exit(1)
}

// Parse les flags `--key=value`.
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=')
      return [k, rest.join('=') || true]
    }),
)

const email = args.email
const firebaseUid = args['firebase-uid']
const displayName = args['display-name'] ?? null

if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('--email=<email-valide> requis')
  process.exit(1)
}

if (!firebaseUid || typeof firebaseUid !== 'string' || firebaseUid.length < 6) {
  console.error('--firebase-uid=<uid> requis (récupéré depuis Firebase Console)')
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 })

try {
  // 1. Vérifier que la migration 0004 est bien appliquée — sinon l'enum
  //    n'a pas 'super_admin' et l'INSERT plantera de façon cryptique.
  const enumCheck = await sql`
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'super_admin'
  `
  if (enumCheck.length === 0) {
    console.error('')
    console.error('❌ La valeur "super_admin" n\'existe pas dans l\'enum user_role.')
    console.error('   → La migration 0004_admin_multi_tenant.sql n\'est pas encore appliquée.')
    console.error('')
    console.error('   Lance d\'abord :')
    console.error('     pnpm --filter @sportlocker/api db:migrate')
    console.error('   (ou applique 0004 manuellement via psql)')
    process.exit(1)
  }

  // 2. Upsert idempotent. ON CONFLICT (email) → on bascule en super_admin
  //    et on resync firebase_uid (cas : compte existant promu).
  const [user] = await sql`
    INSERT INTO users (firebase_uid, email, display_name, role, trust_score)
    VALUES (${firebaseUid}, ${email}, ${displayName}, 'super_admin', 100)
    ON CONFLICT (email) DO UPDATE
      SET role = 'super_admin',
          firebase_uid = EXCLUDED.firebase_uid,
          display_name = COALESCE(EXCLUDED.display_name, users.display_name),
          updated_at = NOW()
    RETURNING id, email, role, firebase_uid, created_at
  `

  console.log('')
  console.log('✓ Super-admin bootstrap réussi')
  console.log(`  id           : ${user.id}`)
  console.log(`  email        : ${user.email}`)
  console.log(`  firebase_uid : ${user.firebase_uid}`)
  console.log(`  role         : ${user.role}`)
  console.log('')
  console.log('Étape suivante :')
  console.log(`  1. Va sur https://app.sportlocker.fr/login`)
  console.log(`  2. Connecte-toi avec ${user.email} + ton mot de passe Firebase`)
  console.log('  3. Onglet "Tenants" apparaîtra dans la sidebar — invite les admins des communes')
} catch (err) {
  console.error('❌ Erreur :', err.message)
  if (err.code === '23505') {
    console.error('   (conflit d\'unicité — firebase_uid déjà utilisé par un autre email ?)')
  }
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
