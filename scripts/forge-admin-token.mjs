#!/usr/bin/env node
/**
 * Forge un JWT admin signé HS256 avec JWT_SESSION_SECRET.
 *
 * Usage :
 *   JWT_SESSION_SECRET='ton-secret' node scripts/forge-admin-token.mjs
 *
 * Le token est imprimé sur stdout. Copie-le et colle-le dans la variable
 * DASHBOARD_ADMIN_TOKEN du service dashboard sur Railway.
 *
 * Payload :
 *   - sub  : UUID d'un user admin (par défaut, généré aléatoire — un
 *            UUID statique fonctionnera tant que les routes ne croisent
 *            pas sub avec la table users. Les routes POST/PUT distributor
 *            ne lisent que `role`, donc on est tranquille).
 *   - role : 'admin'
 *   - iat / exp : standards JWT (exp = 7 jours)
 *
 * Pas de dépendances : on signe à la main avec node:crypto.
 */

import { createHmac, randomUUID } from 'node:crypto'

const secret = process.env.JWT_SESSION_SECRET
if (!secret) {
  console.error('JWT_SESSION_SECRET env var manquante.')
  console.error('Récupère-la depuis Railway → @sportlocker/api → Variables → JWT_SESSION_SECRET')
  console.error("Puis relance avec : JWT_SESSION_SECRET='...' node scripts/forge-admin-token.mjs")
  process.exit(1)
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

const now = Math.floor(Date.now() / 1000)
const ttlSeconds = 7 * 24 * 3600 // 7 jours, comme l'API

const header = { alg: 'HS256', typ: 'JWT' }
const payload = {
  sub: randomUUID(), // UUID stable pour ce token, pas besoin d'exister en DB
  role: 'admin',
  iat: now,
  exp: now + ttlSeconds,
}

const headerB64 = b64url(JSON.stringify(header))
const payloadB64 = b64url(JSON.stringify(payload))
const data = `${headerB64}.${payloadB64}`
const sig = b64url(createHmac('sha256', secret).update(data).digest())
const token = `${data}.${sig}`

console.log(token)
console.error('---')
console.error(`✓ Token forgé, valide 7 jours (expire ${new Date(payload.exp * 1000).toISOString()})`)
console.error(`✓ sub = ${payload.sub}`)
console.error(`✓ role = admin`)
console.error('')
console.error('Action suivante :')
console.error('  1. Copie la ligne ci-dessus (le token, pas les ---)')
console.error('  2. Railway → @sportlocker/dashboard → Variables → + New Variable')
console.error('     Name  : DASHBOARD_ADMIN_TOKEN')
console.error('     Value : <colle le token>')
console.error('  3. Save → Apply changes → Deploy')
