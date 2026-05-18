#!/usr/bin/env node
/**
 * Forge un JWT admin OU operator signé HS256 avec JWT_SESSION_SECRET.
 *
 * Usage minimum (admin = vue globale) :
 *   JWT_SESSION_SECRET='secret' node scripts/forge-admin-token.mjs
 *
 * Usage operator (vue scopée à une commune) :
 *   JWT_SESSION_SECRET='secret' node scripts/forge-admin-token.mjs \
 *     --role=operator --commune-id=<uuid-de-la-commune>
 *
 * Options :
 *   --role=admin|operator    (défaut: admin)
 *   --commune-id=<uuid>      (requis si role=operator, ignoré si admin)
 *   --ttl-days=<n>           (défaut: 7)
 *
 * Le token est imprimé sur stdout. Copie-le et colle-le dans la variable
 * DASHBOARD_ADMIN_TOKEN du service dashboard sur Railway.
 *
 * Payload :
 *   - sub  : UUID aléatoire (les routes admin ne croisent pas sub avec
 *            la table users, donc OK même non-persisté).
 *   - role : 'admin' ou 'operator'
 *   - communeId : UUID (operator uniquement)
 *   - iat / exp : standards JWT
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

// Parse les flags `--key=value`.
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=')
      return [k, rest.join('=') || true]
    }),
)

const role = args.role ?? 'admin'
if (role !== 'admin' && role !== 'operator') {
  console.error(`Role invalide : "${role}". Attendu : admin | operator`)
  process.exit(1)
}

const communeId = args['commune-id']
if (role === 'operator' && !communeId) {
  console.error('--commune-id=<uuid> est requis pour --role=operator')
  console.error('Astuce : récupère l\'UUID de la commune via /v1/admin/communes ou directement en DB')
  process.exit(1)
}
if (communeId && !/^[0-9a-f-]{36}$/i.test(communeId)) {
  console.error(`commune-id invalide : "${communeId}". Attendu : UUID standard.`)
  process.exit(1)
}

const ttlDays = Number(args['ttl-days'] ?? 7)
if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
  console.error(`--ttl-days invalide : "${args['ttl-days']}". Attendu : entier 1..365`)
  process.exit(1)
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

const now = Math.floor(Date.now() / 1000)
const ttlSeconds = ttlDays * 24 * 3600

const header = { alg: 'HS256', typ: 'JWT' }
const payload = {
  sub: randomUUID(),
  role,
  ...(role === 'operator' && communeId ? { communeId } : {}),
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
console.error(`✓ Token forgé, valide ${ttlDays} jour${ttlDays > 1 ? 's' : ''} (expire ${new Date(payload.exp * 1000).toISOString()})`)
console.error(`✓ sub = ${payload.sub}`)
console.error(`✓ role = ${payload.role}`)
if (role === 'operator') {
  console.error(`✓ communeId = ${communeId}`)
  console.error('  → cet operator ne verra QUE les réservations / tickets de cette commune')
}
console.error('')
console.error('Action suivante :')
console.error('  1. Copie la ligne ci-dessus (le token, pas les ---)')
console.error('  2. Railway → @sportlocker/dashboard → Variables → + New Variable')
console.error('     Name  : DASHBOARD_ADMIN_TOKEN')
console.error('     Value : <colle le token>')
console.error('  3. Save → Apply changes → Deploy')
