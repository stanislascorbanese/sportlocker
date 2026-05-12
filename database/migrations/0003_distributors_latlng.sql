-- 0003_distributors_latlng.sql
--
-- Postgres déployé en image vanilla (postgres:16-alpine), sans PostGIS.
-- On remplace la colonne geography(POINT) par deux colonnes scalaires.
-- Pour la recherche de proximité, on calculera Haversine en app code
-- (suffisant pour < 100 k distributeurs).

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Index B-tree composé pour bornage rapide en bounding-box.
CREATE INDEX IF NOT EXISTS idx_distributors_latlng ON distributors(latitude, longitude);
