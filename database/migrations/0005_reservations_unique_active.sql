-- 0005_reservations_unique_active.sql
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
