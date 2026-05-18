import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { env } from '../config/env.js'

const RegisterBody = z.object({
  idToken: z.string().min(20),
})

const UserDTO = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: z.enum(['citizen', 'operator', 'admin', 'super_admin']),
  trustScore: z.number().int(),
  communeId: z.string().uuid().nullable(),
})

const RegisterResponse = z.object({
  sessionToken: z.string(),
  user: UserDTO,
})

const ErrorDTO = z.object({ error: z.string() })

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

    const sessionToken = app.jwt.sign({ sub: u!.id, role: u!.role })

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
}
