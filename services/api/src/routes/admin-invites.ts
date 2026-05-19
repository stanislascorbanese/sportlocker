import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { adminInvites, communes, users } from '../db/schema.js'
import { env } from '../config/env.js'
import { requireSuperAdmin } from '../lib/commune-scope.js'
import { verifyFirebaseToken } from './admin-auth.js'

const CreateInviteBody = z.object({
  email: z.string().email().max(180),
  communeId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(720).default(72),
})

const CreateInviteResponse = z.object({
  token: z.string(),
  inviteUrl: z.string().url(),
  email: z.string().email(),
  communeId: z.string().uuid(),
  expiresAt: z.string().datetime(),
})

const AcceptInviteBody = z.object({
  token: z.string().min(20).max(120),
  firebaseIdToken: z.string().min(20),
})

const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'super_admin']),
  communeId: z.string().uuid().nullable(),
})

const AcceptInviteResponse = z.object({
  sessionToken: z.string(),
  user: SessionUser,
})

const ErrorDTO = z.object({ error: z.string() })

/** Token cryptographiquement aléatoire, base64url, ~43 chars pour 32 octets. */
function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function adminInviteRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/admin/invites — super_admin only.
   * Génère un token one-time + inviteUrl à envoyer à l'admin tenant par email.
   * Le token n'est PAS récupérable après la création (stocké tel quel, mais
   * jamais relisté).
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      body: CreateInviteBody,
      response: {
        201: CreateInviteResponse,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const { email, communeId, expiresInHours } = req.body

    const [commune] = await db
      .select({ id: communes.id })
      .from(communes)
      .where(eq(communes.id, communeId))
      .limit(1)
    if (!commune) {
      return reply.code(404).send({ error: 'commune_not_found' })
    }

    const token = generateInviteToken()
    const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000)

    await db.insert(adminInvites).values({
      token,
      email: email.toLowerCase(),
      communeId,
      expiresAt,
    })

    const inviteUrl = `${env.DASHBOARD_INVITE_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`

    return reply.code(201).send({
      token,
      inviteUrl,
      email: email.toLowerCase(),
      communeId,
      expiresAt: expiresAt.toISOString(),
    })
  })

  /**
   * POST /v1/admin/invites/accept — accepte un invite et crée/promeut le user.
   *
   * Vérifie : token existe + non expiré + non déjà accepté + Firebase ID token valide.
   * Crée ou met à jour le user en DB avec role='admin' + commune_id du invite,
   * marque l'invite comme accepté, forge un JWT session.
   *
   * Tolère email mismatch : Firebase Auth est la source de vérité pour l'identité.
   * L'email de l'invite est juste l'adresse à qui le lien a été envoyé.
   */
  app.post('/accept', {
    schema: {
      body: AcceptInviteBody,
      response: {
        200: AcceptInviteResponse,
        400: ErrorDTO, 401: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO, 410: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const { token, firebaseIdToken } = req.body

    const [invite] = await db
      .select({
        token: adminInvites.token,
        email: adminInvites.email,
        communeId: adminInvites.communeId,
        expiresAt: adminInvites.expiresAt,
        acceptedAt: adminInvites.acceptedAt,
      })
      .from(adminInvites)
      .where(eq(adminInvites.token, token))
      .limit(1)

    if (!invite) {
      return reply.code(404).send({ error: 'invite_not_found' })
    }
    if (invite.acceptedAt) {
      return reply.code(409).send({ error: 'invite_already_accepted' })
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return reply.code(410).send({ error: 'invite_expired' })
    }

    const claims = await verifyFirebaseToken(firebaseIdToken, req.log)
    if (!claims) {
      return reply.code(401).send({ error: 'invalid_id_token' })
    }
    if (!claims.email) {
      return reply.code(400).send({ error: 'missing_email_claim' })
    }

    const now = new Date()
    const userEmail = claims.email.toLowerCase()

    // Upsert user + flag invite accepted dans la même transaction pour
    // garantir qu'un échec partiel ne laisse pas l'invite consommé sans user.
    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          firebaseUid: claims.sub,
          email: userEmail,
          displayName: claims.name ?? null,
          role: 'admin',
          communeId: invite.communeId,
          lastActiveAt: now,
        })
        .onConflictDoUpdate({
          target: users.firebaseUid,
          set: {
            // role pas mis à jour ici : un super_admin qui accepterait par erreur
            // un invite ne doit pas être dégradé en admin. La promotion citizen
            // → admin est faite en seconde étape ci-dessous.
            communeId: invite.communeId,
            email: userEmail,
            displayName: claims.name ?? null,
            lastActiveAt: now,
            updatedAt: now,
          },
        })
        .returning()

      // Promotion explicite vers admin uniquement si pas déjà admin/super_admin.
      if (u!.role === 'citizen' || u!.role === 'operator') {
        const [promoted] = await tx
          .update(users)
          .set({ role: 'admin', updatedAt: now })
          .where(eq(users.id, u!.id))
          .returning()
        await tx
          .update(adminInvites)
          .set({ acceptedAt: now })
          .where(eq(adminInvites.token, token))
        return promoted!
      }

      await tx
        .update(adminInvites)
        .set({ acceptedAt: now })
        .where(eq(adminInvites.token, token))

      return u!
    })

    if (created.role !== 'admin' && created.role !== 'super_admin') {
      // Sécurité : ne devrait jamais arriver vu le upsert + update ci-dessus.
      return reply.code(401).send({ error: 'not_an_admin' })
    }

    const sessionToken = app.jwt.sign({
      sub: created.id,
      email: created.email,
      role: created.role,
      ...(created.communeId ? { communeId: created.communeId } : {}),
    })

    return reply.code(200).send({
      sessionToken,
      user: {
        id: created.id,
        email: created.email,
        role: created.role,
        communeId: created.communeId,
      },
    })
  })
}
