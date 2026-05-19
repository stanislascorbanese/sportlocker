import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { redis } from '../redis/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      description: 'Renvoie 200 si le process tourne. Utilisé par l\'orchestrateur (ECS task health check).',
      response: {
        200: z.object({ status: z.literal('ok'), uptime: z.number() }),
      },
    },
  }, async () => ({ status: 'ok' as const, uptime: process.uptime() }))

  app.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe (DB + Redis)',
      description: 'Vérifie que la DB répond à un `SELECT 1` et que Redis ping → PONG. 503 si une dépendance est down.',
    },
  }, async (_req, reply) => {
    try {
      await db.execute(sql`SELECT 1`)
      const pong = await redis.ping()
      if (pong !== 'PONG') throw new Error('redis_not_ready')
      return { status: 'ready' }
    } catch (err) {
      app.log.error({ err }, 'readiness probe failed')
      return reply.code(503).send({ status: 'not_ready' })
    }
  })
}
