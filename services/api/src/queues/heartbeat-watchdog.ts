import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { communes, distributors, maintenanceTickets } from '../db/schema.js'
import { env } from '../config/env.js'
import { isEmailConfigured, sendEmail } from '../lib/email.js'
import { renderDistributorOfflineEmail } from '../emails/distributor-offline.js'

/**
 * Bascule en `offline` tout distributeur dont le dernier heartbeat date
 * de plus de 5 min, et lève une alerte ops (ticket auto + e-mail commune).
 *
 * Le badge "déconnecté" du dashboard est dérivé du `status` SQL — ce job
 * en est la seule source de vérité.
 *
 * ## Comportement
 *
 * 1. UPDATE des distributeurs `online` dont `last_seen_at < NOW() - 5min`
 *    → bascule à `offline`. Retourne les lignes affectées avec les colonnes
 *    nécessaires à l'alerting.
 * 2. Pour chaque distributeur flippé : appelle `raiseOfflineAlert()` qui
 *    crée un ticket de maintenance auto et envoie un e-mail à la commune.
 *
 * ## Idempotence
 *
 * Si le watchdog tourne toutes les 3 min, un distributeur qui reste offline
 * 10 min ne génère qu'**un seul** ticket et **un seul** e-mail — pas un par
 * tick. Garanti par deux mécanismes :
 *
 * - L'UPDATE SQL filtre sur `status = 'online'` — un distributeur déjà
 *   `offline` ne re-flip pas, donc on n'entre pas dans le bloc d'alerting.
 * - `raiseOfflineAlert()` re-vérifie qu'aucun ticket auto-source non-résolu
 *   n'existe sur ce distributeur dans les 24 dernières heures, comme garde
 *   ceinture-bretelles (cas d'un re-online → re-offline rapide).
 *
 * ## Tolérance aux erreurs
 *
 * Le flip de statut est commit AVANT l'alerting — si la création de ticket
 * ou l'envoi d'e-mail échoue, le `status='offline'` reste persistant et le
 * dashboard reflète bien la réalité. Les erreurs d'alerting sont loguées
 * mais ne propagent pas (le watchdog continue avec les distributeurs
 * suivants).
 */
export async function runHeartbeatWatchdog(log: FastifyBaseLogger): Promise<void> {
  const threshold = sql<Date>`NOW() - INTERVAL '5 minutes'`

  const flipped = await db
    .update(distributors)
    .set({ status: 'offline', updatedAt: new Date() })
    .where(and(
      eq(distributors.status, 'online'),
      lt(distributors.lastSeenAt, threshold),
    ))
    .returning({
      id: distributors.id,
      serialNumber: distributors.serialNumber,
      name: distributors.name,
      communeId: distributors.communeId,
      lastSeenAt: distributors.lastSeenAt,
    })

  if (flipped.length === 0) return

  log.warn({ count: flipped.length, ids: flipped.map((d) => d.id) }, 'distributors marked offline')

  for (const d of flipped) {
    try {
      await raiseOfflineAlert(d, log)
    } catch (err) {
      // L'alerting est best-effort : on ne propage pas, on continue avec
      // les autres distributeurs flippés sur ce tick.
      log.error({ err, distributorId: d.id }, 'heartbeat_watchdog_alert_failed')
    }
  }
}

interface FlippedDistributor {
  id: string
  serialNumber: string
  name: string
  communeId: string
  lastSeenAt: Date | null
}

/**
 * Lève l'alerte ops pour un distributeur qui vient de basculer offline.
 *
 * Crée un ticket de maintenance auto (severity 5 = critical, opened_by NULL
 * = signal d'auto-source) et envoie un e-mail à `commune.contact_email` si
 * configuré. Skip si un ticket auto non-résolu existe déjà sur ce
 * distributeur dans les 24 dernières heures (cas d'un re-online → re-offline
 * rapide, ou d'un job précédent qui aurait flippé sans flag de status SQL).
 */
async function raiseOfflineAlert(
  d: FlippedDistributor,
  log: FastifyBaseLogger,
): Promise<void> {
  // Idempotence : ne pas re-créer un ticket s'il en existe déjà un auto
  // (`opened_by IS NULL`) non-résolu créé dans les dernières 24h.
  const dedupWindow = sql<Date>`NOW() - INTERVAL '24 hours'`
  const existing = await db
    .select({ id: maintenanceTickets.id })
    .from(maintenanceTickets)
    .where(and(
      eq(maintenanceTickets.distributorId, d.id),
      isNull(maintenanceTickets.openedBy),
      gte(maintenanceTickets.createdAt, dedupWindow),
      sql`${maintenanceTickets.status} IN ('open', 'in_progress')`,
    ))
    .orderBy(desc(maintenanceTickets.createdAt))
    .limit(1)

  if (existing.length > 0) {
    log.info(
      { distributorId: d.id, existingTicketId: existing[0]!.id },
      'heartbeat_watchdog_alert_skipped_dedup',
    )
    return
  }

  // 1. Créer le ticket de maintenance auto-source.
  const lastSeenStr = d.lastSeenAt ? d.lastSeenAt.toISOString() : 'jamais'
  const [ticket] = await db
    .insert(maintenanceTickets)
    .values({
      distributorId: d.id,
      openedBy: null,            // signal d'auto-source
      severity: 5,                // critical
      status: 'open',
      title: `Distributeur hors-ligne : ${d.name}`,
      description: [
        `Aucun heartbeat MQTT reçu depuis plus de 5 minutes.`,
        `Dernier signe de vie : ${lastSeenStr}.`,
        `Serial : ${d.serialNumber}.`,
        ``,
        `Ticket généré automatiquement par runHeartbeatWatchdog.`,
        `Sera marqué 'resolved' automatiquement si le distributeur reprend`,
        `son heartbeat (à implémenter dans une PR suivante).`,
      ].join('\n'),
    })
    .returning({ id: maintenanceTickets.id })

  log.info(
    { distributorId: d.id, ticketId: ticket!.id },
    'heartbeat_watchdog_ticket_created',
  )

  // 2. Envoyer l'e-mail à la commune si configuré.
  if (!isEmailConfigured()) {
    log.warn({ distributorId: d.id }, 'heartbeat_watchdog_email_skipped_not_configured')
    return
  }

  const [commune] = await db
    .select({ name: communes.name, contactEmail: communes.contactEmail })
    .from(communes)
    .where(eq(communes.id, d.communeId))
    .limit(1)

  if (!commune?.contactEmail) {
    log.warn(
      { distributorId: d.id, communeId: d.communeId },
      'heartbeat_watchdog_email_skipped_no_contact',
    )
    return
  }

  const dashboardUrl = `${env.DASHBOARD_INVITE_BASE_URL.replace(/\/$/, '')}/distributors/${d.id}/health`
  const rendered = renderDistributorOfflineEmail({
    distributorName: d.name,
    serialNumber: d.serialNumber,
    lastSeenAt: d.lastSeenAt,
    communeName: commune.name,
    dashboardUrl,
  })

  try {
    await sendEmail({
      to: commune.contactEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    log.info({ distributorId: d.id, to: commune.contactEmail }, 'heartbeat_watchdog_email_sent')
  } catch (err) {
    // Échec d'envoi e-mail = pas fatal — le ticket est déjà créé, ops
    // peut le voir dans le dashboard. On log pour suivi.
    log.error({ err, distributorId: d.id }, 'heartbeat_watchdog_email_failed')
  }
}
