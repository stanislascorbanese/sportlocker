/**
 * Gabarit de l'e-mail d'alerte "distributeur hors-ligne" (FR, brandé).
 *
 * Émis automatiquement par `runHeartbeatWatchdog` à chaque transition
 * `online` → `offline` (heartbeat MQTT silencieux depuis > 5 min). Idempotent
 * côté queue : pas de nouvel e-mail si un ticket auto-source non-résolu existe
 * déjà sur ce distributeur dans les dernières 24h.
 *
 * Palette navy/emerald cohérente avec les autres mails (password-reset,
 * signin-link). HTML 100 % inline pour la compatibilité Gmail/Outlook.
 */

/** Échappe les caractères HTML d'une valeur injectée dans le corps. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface DistributorOfflineEmailInput {
  /** Nom affichage du distributeur (`distributors.name`). */
  distributorName: string
  /** Serial physique du distributeur (`distributors.serial_number`). */
  serialNumber: string
  /** Dernier heartbeat reçu (`distributors.last_seen_at`) ou null si jamais vu. */
  lastSeenAt: Date | null
  /** Nom de la commune (`communes.name`) — pour personnalisation du sujet. */
  communeName: string
  /** URL absolue vers la page de détail dashboard ops. */
  dashboardUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Formate une date en français court "9 juin 2026 à 14:32" ou retourne "jamais". */
function formatTimestamp(date: Date | null): string {
  if (!date) return 'jamais'
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
  return fmt.format(date).replace(',', ' à')
}

export function renderDistributorOfflineEmail(input: DistributorOfflineEmailInput): RenderedEmail {
  const { distributorName, serialNumber, lastSeenAt, communeName, dashboardUrl } = input
  const safeName = escapeHtml(distributorName)
  const safeSerial = escapeHtml(serialNumber)
  const safeCommune = escapeHtml(communeName)
  const safeUrl = escapeHtml(dashboardUrl)
  const lastSeen = formatTimestamp(lastSeenAt)
  const safeLastSeen = escapeHtml(lastSeen)

  const subject = `[SportLocker] Distributeur hors-ligne : ${distributorName}`

  const text = [
    `[SportLocker] Distributeur hors-ligne : ${distributorName}`,
    '',
    `Le distributeur "${distributorName}" (serial ${serialNumber}) installé sur la`,
    `commune de ${communeName} n'envoie plus de heartbeat depuis plus de 5 minutes.`,
    '',
    `Dernier signe de vie : ${lastSeen}.`,
    '',
    'Causes possibles : panne secteur du distributeur, coupure 4G, hardware en',
    'défaut. Aucune action de votre part n\'est requise si vous voyez le distributeur',
    'redémarrer dans les minutes suivantes (un rétablissement est détecté automatiquement).',
    '',
    'Si la panne persiste au-delà d\'1 heure, contactez le support SportLocker.',
    '',
    `Détails et historique télémétrie sur le dashboard ops :`,
    dashboardUrl,
    '',
    '— L\'équipe SportLocker',
  ].join('\n')

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#0f172a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <span style="display:inline-block;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">
                  Sport<span style="color:#10b981;">Locker</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0;font-size:20px;line-height:1.3;color:#ffffff;font-weight:600;">
                  Distributeur hors-ligne
                </h1>
                <p style="margin:6px 0 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#f97316;">
                  ${safeCommune}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.7);">
                  Le distributeur <strong style="color:#ffffff;">${safeName}</strong> (serial <code style="color:#34d399;">${safeSerial}</code>) n'envoie plus de heartbeat depuis plus de 5 minutes.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:10px;width:100%;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.45);">
                        Dernier signe de vie
                      </div>
                      <div style="margin-top:4px;font-size:14px;color:#ffffff;font-weight:500;">
                        ${safeLastSeen}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.6);">
                  <strong style="color:rgba(255,255,255,0.8);">Causes possibles</strong> : panne secteur, coupure 4G, hardware en défaut.
                </p>
                <p style="margin:10px 0 0 0;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.6);">
                  Aucune action requise si le distributeur redémarre dans les minutes suivantes — le rétablissement est détecté automatiquement.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background-color:#10b981;">
                      <a href="${safeUrl}" target="_blank" rel="noopener"
                        style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#0b1120;text-decoration:none;border-radius:10px;">
                        Voir le détail télémétrie
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.45);">
                  Si la panne persiste au-delà d'1 heure, contactez le support SportLocker.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background-color:#0b1120;border-top:1px solid rgba(255,255,255,0.05);">
                <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);text-align:center;">
                  Alerte automatique générée par le watchdog SportLocker — vous recevez cet e-mail car votre adresse est configurée comme contact pour ${safeCommune}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
