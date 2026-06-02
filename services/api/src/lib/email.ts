import { env } from '../config/env.js'

/**
 * Envoi d'e-mails transactionnels via Resend.
 *
 * On appelle l'API REST Resend directement (`POST https://api.resend.com/emails`)
 * plutôt que le SDK `resend` : pas de dépendance npm supplémentaire (donc pas de
 * mise à jour du lockfile, build Docker `--frozen-lockfile` préservé), et le SDK
 * n'est de toute façon qu'un mince wrapper autour de ce même endpoint.
 *
 * Doc : https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface EmailMessage {
  to: string
  subject: string
  /** Corps HTML (clients e-mail modernes). */
  html: string
  /** Corps texte brut (fallback + délivrabilité). */
  text: string
}

/** `true` si l'envoi d'e-mails est configuré (clé Resend présente). */
export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY)
}

/**
 * Envoie un e-mail via Resend. Lève si non configuré ou si Resend rejette
 * l'envoi (l'appelant décide quoi faire de l'erreur — p.ex. la logger sans la
 * propager au client pour l'anti-énumération).
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error('email_not_configured: RESEND_API_KEY manquant')
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`resend_send_failed_${res.status}: ${detail.slice(0, 500)}`)
  }
}
