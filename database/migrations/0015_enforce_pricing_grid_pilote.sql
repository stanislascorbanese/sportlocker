-- 0015_enforce_pricing_grid_pilote.sql
--
-- Applique (en écrasant) la grille tarifaire « standard » sur la commune PILOTE
-- (e329798d-4d17-4e83-9046-4b65db9b0dc7 — distributeurs « Louis » / « test LRSY »)
-- pour ballon-foot + ballon-volley.
--
-- Pourquoi cette migration en plus de 0014 :
--   0014 utilisait ON CONFLICT DO NOTHING → elle n'a PAS écrasé les prix de test
--   préexistants (30 min = 0,50 €, 90 min = 1,50 €). Ici on FORCE la grille
--   cible pour repartir sur une base cohérente.
--
-- Grille cible, par créneau :
--   30 min = 1,00 €  ·  1 h = 2,00 €  ·  1 h 30 = 3,00 €  ·  2 h = 4,00 €
-- (Pas de journée/1440 : ballons plafonnés à max_duration_minutes = 240.)
--
-- Idempotent + sans risque :
--   - ON CONFLICT (...) DO UPDATE → re-jouable, converge toujours vers la grille.
--   - Migration jouée UNE fois (schema_migrations) : après application, l'ops
--     peut ré-ajuster librement via le dashboard Tarification sans être réécrasé.
--   - INSERT ... SELECT filtré commune + slugs : no-op si absents (test/CI).
--   - d.duration_minutes <= it.max_duration_minutes : respecte la durée max/item.

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
ON CONFLICT (commune_id, item_type_id, duration_minutes)
  DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = NOW();
