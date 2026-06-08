-- 0016_premium_item_types_and_pricing.sql
--
-- Ajoute 2 articles PREMIUM d'exemple au catalogue + leur grille tarifaire
-- sur la commune PILOTE (e329798d — Louis / test LRSY).
--
-- Tarification par palier de valeur (proxy = caution) :
--   - Standard (ballons, < 30 €) : 1/2/3/4 €              (déjà posé, 0015)
--   - Premium  ×2 (30–80 €)      : 2/4/6/8 €   → Raquette de tennis (caution 60 €)
--   - Premium+ ×3 (> 80 €)       : 3/6/9/12 €  → Trottinette        (caution 120 €)
--
-- NB : articles d'EXEMPLE (renommables/supprimables via le dashboard Articles).
-- Ils apparaîtront sans stock tant qu'aucun item physique n'est rattaché.
--
-- Idempotent + sans risque, re-jouable :
--   - item_types : ON CONFLICT (slug) DO NOTHING.
--   - pricing_rules : INSERT ... SELECT joint sur communes + slug → no-op si la
--     commune/les items n'existent pas (base test/CI) ; ON CONFLICT DO UPDATE
--     pour converger vers la grille premium.
--   - d.duration_minutes <= it.max_duration_minutes respecté.

-- ─── 1. Articles premium d'exemple ──────────────────────────────────────────
INSERT INTO item_types (slug, name, category, caution_cents, max_duration_minutes)
VALUES
  ('raquette-tennis', 'Raquette de tennis', 'raquette',  6000, 240),
  ('trottinette',     'Trottinette',        'mobilite', 12000, 240)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Grille Premium ×2 — Raquette de tennis (2/4/6/8 €) ───────────────────
INSERT INTO pricing_rules (commune_id, item_type_id, duration_minutes, price_cents)
SELECT c.id, it.id, d.duration_minutes, d.price_cents
FROM communes c
CROSS JOIN item_types it
CROSS JOIN (VALUES
  (30,  200),
  (60,  400),
  (90,  600),
  (120, 800)
) AS d(duration_minutes, price_cents)
WHERE c.id = 'e329798d-4d17-4e83-9046-4b65db9b0dc7'
  AND it.slug = 'raquette-tennis'
  AND d.duration_minutes <= it.max_duration_minutes
ON CONFLICT (commune_id, item_type_id, duration_minutes)
  DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = NOW();

-- ─── 3. Grille Premium+ ×3 — Trottinette (3/6/9/12 €) ────────────────────────
INSERT INTO pricing_rules (commune_id, item_type_id, duration_minutes, price_cents)
SELECT c.id, it.id, d.duration_minutes, d.price_cents
FROM communes c
CROSS JOIN item_types it
CROSS JOIN (VALUES
  (30,  300),
  (60,  600),
  (90,  900),
  (120, 1200)
) AS d(duration_minutes, price_cents)
WHERE c.id = 'e329798d-4d17-4e83-9046-4b65db9b0dc7'
  AND it.slug = 'trottinette'
  AND d.duration_minutes <= it.max_duration_minutes
ON CONFLICT (commune_id, item_type_id, duration_minutes)
  DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = NOW();
