import { NextResponse } from 'next/server'

import { ApiError, fetchLiveTicket } from '../../../lib/api'

export const dynamic = 'force-dynamic'

/**
 * Émet un ticket d'authentification pour le flux WebSocket temps réel.
 *
 * Le client (composants live) appelle cette route à chaque (re)connexion : elle
 * lit le cookie de session httpOnly (inaccessible au JS browser) et l'échange
 * côté serveur contre un ticket court via l'API. Protégée par le middleware
 * d'auth du dashboard (cf. src/middleware.ts) — un visiteur non connecté est
 * redirigé avant d'atteindre ce handler.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const ticket = await fetchLiveTicket()
    return NextResponse.json(ticket)
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.detail }, { status: err.status })
    }
    // fetchLiveTicket → redirect('/login') lève NEXT_REDIRECT : on le relaie.
    throw err
  }
}
