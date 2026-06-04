/**
 * Gabarit de l'e-mail de réinitialisation de mot de passe (FR, brandé).
 *
 * HTML 100 % inline (tables + styles inline) : c'est la seule mise en forme
 * fiable à travers les clients e-mail (Gmail, Outlook, Apple Mail…). Pas de
 * `<style>` externe, pas de flexbox/grid.
 *
 * Palette alignée sur le dashboard ops : fond navy `#0b1120`, accent emerald
 * `#10b981`, texte clair.
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

export interface PasswordResetEmailInput {
  /** Lien d'action Firebase (oobCode) généré côté serveur. */
  resetUrl: string
  /** Adresse destinataire — affichée pour rappel. */
  email: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const { resetUrl, email } = input
  const safeUrl = escapeHtml(resetUrl)
  const safeEmail = escapeHtml(email)

  const subject = 'Réinitialisation de votre mot de passe SportLocker'

  const text = [
    'Réinitialisation de votre mot de passe SportLocker',
    '',
    `Une demande de réinitialisation a été faite pour le compte ${email}.`,
    '',
    'Choisissez un nouveau mot de passe en ouvrant ce lien (valable 1 heure) :',
    resetUrl,
    '',
    "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail, votre",
    'mot de passe reste inchangé.',
    '',
    '— L’équipe SportLocker',
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
                  Réinitialisation de mot de passe
                </h1>
                <p style="margin:6px 0 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);">
                  Compte ${safeEmail}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.7);">
                  Une demande de réinitialisation de mot de passe a été faite pour ce compte.
                  Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
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
                        Choisir un nouveau mot de passe
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.45);">
                  Ce lien est valable 1 heure. Si le bouton ne fonctionne pas, copiez-collez
                  cette adresse dans votre navigateur :
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#34d399;">
                  ${safeUrl}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 16px 0;" />
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.4);">
                  Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail —
                  votre mot de passe reste inchangé.
                </p>
                <p style="margin:14px 0 0 0;font-size:12px;color:rgba(255,255,255,0.4);">
                  — L'équipe SportLocker
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:480px;margin:16px auto 0 auto;font-size:11px;line-height:1.5;color:rgba(255,255,255,0.25);text-align:center;">
            SportLocker · prêt de matériel sportif en libre-service
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
