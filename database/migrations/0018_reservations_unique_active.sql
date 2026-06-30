-- 0018_reservations_unique_active.sql
--
-- ┌─ HISTORIQUE DE RENOMMAGE (2026-06-10) ──────────────────────────────────┐
-- │ Cette migration s'appelait initialement 0005_reservations_unique_active │
-- │ (PR #46, mergée la même journée que la PR #44 qui avait déjà pris le    │
-- │ numéro 0005 pour `0005_admin_multi_tenant_data.sql`). Pour respecter la │
-- │ convention "1 numéro = 1 migration unique" (cf. database/README.md),    │
-- │ elle a été renommée 0018 (prochain numéro libre après 0017).            │
-- │                                                                          │
-- │ Si la prod a déjà appliqué l'ancien nom (entrée                          │
-- │ `0005_reservations_unique_active.sql` dans schema_migrations), le runner │
-- │ va considérer 0018 comme jamais appliquée et la rejouer. Aucun problème  │
-- │ fonctionnel (idempotente via IF NOT EXISTS) mais on aura deux traces     │
-- │ dans schema_migrations. Nettoyage manuel à faire en prod après deploy :  │
-- │                                                                          │
-- │   DELETE FROM schema_migrations                                          │
-- │    WHERE filename = '0005_reservations_unique_active.sql';               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Garantit qu'un user ne peut avoir qu'une seule réservation "vivante"
-- (pending ou active) à la fois.
--
-- POST /v1/reservations fait déjà un SELECT préalable et renvoie 409
-- `already_active` pour l'erreur métier propre. Cet index est le filet de
-- sécurité contre les races concurrentes : deux POST en parallèle du même
-- user sur des lockers différents échappent au verrou Redis (qui est par
-- locker) et au SELECT non-locking. L'INSERT du 2e échouera avec 23505 et
-- la route traduit en `already_active`.
--
-- Statut 'overdue' volontairement exclu : on ne veut pas bloquer une
-- nouvelle réservation si l'ancienne est en retard non régularisé (le
-- recouvrement est géré par trust_score ailleurs).

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_active_per_user
  ON reservations(user_id)
  WHERE status IN ('pending', 'active');
