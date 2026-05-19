import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { env } from '../config/env.js'

const LoginBody = z.object({
  firebaseIdToken: z.string().min(20),
})

const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'super_admin']),
  communeId: z.string().uuid().nullable(),
})

const LoginResponse = z.object({
  sessionToken: z.string(),
  user: SessionUser,
})

const ErrorDTO = z.object({ error: z.string() })

interface FirebaseClaims {
  sub: string
  email?: string
  name?: string
}

/**
 * Décode un JWT Firebase *sans vérifier la signature* — fallback dev quand
 * FIREBASE_SERVICE_ACCOUNT_KEY n'est pas configuré. JAMAIS en production.
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

let firebaseInitialized = false
async function verifyFirebaseTokenSecure(idToken: string): Promise<FirebaseClaims | null> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY || !env.FIREBASE_PROJECT_ID) return null
  try {
    const admin = (await import('firebase-admin')).default
    if (!firebaseInitialized) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        projectId: env.FIREBASE_PROJECT_ID,
      })
      firebaseInitialized = true
    }
    const decoded = await admin.auth().verifyIdToken(idToken)
    return {
      sub: decoded.uid,
      ...(decoded.email !== undefined && { email: decoded.email }),
      ...(decoded.name !== undefined && { name: decoded.name as string }),
    }
  } catch {
    return null
  }
}

/** Vérification Firebase avec fallback dev. Logique factorisée pour usage
 *  partagé avec le flow accept-invite. */
export async function verifyFirebaseToken(
  idToken: string,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<FirebaseClaims | null> {
  const secure = await verifyFirebaseTokenSecure(idToken)
  if (secure) return secure
  if (env.NODE_ENV === 'production') return null
  const unsafe = decodeFirebaseTokenUnsafe(idToken)
  if (unsafe) {
    log.warn(
      { sub: unsafe.sub },
      'admin-auth: token decoded WITHOUT signature verification (dev mode only)',
    )
  }
  return unsafe
}

export async function adminAuthRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/admin/auth/login — échange un Firebase ID token contre un JWT
   * de session admin. Le user DOIT exister en DB avec role ∈ {admin, super_admin}.
   *
   * Pas d'auto-création : un admin n'arrive en DB que via le flow d'invite
   * (POST /v1/admin/invites/accept) ou par opération manuelle super_admin.
   */
  app.post('/login', {
    schema: {
      body: LoginBody,
      response: {
        200: LoginResponse,
        400: ErrorDTO,
        401: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const claims = await verifyFirebaseToken(req.body.firebaseIdToken, req.log)
    if (!claims) {
      return reply.code(401).send({ error: 'invalid_id_token' })
    }

    const [u] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        communeId: users.communeId,
        isBanned: users.isBanned,
        gdprDeletedAt: users.gdprDeletedAt,
      })
      .from(users)
      .where(eq(users.firebaseUid, claims.sub))
      .limit(1)

    if (!u) {
      return reply.code(401).send({ error: 'admin_user_not_found' })
    }
    if (u.role !== 'admin' && u.role !== 'super_admin') {
      return reply.code(401).send({ error: 'not_an_admin' })
    }
    if (u.isBanned) {
      return reply.code(401).send({ error: 'user_banned' })
    }
    // RGPD : un user soft-deleted (gdpr_deleted_at posé par le cron de
    // nettoyage 30j) ne peut plus se reconnecter, même s'il a un compte
    // Firebase encore actif. Le cron suppose que toute session admin
    // future serait illégitime sur des données anonymisées.
    if (u.gdprDeletedAt !== null) {
      return reply.code(401).send({ error: 'user_deleted' })
    }
    // Multi-tenant : un admin (par opposition à super_admin) DOIT avoir
    // une commune assignée, sinon il pourrait se logger et émettre un JWT
    // sans communeId → bypass de tout le scoping commune côté
    // requireAdminScope (qui renvoie scope=null si pas de communeId).
    // Fail-safe : on refuse au login plutôt que de risquer une fuite
    // cross-tenant en aval.
    if (u.role === 'admin' && !u.communeId) {
      return reply.code(401).send({ error: 'admin_missing_commune' })
    }

    const sessionToken = app.jwt.sign({
      sub: u.id,
      email: u.email,
      role: u.role,
      ...(u.communeId ? { communeId: u.communeId } : {}),
    })

    return reply.code(200).send({
      sessionToken,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        communeId: u.communeId,
      },
    })
  })
}
