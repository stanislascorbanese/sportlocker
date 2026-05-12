-- 0002_extension_columns.sql
--
-- Prolongation d'emprunt :
--   - reservations.due_at : deadline de retour (renseignée à l'ouverture du
--     casier, puis décalée à chaque prolongation).
--   - reservations.extension_count : nombre de prolongations effectuées (max 2).
--   - locker_event_type : valeur 'extended' pour tracer l'événement.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extension_count SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_reservations_due_at ON reservations(due_at)
  WHERE status IN ('active', 'overdue');

ALTER TYPE locker_event_type ADD VALUE IF NOT EXISTS 'extended';
