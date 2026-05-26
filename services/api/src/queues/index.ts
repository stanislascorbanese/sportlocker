import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'

import { env } from '../config/env.js'
import { runExpireReservations } from './expire-reservations.js'
import { runDetectOverdue } from './detect-overdue.js'
import { runHeartbeatWatchdog } from './heartbeat-watchdog.js'
import { runRgpdAnonymize } from './rgpd-anonymize.js'
import { runSlotReminders } from './slot-reminders.js'

// On passe des RedisOptions plutôt qu'une instance IORedis : BullMQ duplique
// la connexion par consumer (Queue/Worker) en propageant les options. Sinon
// chaque .duplicate() perd nos handlers et le moindre ECONNREFUSED finit
// imprimé en raw stderr.
const { hostname: host, port, password, username } = new URL(env.REDIS_URL)
const connection: ConnectionOptions = {
  host,
  port: port ? Number(port) : 6379,
  ...(password ? { password } : {}),
  ...(username ? { username } : {}),
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
}

// Tout est déjà loggé (une fois, throttlé) par redis/client.ts — on capte
// pour éviter que Node imprime des AggregateError ECONNREFUSED en stderr.
const swallow = () => undefined

export const queues = {
  expireReservations: new Queue('expire-reservations', { connection }),
  detectOverdue: new Queue('detect-overdue', { connection }),
  heartbeatWatchdog: new Queue('heartbeat-watchdog', { connection }),
  rgpdAnonymize: new Queue('rgpd-anonymize', { connection }),
  slotReminders: new Queue('slot-reminders', { connection }),
} as const

queues.expireReservations.on('error', swallow)
queues.detectOverdue.on('error', swallow)
queues.heartbeatWatchdog.on('error', swallow)
queues.rgpdAnonymize.on('error', swallow)
queues.slotReminders.on('error', swallow)

/**
 * Logger les jobs qui ont planté côté worker.
 *
 * Historiquement on `swallow`ait toutes les erreurs (errors connexion Redis
 * + jobs failed confondus) pour éviter de polluer stderr en cas de Redis
 * inaccessible. Conséquence : un bug dans un handler de cron disparaissait
 * sans laisser de trace, et on apprenait son existence en regardant Redis
 * (`ZRANGE bull:<queue>:failed`).
 *
 * Le compromis ici : on garde le `swallow` sur les `error` (connexion), mais
 * on log proprement les `failed` (job exécuté + handler throw). Ça donne la
 * stack via Pino dans Railway logs sans noyer les ECONNREFUSED.
 */
function attachJobFailureLogger(log: FastifyBaseLogger, worker: Worker, name: string): void {
  worker.on('failed', (job, err) => {
    log.error(
      {
        queue: name,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        failedReason: job?.failedReason,
        err,
      },
      'cron_job_failed',
    )
  })
}

/**
 * Démarre les workers et programme les jobs récurrents.
 * Cadence (cf. CLAUDE.md) :
 *   - expire-reservations : 2 min
 *   - detect-overdue      : 1 min
 *   - heartbeat-watchdog  : 3 min
 *   - rgpd-anonymize      : 1 jour (3h UTC ~ 4h Paris, hors heures de pointe)
 *   - slot-reminders      : 15 min (fenêtre H-1 des résas scheduled)
 */
export function startQueues(log: FastifyBaseLogger): void {
  const workersByName: Array<[string, Worker]> = [
    ['expire-reservations',
      new Worker('expire-reservations', async () => runExpireReservations(log), { connection })],
    ['detect-overdue',
      new Worker('detect-overdue', async () => runDetectOverdue(log), { connection })],
    ['heartbeat-watchdog',
      new Worker('heartbeat-watchdog', async () => runHeartbeatWatchdog(log), { connection })],
    ['rgpd-anonymize',
      new Worker('rgpd-anonymize', async () => runRgpdAnonymize(log), { connection })],
    ['slot-reminders',
      new Worker('slot-reminders', async () => runSlotReminders(log), { connection })],
  ]
  for (const [name, w] of workersByName) {
    // Connexion Redis : swallow (sinon stderr noyé en cas d'ECONNREFUSED,
    // déjà loggé throttlé par redis/client.ts).
    w.on('error', swallow)
    // Jobs qui throw dans leur handler : log la stack pour debug.
    attachJobFailureLogger(log, w, name)
  }

  void queues.expireReservations.add('cron', {}, {
    repeat: { every: 2 * 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })
  void queues.detectOverdue.add('cron', {}, {
    repeat: { every: 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })
  void queues.heartbeatWatchdog.add('cron', {}, {
    repeat: { every: 3 * 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })
  // RGPD : tourne tous les jours à 03:00 UTC. Pattern cron BullMQ standard.
  // Tunable via RGPD_ANONYMIZE_AFTER_DAYS (cf. rgpd-anonymize.ts).
  void queues.rgpdAnonymize.add('cron', {}, {
    repeat: { pattern: '0 3 * * *' },
    removeOnComplete: true,
    removeOnFail: 100,
  })
  // Rappel push 1h avant chaque créneau scheduled. Fenêtre cible 55-65 min :
  // un run toutes les 15 min suffit avec marge.
  void queues.slotReminders.add('cron', {}, {
    repeat: { every: 15 * 60 * 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  })

  log.info('queues started')
}
