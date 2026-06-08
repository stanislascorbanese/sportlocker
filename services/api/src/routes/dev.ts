/**
 * Routes de développement / simulation — **JAMAIS exposées en production**.
 *
 * Permettent de tester l'E2E firmware sans hardware physique. La route
 * principale, `POST /v1/dev/simulate-scan`, génère un vrai JWT device signé
 * et le publie sur `sportlocker/{deviceId}/cmd/open` — exactement ce que
 * ferait un citoyen qui scanne le QR sur la borne. Le firmware-sim
 * (cf. infra/docker/docker-compose.dev.yml) vérifie le JWT, "ouvre" le
 * casier en mode mocké et publie un event signé que le subscriber API
 * (Phase 2) consomme pour passer la résa en `active`.
 *
 * Gating :
 *   - 403 si `NODE_ENV === 'production'`. Aucun moyen d'activer en prod.
 *   - 503 si MQTT_SUBSCRIBER_ENABLED=false (pas de client MQTT décoré).
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { reservations } from '../db/schema.js'
import { signDeviceToken } from '../lib/jwt-device.js'

const SimulateScanBody = z.object({
  reservationId: z.string().uuid()
    .describe('UUID de la réservation à ouvrir. Le distributeur, casier et user sont dérivés de la résa.'),
})

const SimulateScanResponse = z.object({
  token: z.string().describe('Le JWT device émis (HS256). Utile pour debug — ne pas exposer en prod.'),
  jti: z.string().describe('Nonce anti-replay du JWT. Permet de checker côté firmware/API si déjà vu.'),
  topic: z.string().describe('Topic MQTT sur lequel le token a été publié.'),
})

export async function devRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  // Gate dur : si jamais ces routes étaient register en prod par erreur, on
  // log et on refuse toute requête. Le boot devrait déjà skip le register
  // côté app.ts, mais defense-in-depth.
  if (env.NODE_ENV === 'production') {
    app.log.warn('dev_routes_blocked_in_production')
    app.post('/simulate-scan', async (_req, reply) => reply.code(403).send({ error: 'forbidden_in_production' }))
    return
  }

  app.post('/simulate-scan', {
    schema: {
      tags: ['Dev'],
      summary: 'Simule un scan QR sur une borne — déclenche le firmware sans caméra physique.',
      description:
        'Signe un JWT device pour la résa fournie et le publie sur `sportlocker/{deviceId}/cmd/open`. '
        + 'Le firmware-sim (ou un vrai Pi) le reçoit, vérifie, "ouvre" le casier et publie un event '
        + '`door_unlocked` signé que le subscriber API (cf. Phase 2) consomme pour passer la résa en `active`. '
        + 'Désactivé en production.',
      body: SimulateScanBody,
      response: {
        200: SimulateScanResponse,
        404: z.object({ error: z.literal('reservation_not_found') }),
        503: z.object({ error: z.literal('mqtt_disabled') }),
      },
    },
  }, async (req, reply) => {
    const { reservationId } = req.body

    const client = app.mqttSubscriber
    if (!client) {
      return reply.code(503).send({ error: 'mqtt_disabled' as const })
    }

    const [r] = await db
      .select({
        id: reservations.id,
        userId: reservations.userId,
        lockerId: reservations.lockerId,
        distributorId: reservations.distributorId,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1)

    if (!r) {
      return reply.code(404).send({ error: 'reservation_not_found' as const })
    }

    // Signe un JWT device strictement équivalent à celui que l'app citoyenne
    // génèrerait en local pour le QR. signDeviceToken pose iss/aud/exp/jti/iat.
    const token = await signDeviceToken({
      sub: r.userId,
      reservationId: r.id,
      lockerId: r.lockerId,
      distributorId: r.distributorId,
    })
    // Récupère le jti pour debug — pas d'await jwtVerify (le secret est déjà
    // celui qu'on vient d'utiliser pour signer).
    const jti = decodeJti(token)

    const topic = `sportlocker/${r.distributorId}/cmd/open`
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify({ token }), { qos: 1 }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    return { token, jti, topic }
  })
}

// Exporté pour les tests unitaires (branches défensives non atteignables via
// l'endpoint, qui ne lui passe que des tokens fraîchement signés et valides).
export function decodeJti(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return ''
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return typeof payload.jti === 'string' ? payload.jti : ''
  } catch {
    return ''
  }
}
