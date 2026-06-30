import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Proxy serveur → API SportLocker pour la réinitialisation de mot de passe.
 *
 * Les composants client (page /login/reset, bouton /me) appellent cette route
 * plutôt que `sendPasswordResetEmail()` du SDK Firebase : on déporte l'envoi
 * vers l'API backend, qui génère le lien via l'Admin SDK et envoie un e-mail
 * FR brandé via Resend (vs e-mail Firebase générique en anglais → spam).
 *
 * On passe par un route handler (et non un appel direct depuis le client) pour
 * ne pas exposer l'URL interne de l'API au navigateur et éviter le CORS.
 *
 * Réponse neutre : on relaie `{ ok: true }` quel que soit le résultat amont
 * (anti-énumération de comptes — l'API fait déjà ce choix).
 */

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000'

const PostBody = z.object({
  email: z.string().email(),
})

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null)
  const parsed = PostBody.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }

  try {
    await fetch(`${API_URL}/v1/auth/password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: parsed.data.email }),
      cache: 'no-store',
    })
  } catch {
    // Erreur réseau vers l'API : on reste neutre côté client (l'utilisateur
    // verra l'écran de confirmation générique). Rien à divulguer.
  }

  return NextResponse.json({ ok: true })
}
