import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { adminInvites, communes, users } from '../db/schema.js'
import { env } from '../config/env.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { verifyFirebaseToken } from './admin-auth.js'

const CreateInviteBody = z.object({
  email: z.string().email().max(180)
    .describe('Adresse email destinataire de l\'invite (indicative, l\'identité réelle vient de Firebase à l\'acceptation)'),
  communeId: z.string().uuid().optional()
    .describe('Tenant que l\'admin invité pourra administrer. Requis pour un super_admin ; '
      + 'ignoré/forcé à sa propre commune pour un admin scopé.'),
  expiresInHours: z.number().int().min(1).max(720).default(72)
    .describe('TTL du token d\'invite en heures (défaut 72h, max 30 jours)'),
})

const CreateInviteResponse = z.object({
  token: z.string().describe('Token one-time base64url (~43 chars). Non récupérable après création.'),
  inviteUrl: z.string().url().describe('URL d\'acceptation construite avec DASHBOARD_INVITE_BASE_URL'),
  email: z.string().email(),
  communeId: z.string().uuid(),
  expiresAt: z.string().datetime(),
})

const INVITE_STATUS = ['pending', 'accepted', 'expired'] as const

const InviteDTO = z.object({
  token: z.string(),
  email: z.string().email(),
  communeId: z.string().uuid(),
  communeName: z.string(),
  status: z.enum(INVITE_STATUS),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

const ListQuery = z.object({
  communeId: z.string().uuid().optional()
    .describe('Filtre (super_admin uniquement). Un admin scopé voit toujours sa seule commune.'),
})

const TokenParam = z.object({
  token: z.string().min(20).max(120),
})

const AcceptInviteBody = z.object({
  token: z.string().min(20).max(120).describe('Token reçu dans l\'inviteUrl (param `?token=`)'),
  firebaseIdToken: z.string().min(20)
    .describe('Firebase ID token de l\'admin qui accepte. L\'email du token devient l\'email du user créé.'),
})

const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'super_admin']),
  communeId: z.string().uuid().nullable(),
})

const AcceptInviteResponse = z.object({
  sessionToken: z.string().describe('JWT de session prêt à l\'emploi — pas besoin de re-login'),
  user: SessionUser,
})

const ErrorDTO = z.object({ error: z.string() })

/** Token cryptographiquement aléatoire, base64url, ~43 chars pour 32 octets. */
function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

type InviteRow = {
  token: string
  email: string
  communeId: string
  communeName: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

function inviteStatus(r: { acceptedAt: Date | null; expiresAt: Date }, now: number): typeof INVITE_STATUS[number] {
  if (r.acceptedAt) return 'accepted'
  if (r.expiresAt.getTime() < now) return 'expired'
  return 'pending'
}

function inviteRowToDto(r: InviteRow, now: number) {
  return {
    token: r.token,
    email: r.email,
    communeId: r.communeId,
    communeName: r.communeName,
    status: inviteStatus(r, now),
    expiresAt: r.expiresAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

export async function adminInviteRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * Résout la commune cible d'une action d'invite en respectant le scope.
   *   - super_admin : doit fournir un communeId explicite.
   *   - admin       : forcé à sa propre commune ; un communeId divergent est rejeté.
   * Renvoie null (et a déjà envoyé la réponse d'erreur) si invalide.
   */
  function resolveTargetCommune(
    scope: { communeId: string } | null,
    bodyCommuneId: string | undefined,
    reply: import('fastify').FastifyReply,
  ): string | null {
    if (scope) {
      if (bodyCommuneId && bodyCommuneId !== scope.communeId) {
        reply.code(403).send({ error: 'forbidden_cross_commune' })
        return null
      }
      return scope.communeId
    }
    // super_admin
    if (!bodyCommuneId) {
      reply.code(400).send({ error: 'commune_id_required' })
      return null
    }
    return bodyCommuneId
  }

  /**
   * GET /v1/admin/invites — liste les invitations.
   *   - super_admin : toutes (filtre optionnel `communeId`).
   *   - admin       : uniquement sa commune.
   * Le statut est dérivé (`pending` / `accepted` / `expired`). Le `token` est
   * renvoyé pour permettre les actions renvoyer/révoquer (l'appelant est déjà
   * admin de la commune concernée — pas d'escalade de privilège).
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Invites'],
      summary: 'Liste des invitations admin',
      description: 'Statut dérivé : `pending` (en attente), `accepted` (acceptée), `expired` (expirée). '
        + 'Admin scopé : sa commune uniquement. Tri par date d\'envoi DESC.',
      security: [{ bearerAuth: [] }],
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(InviteDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const conditions = []
    if (auth.scope) {
      conditions.push(eq(adminInvites.communeId, auth.scope.communeId))
    } else if (req.query.communeId) {
      conditions.push(eq(adminInvites.communeId, req.query.communeId))
    }

    const rows = await db
      .select({
        token: adminInvites.token,
        email: adminInvites.email,
        communeId: adminInvites.communeId,
        communeName: communes.name,
        expiresAt: adminInvites.expiresAt,
        acceptedAt: adminInvites.acceptedAt,
        createdAt: adminInvites.createdAt,
      })
      .from(adminInvites)
      .innerJoin(communes, eq(communes.id, adminInvites.communeId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(adminInvites.createdAt))
      .limit(500)

    const now = Date.now()
    return { items: rows.map((r) => inviteRowToDto(r, now)) }
  })

  /**
   * POST /v1/admin/invites — crée une invitation.
   *   - super_admin : `communeId` requis (n'importe quel tenant).
   *   - admin       : invite dans sa propre commune (communeId forcé au scope).
   *
   * Génère un token one-time + inviteUrl à envoyer à l'admin tenant par email.
   * Le token n'est PAS récupérable après la création (jamais relisté ailleurs
   * que via la liste ci-dessus, réservée aux admins de la commune).
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Invites'],
      summary: 'Crée une invitation admin (admin de sa commune ou super_admin)',
      description: 'Génère un token cryptographique + `inviteUrl` à envoyer manuellement par email à l\'admin tenant. '
        + 'Un super_admin choisit la commune (`communeId` requis) ; un admin scopé invite dans la sienne.\n\n'
        + '**Exemple body** : `{ "email": "marie@bordeaux.fr", "communeId": "9f0…", "expiresInHours": 168 }`',
      security: [{ bearerAuth: [] }],
      body: CreateInviteBody,
      response: {
        201: CreateInviteResponse,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { email, expiresInHours } = req.body
    const communeId = resolveTargetCommune(auth.scope, req.body.communeId, reply)
    if (!communeId) return

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
   * POST /v1/admin/invites/:token/resend — régénère le token + repousse
   * l'expiration d'une invite encore en attente. Renvoie le nouveau lien.
   * Une invite déjà acceptée ne peut pas être renvoyée (409).
   */
  app.post('/:token/resend', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Invites'],
      summary: 'Régénère et renvoie une invitation en attente',
      description: 'Génère un nouveau token, repousse l\'expiration (`expiresInHours`, défaut 72h) et renvoie le '
        + 'nouveau lien. 404 si hors scope/inexistante, 409 si déjà acceptée.',
      security: [{ bearerAuth: [] }],
      params: TokenParam,
      body: z.object({
        expiresInHours: z.number().int().min(1).max(720).default(72),
      }),
      response: {
        200: CreateInviteResponse,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const scopeConditions = [eq(adminInvites.token, req.params.token)]
    if (auth.scope) scopeConditions.push(eq(adminInvites.communeId, auth.scope.communeId))

    const [invite] = await db
      .select({
        email: adminInvites.email,
        communeId: adminInvites.communeId,
        acceptedAt: adminInvites.acceptedAt,
      })
      .from(adminInvites)
      .where(and(...scopeConditions))
      .limit(1)

    if (!invite) return reply.code(404).send({ error: 'invite_not_found' })
    if (invite.acceptedAt) return reply.code(409).send({ error: 'invite_already_accepted' })

    const newToken = generateInviteToken()
    const expiresAt = new Date(Date.now() + req.body.expiresInHours * 3_600_000)

    await db
      .update(adminInvites)
      .set({ token: newToken, expiresAt, createdAt: new Date() })
      .where(eq(adminInvites.token, req.params.token))

    const inviteUrl = `${env.DASHBOARD_INVITE_BASE_URL}/accept-invite?token=${encodeURIComponent(newToken)}`

    return reply.code(200).send({
      token: newToken,
      inviteUrl,
      email: invite.email,
      communeId: invite.communeId,
      expiresAt: expiresAt.toISOString(),
    })
  })

  /**
   * DELETE /v1/admin/invites/:token — révoque (supprime) une invitation.
   * Idempotent côté métier : 404 si l'invite n'existe pas / hors scope.
   */
  app.delete('/:token', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Invites'],
      summary: 'Révoque une invitation',
      description: 'Supprime l\'invitation (le lien devient inutilisable). Admin scopé : 404 si hors commune.',
      security: [{ bearerAuth: [] }],
      params: TokenParam,
      response: {
        204: z.null(),
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const conditions = [eq(adminInvites.token, req.params.token)]
    if (auth.scope) conditions.push(eq(adminInvites.communeId, auth.scope.communeId))

    const deleted = await db
      .delete(adminInvites)
      .where(and(...conditions))
      .returning({ token: adminInvites.token })

    if (deleted.length === 0) return reply.code(404).send({ error: 'invite_not_found' })

    return reply.code(204).send(null)
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
      tags: ['Admin — Invites'],
      summary: 'Accepte une invitation et crée la session',
      description: 'Vérifie : token existe + non expiré + non déjà accepté + Firebase ID token valide. '
        + 'Upsert user en DB avec `role=admin` + `commune_id` du invite, marque l\'invite consommé, '
        + 'renvoie un sessionToken prêt à l\'emploi.\n\n'
        + 'Tolère email mismatch (Firebase est source de vérité). Pas d\'auth Bearer requise (le token invite '
        + 'est le secret).\n\n'
        + '**Erreurs** : 404 `invite_not_found` · 409 `invite_already_accepted` · 410 `invite_expired` · '
        + '401 `invalid_id_token` · 400 `missing_email_claim`.',
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
