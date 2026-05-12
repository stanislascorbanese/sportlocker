import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: 'citizen' | 'operator' | 'admin' }
    user: { sub: string; role: 'citizen' | 'operator' | 'admin' }
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
