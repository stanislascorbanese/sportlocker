-- 0009_day_pass_duration.sql
--
-- Ajoute la durée 1440 min (24h = "Journée") aux CHECK constraints des
-- durations autorisées. Préserve l'esprit du forfait journalier (cf.
-- conversation utilisateur 2026-05-22) tout en gardant le modèle slots.
--
-- Le mécanisme métier existant fait le reste :
--   - Un tenant qui ne crée des `pricing_rules` QUE sur duration_minutes
--     = 1440 → propose uniquement un forfait journée
--   - Un tenant qui mixe 30/60/90/120/1440 → propose les deux modes
--   - Un tenant qui ignore 1440 → reste sur le modèle slots courts
--
-- Pas de nouveau champ DB nécessaire : la modularité passe par la présence
-- ou l'absence des règles pour chaque triplet (commune × item_type × duration).
--
-- Idempotent : on drop le CHECK existant et on le re-crée avec la nouvelle
-- liste. Safe à re-jouer.

-- ─── pricing_rules ────────────────────────────────────────────────────────

ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_duration_minutes_check;

ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_duration_minutes_check
  CHECK (duration_minutes IN (30, 60, 90, 120, 1440));

-- ─── reservations ─────────────────────────────────────────────────────────

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_duration_minutes_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_duration_minutes_check
  CHECK (duration_minutes IS NULL OR duration_minutes IN (30, 60, 90, 120, 1440));
