import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { redis } from '../redis/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      response: {
        200: z.object({ status: z.literal('ok'), uptime: z.number() }),
      },
    },
  }, async () => ({ status: 'ok' as const, uptime: process.uptime() }))

  app.get('/ready', async (_req, reply) => {
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
