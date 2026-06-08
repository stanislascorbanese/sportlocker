-- 0014_seed_pricing_grid_pilote.sql
--
-- Seed de la grille tarifaire pour la commune PILOTE
-- (e329798d-4d17-4e83-9046-4b65db9b0dc7 — distributeurs « Louis » / « test LRSY »).
--
-- Grille « matériel standard » (ballons), par créneau :
--   30 min = 1,00 €  ·  1 h = 2,00 €  ·  1 h 30 = 3,00 €  ·  2 h = 4,00 €
--
-- Pas de forfait journée (1440) : les ballons ont max_duration_minutes = 240,
-- donc seules les durées <= 240 sont valides (le filtre ci-dessous le garantit).
--
-- Idempotent + sans risque, re-jouable :
--   - ON CONFLICT (commune_id, item_type_id, duration_minutes) DO NOTHING
--     → n'écrase JAMAIS un prix déjà fixé par l'ops via le dashboard Tarification.
--   - INSERT ... SELECT filtré sur la commune + les slugs : no-op si la commune
--     ou les item_types n'existent pas (base de test / CI / fresh DB) → 0 erreur.
--   - d.duration_minutes <= it.max_duration_minutes : respecte la durée max/item.
--
-- NB : grille « standard ». Pour du matériel premium (raquette, etc.), ajuster
-- (×2/×3) via le dashboard Tarification (admin) plutôt qu'en migration.

INSERT INTO pricing_rules (commune_id, item_type_id, duration_minutes, price_cents)
SELECT c.id, it.id, d.duration_minutes, d.price_cents
FROM communes c
CROSS JOIN item_types it
CROSS JOIN (VALUES
  (30,  100),
  (60,  200),
  (90,  300),
  (120, 400)
) AS d(duration_minutes, price_cents)
WHERE c.id = 'e329798d-4d17-4e83-9046-4b65db9b0dc7'
  AND it.slug IN ('ballon-foot', 'ballon-volley')
  AND d.duration_minutes <= it.max_duration_minutes
ON CONFLICT (commune_id, item_type_id, duration_minutes) DO NOTHING;
