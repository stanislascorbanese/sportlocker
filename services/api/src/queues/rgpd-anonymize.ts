import { and, isNull, isNotNull, lt, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { reviews, users } from '../db/schema.js'

/**
 * Anonymise les utilisateurs qui ont demandé la suppression RGPD il y a
 * plus de 30 jours et qui n'ont pas encore été anonymisés.
 *
 * Stratégie :
 *   - On NE SUPPRIME PAS la ligne (intégrité référentielle : réservations,
 *     locker_events, reviews y font foreign-key avec ON DELETE RESTRICT).
 *   - On PSEUDONYMISE : tous les PII directs sont effacés ou remplacés par
 *     des placeholders déterministes basés sur l'ID utilisateur. Le scoring
 *     opérationnel (trust_score, total_reservations) est préservé pour les
 *     stats agrégées par commune, mais ne permet plus de remonter au humain.
 *
 * Champs touchés sur la table `users` :
 *   - email             → `deleted-<id>@anonymized.local` (unique préservé)
 *   - firebase_uid      → `deleted-<id>` (unique préservé, bloque le re-login)
 *   - display_name      → NULL
 *   - phone             → NULL
 *   - banned_reason     → NULL (peut contenir des éléments factuels mais
 *                                 souvent jugement humain → effacé par défaut)
 *   - last_active_at    → NULL (efface la trace temporelle)
 *   - gdpr_deleted_at   → NOW() (timestamp d'anonymisation effective)
 *
 * Champs préservés (anonymes par construction) :
 *   - id, created_at, role, commune_id, trust_score, total_reservations,
 *     is_banned, gdpr_delete_requested_at
 *
 * Champs touchés sur la table `reviews` (du user concerné) :
 *   - comment           → NULL (texte libre = potentiellement PII)
 *
 * Le job tourne 1 fois par jour. Idempotent : un user déjà anonymisé
 * (`gdpr_deleted_at IS NOT NULL`) est ignoré.
 *
 * RGPD compliance : 30 jours est la fenêtre de "rétractation" standard
 * post-demande de suppression (cf. CNIL guidance art. 17). Tunable via
 * RGPD_ANONYMIZE_AFTER_DAYS env var si besoin (défaut 30).
 */
export async function runRgpdAnonymize(log: FastifyBaseLogger): Promise<void> {
  const days = Number(process.env['RGPD_ANONYMIZE_AFTER_DAYS'] ?? 30)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    log.warn({ days }, 'rgpd-anonymize: invalid RGPD_ANONYMIZE_AFTER_DAYS, falling back to 30')
  }
  const window = Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30

  // Récupère d'abord les IDs candidats. On les pseudonymise un par un
  // (UPDATE séparé) plutôt qu'en bulk : ça permet de construire les
  // placeholders avec l'`id` du user en SQL (gen_random_uuid n'est pas idéal :
  // on veut un mapping stable id→email pour pouvoir auditer).
  const cutoff = new Date(Date.now() - window * 24 * 60 * 60 * 1000)

  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      isNotNull(users.gdprDeleteRequestedAt),
      lt(users.gdprDeleteRequestedAt, cutoff),
      isNull(users.gdprDeletedAt),
    ))
    .limit(500) // garde-fou : on traite par batch, le job re-tournera demain

  if (candidates.length === 0) return

  let anonymized = 0
  let reviewsCleared = 0

  for (const { id } of candidates) {
    // 1. Pseudonymise le user. On utilise NOW() côté SQL plutôt que de passer
    //    un objet Date en paramètre — le driver postgres.js ne sait pas le
    //    sérialiser dans un sql template raw, et NOW() garantit un timestamp
    //    cohérent entre les deux colonnes sans drift d'horloge appli/DB.
    await db.execute(sql`
      UPDATE users
         SET email           = 'deleted-' || ${id} || '@anonymized.local',
             firebase_uid    = 'deleted-' || ${id},
             display_name    = NULL,
             phone           = NULL,
             banned_reason   = NULL,
             last_active_at  = NULL,
             gdpr_deleted_at = NOW(),
             updated_at      = NOW()
       WHERE id = ${id}::uuid
    `)
    anonymized++

    // 2. Efface les commentaires de reviews liés (texte libre = PII potentiel).
    const cleared = await db.execute<{ id: string }>(sql`
      UPDATE reviews
         SET comment = NULL
       WHERE user_id = ${id}::uuid
         AND comment IS NOT NULL
      RETURNING id
    `)
    reviewsCleared += cleared.length
  }

  log.info({ anonymized, reviewsCleared, window }, 'rgpd anonymization done')
}
