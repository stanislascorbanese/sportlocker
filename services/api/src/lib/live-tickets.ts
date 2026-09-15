/**
 * Tickets d'authentification WebSocket — courts, opaques, mono-usage.
 *
 * Problème résolu : le dashboard stocke le JWT de session dans un cookie
 * httpOnly (illisible en JS) et vit sur un sous-domaine différent de l'API
 * (ops. vs api.) → le browser ne peut ni lire le token pour le mettre en header
 * `Authorization`, ni l'envoyer en cookie cross-domain lors du handshake WS.
 *
 * Solution : le serveur Next (qui, lui, a le JWT) échange le Bearer contre un
 * ticket via `POST /v1/admin/live/ticket`. Le ticket est un secret aléatoire
 * stocké côté Redis avec le scope de l'utilisateur et un TTL court. Le client
 * ouvre alors `wss://api/v1/admin/live?ticket=<t>` ; la route WS le consomme
 * (GETDEL atomique → un ticket ne sert qu'une fois) et récupère le scope.
 *
 * Propriétés de sécurité :
 *   - Fenêtre d'exposition minimale (TTL 30s) : un ticket leaké dans une URL /
 *     un log expire vite et ne survit pas à un premier usage.
 *   - Aucune donnée sensible : le ticket ne porte pas le JWT, juste une clé
 *     Redis. Compromettre un ticket ≠ compromettre la session.
 *   - Scope figé à l'émission : la commune est celle du JWT au moment du mint,
 *     pas rejouable pour élargir le périmètre.
 */
import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import { redis } from '../redis/client.js'
import { userRoleSchema } from './roles.js'

/** Durée de vie d'un ticket entre l'émission (Next) et le handshake (browser). */
export const LIVE_TICKET_TTL_SECONDS = 30

const KEY = (ticket: string) => `live-ticket:${ticket}`

export const LiveTicketScope = z.object({
  sub: z.string(),
  role: userRoleSchema,
  /** null = super_admin (voit tout) ; sinon commune scopée de l'admin. */
  communeId: z.string().uuid().nullable(),
})

export type LiveTicketScope = z.infer<typeof LiveTicketScope>

/**
 * Émet un ticket lié au scope fourni et le stocke `EX LIVE_TICKET_TTL_SECONDS`.
 * Retourne le secret à transmettre au client.
 */
export async function mintLiveTicket(scope: LiveTicketScope): Promise<string> {
  const ticket = randomBytes(32).toString('base64url')
  await redis.set(KEY(ticket), JSON.stringify(scope), 'EX', LIVE_TICKET_TTL_SECONDS)
  return ticket
}

/**
 * Consomme un ticket : lecture + suppression atomiques (`GETDEL`, Redis 6.2+).
 * Retourne le scope si le ticket existe et est bien formé, sinon `null`
 * (inexistant, expiré, ou déjà consommé).
 */
export async function redeemLiveTicket(ticket: string): Promise<LiveTicketScope | null> {
  if (!ticket) return null
  const raw = await redis.getdel(KEY(ticket))
  if (raw == null) return null
  try {
    const parsed = LiveTicketScope.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
