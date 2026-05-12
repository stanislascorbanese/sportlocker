import 'dotenv/config'

import { buildApp } from './app.js'
import { env } from './config/env.js'
import { startQueues } from './queues/index.js'

async function main() {
  const app = await buildApp()

  startQueues(app.log)

  await app.listen({ port: env.API_PORT, host: env.API_HOST })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutdown started')
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
