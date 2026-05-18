import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * Sémantique multi-tenant (cf. migration 0004) :
 *   - citizen     : utilisateur app mobile
 *   - admin       : responsable d'une commune — communeId obligatoire dans le JWT
 *   - super_admin : équipe SportLocker — bypass scoping, communeId optionnel
 *   - operator    : DEPRECATED, conservé pour compat enum Postgres
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      role: 'citizen' | 'operator' | 'admin' | 'super_admin'
      communeId?: string
    }
    user: {
      sub: string
      role: 'citizen' | 'operator' | 'admin' | 'super_admin'
      communeId?: string
    }
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SESSION_SECRET,
    sign: { expiresIn: '7d' },
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'unauthorized' })
    }
  })
})
