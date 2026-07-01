/**
 * Temps réel dashboard — mint de ticket (HTTP) + flux WebSocket.
 *
 * Montée sous le préfixe `/v1/admin/live` :
 *   - `POST /v1/admin/live/ticket` — authentifié (Bearer JWT), scopé commune.
 *     Émet un ticket court à passer au handshake WS. Voir [[live-tickets]].
 *   - `GET  /v1/admin/live?ticket=…[&distributorId=…]` — WebSocket. Auth via
 *     ticket (le browser ne peut pas envoyer de header/cookie ici). Pousse les
 *     `LiveEvent` filtrés par commune (et optionnellement par distributeur pour
 *     la page détail).
 *
 * Fan-out : une seule souscription Redis par instance API ([[live-bus]]).
 * Chaque event reçu est diffusé aux sockets locaux dont le scope matche. Un
 * admin ne voit que sa commune ; super_admin voit tout.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { requireAdminScope } from '../lib/commune-scope.js'
import { parseCorsAllowedOrigins } from '../lib/cors.js'
import { env } from '../config/env.js'
import {
  subscribeLiveEvents,
  type LiveSubscription,
} from '../lib/live-bus.js'
import { shouldDeliver } from '../lib/live-filter.js'
import {
  mintLiveTicket,
  redeemLiveTicket,
  LIVE_TICKET_TTL_SECONDS,
} from '../lib/live-tickets.js'

/** Intervalle du ping applicatif — détecte les sockets morts (onglet gelé, NAT). */
const HEARTBEAT_INTERVAL_MS = 30_000

/** Codes de fermeture applicatifs (4000-4999 = réservé usage app par la RFC). */
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_FORBIDDEN_ORIGIN = 4403

interface LiveClient {
  socket: WebSocket
  /** null = super_admin (tout) ; sinon commune scopée. */
  communeId: string | null
  /** Si défini, le client ne veut que ce distributeur (page détail). */
  distributorId: string | null
  isAlive: boolean
}

const TicketResponse = z.object({
  ticket: z.string(),
  ttlSeconds: z.number().int().positive(),
})

const WsQuery = z.object({
  ticket: z.string().min(1),
  distributorId: z.string().uuid().optional(),
})

export async function adminLiveRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  const clients = new Set<LiveClient>()
  const allowedOrigins = new Set(parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS))

  // Souscription unique au bus pour cette instance : on fan-out vers les sockets
  // locaux. Ouverte au register, fermée onClose.
  const subscription: LiveSubscription = subscribeLiveEvents((event) => {
    for (const client of clients) {
      if (client.socket.readyState !== client.socket.OPEN) continue
      if (!shouldDeliver(client, event)) continue
      try {
        client.socket.send(JSON.stringify(event))
      } catch (err) {
        app.log.warn({ err }, 'live_ws_send_failed')
      }
    }
  }, app.log)

  // Heartbeat : ping périodique, terminate ceux qui n'ont pas pong au tour d'avant.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.socket.terminate()
        clients.delete(client)
        continue
      }
      client.isAlive = false
      try {
        client.socket.ping()
      } catch {
        client.socket.terminate()
        clients.delete(client)
      }
    }
  }, HEARTBEAT_INTERVAL_MS)
  // Ne pas empêcher le process de sortir à cause du timer.
  heartbeat.unref?.()

  app.addHook('onClose', async () => {
    clearInterval(heartbeat)
    for (const client of clients) client.socket.close(1001, 'server_shutdown')
    clients.clear()
    await subscription.close()
  })

  // ─── POST /ticket — échange Bearer → ticket court ────────────────────────
  app.post('/ticket', {
    preHandler: app.authenticate,
    schema: {
      tags: ['Admin — Temps réel'],
      summary: 'Émet un ticket d\'authentification pour le flux WebSocket live',
      description:
        'Le dashboard (qui détient le JWT httpOnly) échange son Bearer contre un '
        + `ticket court (TTL ${LIVE_TICKET_TTL_SECONDS}s, mono-usage) à passer en query au handshake `
        + '`GET /v1/admin/live?ticket=…`. Réservé admin / super_admin.',
      response: { 200: TicketResponse, 403: z.object({ error: z.string() }) },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return
    const ticket = await mintLiveTicket({
      sub: req.user.sub,
      role: req.user.role,
      communeId: auth.scope ? auth.scope.communeId : null,
    })
    return reply.send({ ticket, ttlSeconds: LIVE_TICKET_TTL_SECONDS })
  })

  // ─── GET / (WebSocket) — flux live scopé ─────────────────────────────────
  app.get('/', { websocket: true }, async (socket: WebSocket, req: FastifyRequest) => {
    // Défense en profondeur contre le cross-site WebSocket hijacking : on refuse
    // une Origin navigateur hors whitelist. (L'auth réelle reste le ticket, non
    // rejouable cross-site — mais un refus tôt évite d'ouvrir le flux.)
    const origin = req.headers.origin
    if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
      socket.close(CLOSE_FORBIDDEN_ORIGIN, 'origin_not_allowed')
      return
    }

    const parsed = WsQuery.safeParse(req.query)
    if (!parsed.success) {
      socket.close(CLOSE_UNAUTHORIZED, 'bad_query')
      return
    }

    const scope = await redeemLiveTicket(parsed.data.ticket)
    if (!scope) {
      socket.close(CLOSE_UNAUTHORIZED, 'invalid_ticket')
      return
    }

    const client: LiveClient = {
      socket,
      communeId: scope.communeId,
      distributorId: parsed.data.distributorId ?? null,
      isAlive: true,
    }
    clients.add(client)
    app.log.info(
      { sub: scope.sub, communeId: scope.communeId, distributorId: client.distributorId },
      'live_ws_connected',
    )

    socket.on('pong', () => { client.isAlive = true })
    socket.on('close', () => { clients.delete(client) })
    socket.on('error', () => { clients.delete(client) })
  })
}
