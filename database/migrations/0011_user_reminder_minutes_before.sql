-- 0011_user_reminder_minutes_before.sql
--
-- Demande utilisateur (conversation 2026-05-22) : "Il faut aussi choisir
-- combien de temps avant on aimerai avoir le rappel (15 min par défaut)".
--
-- Ajoute une préférence par user qui pilote la fenêtre du cron
-- `slot-reminders`. Valeurs proposées côté UI : 15, 30, 60, 120 min.
-- Le cron rappelle le user `slot_start_at - reminder_minutes_before`.
--
-- Default 15 min (cf. décision produit utilisateur). Les users existants
-- héritent du défaut, ils peuvent l'ajuster ensuite depuis /profile.
--
-- CHECK contrainte côté SQL pour interdire les valeurs absurdes (négatif,
-- > 1 journée). L'UI doit proposer un set fixe mais le backend reste
-- défensif au cas où.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + DO block pour le CHECK.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_reminder_minutes_before_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_reminder_minutes_before_check
      CHECK (reminder_minutes_before BETWEEN 5 AND 1440);
  END IF;
END$$;
