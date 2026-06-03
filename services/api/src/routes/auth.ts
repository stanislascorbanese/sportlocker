import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { env } from '../config/env.js'
import { getFirebaseAdmin } from '../lib/firebase-admin.js'
import { sendEmail, isEmailConfigured } from '../lib/email.js'
import { renderPasswordResetEmail } from '../emails/password-reset.js'
import { renderSignInLinkEmail } from '../emails/signin-link.js'

const RegisterBody = z.object({
  idToken: z.string().min(20)
    .describe('Firebase ID token obtenu côté app mobile (firebase-auth). JWT à 3 segments.'),
})

const UserDTO = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: z.enum(['citizen', 'operator', 'admin', 'super_admin']),
  trustScore: z.number().int().describe('Score de confiance 0..100. Démarre à 50.'),
  communeId: z.string().uuid().nullable(),
})

const RegisterResponse = z.object({
  sessionToken: z.string().describe('JWT de session SportLocker (HS256, TTL 7 jours)'),
  user: UserDTO,
})

const ErrorDTO = z.object({ error: z.string() })

const PasswordResetBody = z.object({
  email: z.string().email()
    .describe('Adresse e-mail du compte dont on veut réinitialiser le mot de passe.'),
})

// Réponse volontairement neutre : on renvoie toujours `ok: true`, même si
// l'e-mail ne correspond à aucun compte. Évite l'énumération de comptes.
const PasswordResetResponse = z.object({ ok: z.literal(true) })

const SignInLinkBody = z.object({
  email: z.string().email()
    .describe('Adresse e-mail du citoyen à qui envoyer un lien de connexion magic-link.'),
})

// Idem password-reset : réponse neutre `ok: true` dans tous les cas.
const SignInLinkResponse = z.object({ ok: z.literal(true) })

interface FirebaseClaims {
  sub: string
  email?: string
  name?: string
  email_verified?: boolean
}

/**
 * Décode un JWT *sans vérifier la signature* — utilisé uniquement en mode dev
 * quand FIREBASE_SERVICE_ACCOUNT_KEY n'est pas configuré. À ne JAMAIS activer
 * en production : un attaquant pourrait forger n'importe quel uid.
 */
function decodeFirebaseTokenUnsafe(idToken: string): FirebaseClaims | null {
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
    if (typeof payload?.sub !== 'string') return null
    return payload as FirebaseClaims
  } catch {
    return null
  }
}

async function verifyFirebaseTokenSecure(idToken: string): Promise<FirebaseClaims | null> {
  const admin = await getFirebaseAdmin()
  if (!admin) return null
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    return {
      sub: decoded.uid,
      ...(decoded.email !== undefined && { email: decoded.email }),
      ...(decoded.name !== undefined && { name: decoded.name as string }),
      ...(decoded.email_verified !== undefined && { email_verified: decoded.email_verified }),
    }
  } catch {
    return null
  }
}

export async function authRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/auth/register — échange un Firebase ID token contre un JWT
   * de session SportLocker. Upsert du user (création ou rafraîchissement).
   *
   * Modes de vérification :
   *   - production  : firebase-admin.verifyIdToken() (requiert FIREBASE_*).
   *   - development : tentative sécurisée si configuré, sinon décodage sans
   *     vérification de signature (log warning à chaque appel).
   */
  app.post('/register', {
    schema: {
      tags: ['Citoyens — Auth'],
      summary: 'Échange un Firebase ID token contre une session citoyen',
      description: 'Vérifie le Firebase ID token et upsert le user (création ou rafraîchissement). '
        + 'Émet un JWT de session SportLocker (HS256, TTL 7 jours) à utiliser en `Authorization: Bearer`.\n\n'
        + 'En production : vérification cryptographique via firebase-admin (requiert FIREBASE_*). '
        + 'En dev sans firebase configuré : décodage sans vérif signature avec log warning.\n\n'
        + '**Exemple body** : `{ "idToken": "eyJhbGc..." }`',
      body: RegisterBody,
      response: {
        201: RegisterResponse,
        400: ErrorDTO,
        401: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const { idToken } = req.body

    let claims = await verifyFirebaseTokenSecure(idToken)
    if (!claims) {
      if (env.NODE_ENV === 'production') {
        return reply.code(401).send({ error: 'invalid_id_token' })
      }
      claims = decodeFirebaseTokenUnsafe(idToken)
      if (claims) {
        req.log.warn(
          { sub: claims.sub },
          'auth/register: token decoded WITHOUT signature verification (dev mode only)',
        )
      }
    }

    if (!claims) {
      return reply.code(401).send({ error: 'invalid_id_token' })
    }
    if (!claims.email) {
      return reply.code(400).send({ error: 'missing_email_claim' })
    }

    const now = new Date()
    const [u] = await db
      .insert(users)
      .values({
        firebaseUid: claims.sub,
        email: claims.email,
        displayName: claims.name ?? null,
        lastActiveAt: now,
      })
      .onConflictDoUpdate({
        target: users.firebaseUid,
        set: {
          email: claims.email,
          displayName: claims.name ?? null,
          lastActiveAt: now,
          updatedAt: now,
        },
      })
      .returning()

    const sessionToken = app.jwt.sign({ sub: u!.id, email: u!.email, role: u!.role })

    return reply.code(201).send({
      sessionToken,
      user: {
        id: u!.id,
        email: u!.email,
        displayName: u!.displayName,
        role: u!.role,
        trustScore: u!.trustScore,
        communeId: u!.communeId,
      },
    })
  })

  /**
   * POST /v1/auth/password-reset — déclenche l'envoi d'un e-mail de
   * réinitialisation de mot de passe brandé SportLocker.
   *
   * Pourquoi côté serveur plutôt que `sendPasswordResetEmail()` côté client ?
   * Firebase envoie sinon un e-mail générique en anglais depuis
   * `noreply@<projet>.firebaseapp.com` — non brandé et systématiquement classé
   * en spam par Gmail. Ici on génère le lien d'action via l'Admin SDK
   * (`generatePasswordResetLink`) puis on envoie NOTRE e-mail FR via Resend,
   * depuis un domaine vérifié (SPF/DKIM) → délivrabilité correcte.
   *
   * Anti-énumération : on renvoie TOUJOURS `200 { ok: true }`, que l'e-mail
   * existe ou non, et on avale `auth/user-not-found`. Un attaquant ne peut pas
   * distinguer un compte valide d'un compte inexistant.
   */
  app.post('/password-reset', {
    schema: {
      tags: ['Citoyens — Auth', 'Auth admin'],
      summary: 'Envoie un e-mail brandé de réinitialisation de mot de passe',
      description: 'Génère un lien de reset Firebase (Admin SDK) et envoie un e-mail FR brandé via Resend. '
        + 'Réponse neutre `{ ok: true }` dans tous les cas (anti-énumération de comptes).\n\n'
        + 'Prérequis env : `FIREBASE_*` (génération du lien) + `RESEND_API_KEY` / `EMAIL_FROM` (envoi). '
        + 'Si non configuré, la route répond quand même `200` et logge un warning (aucun e-mail envoyé).\n\n'
        + '**Exemple body** : `{ "email": "admin@sportlocker.fr" }`',
      body: PasswordResetBody,
      response: {
        200: PasswordResetResponse,
        400: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase()

    const admin = await getFirebaseAdmin()
    if (!admin) {
      req.log.warn({ email }, 'auth/password-reset: Firebase non configuré — aucun e-mail envoyé')
      return reply.code(200).send({ ok: true })
    }
    if (!isEmailConfigured()) {
      req.log.warn({ email }, 'auth/password-reset: RESEND_API_KEY absent — aucun e-mail envoyé')
      return reply.code(200).send({ ok: true })
    }

    try {
      const rawUrl = await admin.auth().generatePasswordResetLink(email)
      // La page d'action Firebase suit le param `lang` de l'URL ; par défaut
      // elle renvoie `lang=en`. On force `fr` pour rester cohérent avec notre
      // e-mail FR (sinon la page de choix du mot de passe s'affiche en anglais).
      const url = new URL(rawUrl)
      url.searchParams.set('lang', 'fr')
      const resetUrl = url.toString()
      const { subject, html, text } = renderPasswordResetEmail({ resetUrl, email })
      await sendEmail({ to: email, subject, html, text })
      req.log.info({ email }, 'auth/password-reset: e-mail de réinitialisation envoyé')
    } catch (err) {
      const code = (err as { code?: string }).code
      // Compte inexistant : silencieux (anti-énumération).
      if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
        req.log.info({ email }, 'auth/password-reset: aucun compte (réponse neutre)')
      } else {
        // Vraie défaillance (Resend down, lien non généré…) : on logge pour
        // l'observabilité mais on garde une réponse neutre côté client.
        req.log.error(
          { email, err: err instanceof Error ? err.message : String(err) },
          'auth/password-reset: échec de l\'envoi',
        )
      }
    }

    return reply.code(200).send({ ok: true })
  })

  /**
   * POST /v1/auth/signin-link — déclenche l'envoi d'un e-mail de connexion
   * magic-link brandé SportLocker (PWA citoyenne).
   *
   * Même motivation que /password-reset : `sendSignInLinkToEmail()` côté client
   * envoie un e-mail générique en anglais depuis `noreply@<projet>.firebaseapp.com`
   * (non brandé → spam). Ici on génère le lien via l'Admin SDK
   * (`generateSignInWithEmailLink`) puis on envoie NOTRE e-mail FR via Resend.
   *
   * Le lien reste un vrai lien Firebase email-link : côté client, le flux
   * `isSignInWithEmailLink` / `signInWithEmailLink` (page /login) finalise la
   * connexion sans changement. Le `continueUrl` est construit côté serveur à
   * partir de `CITIZEN_APP_BASE_URL` (jamais fourni par le client) pour éviter
   * de détourner l'endpoint vers un domaine tiers.
   *
   * Anti-énumération : magic-link crée le compte à la complétion, donc
   * `generateSignInWithEmailLink` réussit pour toute adresse (existante ou non).
   * On renvoie de toute façon TOUJOURS `200 { ok: true }`.
   */
  app.post('/signin-link', {
    schema: {
      tags: ['Citoyens — Auth'],
      summary: 'Envoie un e-mail brandé de connexion (magic link)',
      description: 'Génère un lien de connexion Firebase (Admin SDK) et envoie un e-mail FR brandé via Resend. '
        + 'Réponse neutre `{ ok: true }` dans tous les cas.\n\n'
        + 'Prérequis env : `FIREBASE_*` (génération du lien) + `RESEND_API_KEY` / `EMAIL_FROM` (envoi) '
        + '+ `CITIZEN_APP_BASE_URL` (domaine de retour). Si non configuré, la route répond quand même `200` '
        + 'et logge un warning (aucun e-mail envoyé).\n\n'
        + '**Exemple body** : `{ "email": "citoyen@example.com" }`',
      body: SignInLinkBody,
      response: {
        200: SignInLinkResponse,
        400: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase()

    const admin = await getFirebaseAdmin()
    if (!admin) {
      req.log.warn({ email }, 'auth/signin-link: Firebase non configuré — aucun e-mail envoyé')
      return reply.code(200).send({ ok: true })
    }
    if (!isEmailConfigured()) {
      req.log.warn({ email }, 'auth/signin-link: RESEND_API_KEY absent — aucun e-mail envoyé')
      return reply.code(200).send({ ok: true })
    }

    try {
      const rawUrl = await admin.auth().generateSignInWithEmailLink(email, {
        // Domaine de retour contrôlé serveur. `handleCodeInApp` est requis pour
        // un lien email-link (la connexion se finalise dans l'app, pas via une
        // page Firebase hébergée).
        url: `${env.CITIZEN_APP_BASE_URL}/login`,
        handleCodeInApp: true,
      })
      const url = new URL(rawUrl)
      url.searchParams.set('lang', 'fr')
      const signInUrl = url.toString()
      const { subject, html, text } = renderSignInLinkEmail({ signInUrl, email })
      await sendEmail({ to: email, subject, html, text })
      req.log.info({ email }, 'auth/signin-link: e-mail de connexion envoyé')
    } catch (err) {
      // Réponse neutre côté client quelle que soit la défaillance (Resend down,
      // lien non généré…) ; on logge pour l'observabilité.
      req.log.error(
        { email, err: err instanceof Error ? err.message : String(err) },
        'auth/signin-link: échec de l\'envoi',
      )
    }

    return reply.code(200).send({ ok: true })
  })
}
