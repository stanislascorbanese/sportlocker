/**
 * Gabarit de l'e-mail de lien de connexion (magic link) citoyen — FR, brandé.
 *
 * Même approche que `password-reset.ts` : HTML 100 % inline (tables + styles
 * inline), seule mise en forme fiable à travers les clients e-mail. Palette
 * alignée sur l'app : fond navy `#0b1120`, accent emerald `#10b981`.
 *
 * Pourquoi un e-mail maison plutôt que celui de Firebase ? `sendSignInLinkToEmail`
 * côté client envoie un e-mail générique en anglais depuis
 * `noreply@<projet>.firebaseapp.com` (non brandé, souvent classé en spam). On
 * génère ici le lien via l'Admin SDK puis on envoie NOTRE e-mail FR via Resend.
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

export interface SignInLinkEmailInput {
  /** Lien de connexion Firebase (oobCode) généré côté serveur. */
  signInUrl: string
  /** Adresse destinataire — affichée pour rappel. */
  email: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderSignInLinkEmail(input: SignInLinkEmailInput): RenderedEmail {
  const { signInUrl, email } = input
  const safeUrl = escapeHtml(signInUrl)
  const safeEmail = escapeHtml(email)

  const subject = 'Votre lien de connexion SportLocker'

  const text = [
    'Connexion à SportLocker',
    '',
    `Une demande de connexion a été faite pour ${email}.`,
    '',
    'Ouvrez ce lien pour vous connecter (à usage unique) :',
    signInUrl,
    '',
    "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail —",
    'aucune connexion ne sera créée.',
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
                  Connexion à SportLocker
                </h1>
                <p style="margin:6px 0 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);">
                  ${safeEmail}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.7);">
                  Cliquez sur le bouton ci-dessous pour vous connecter à SportLocker.
                  Ce lien ne fonctionne qu'une seule fois.
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
                        Se connecter
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.45);">
                  Si le bouton ne fonctionne pas, copiez-collez cette adresse dans votre navigateur :
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
                  aucune connexion ne sera créée.
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
