-- 0006_performance_indexes.sql
--
-- Index de performance pour les routes admin dashboard.
-- Chaque index est justifié par une query existante du code API.
--
-- Idempotent : CREATE INDEX IF NOT EXISTS partout.
--
-- Note : on garde les anciens index simples (idx_reservations_created,
-- idx_reservations_status, idx_reservations_distributor, idx_maintenance_status)
-- en place. PostgreSQL choisira le meilleur. Une migration future pourra
-- DROP les redondants une fois la stabilité confirmée en prod.

-- ─── reservations ─────────────────────────────────────────────────────────

-- Query : GET /v1/admin/reservations — pagination cursor par (created_at, id).
--   ORDER BY created_at DESC, id DESC
--   WHERE created_at < $cursor.createdAt OR (created_at = $cursor.createdAt AND id < $cursor.id)
-- L'index existant (created_at DESC) ne sert que partiellement : le tiebreaker
-- `id DESC` force un sort en mémoire. Avec un composite (created_at DESC, id DESC)
-- on a un index scan ordonné parfait pour la pagination.
CREATE INDEX IF NOT EXISTS idx_reservations_created_id
  ON reservations(created_at DESC, id DESC);

-- Query : GET /v1/admin/reservations?status=... — liste filtrée par status,
-- triée par created_at DESC. L'index simple (status) seul sert le filtre mais
-- pas le tri ; PG retombe sur un sort. Composite (status, created_at DESC)
-- élimine le sort et permet un index scan top-N.
-- Cardinalité status = 6 valeurs : sur 100k réservations, ~16k par bucket,
-- le composite reste rentable car il évite le sort.
CREATE INDEX IF NOT EXISTS idx_reservations_status_created
  ON reservations(status, created_at DESC);

-- Query : GET /v1/admin/stats/dashboard — pour les agrégats scopés commune,
-- la sous-requête `r.distributor_id IN (SELECT id FROM distributors WHERE commune_id = ?)`
-- est combinée à `r.created_at >= NOW() - INTERVAL`. Le composite
-- (distributor_id, created_at DESC) sert directement le bitmap scan + range scan.
-- Ordre des colonnes : distributor_id en premier car égalité (haute sélectivité
-- sur le filtre commune via N distributeurs), created_at en second pour le range.
CREATE INDEX IF NOT EXISTS idx_reservations_distributor_created
  ON reservations(distributor_id, created_at DESC);

-- ─── maintenance_tickets ──────────────────────────────────────────────────

-- Query : GET /v1/admin/maintenance-tickets — ORDER BY severity DESC, created_at DESC.
-- Aucun index existant ne couvre ce tri (idx_maintenance_status n'aide pas
-- pour le ORDER BY). Sur quelques milliers de tickets, le tri en mémoire reste
-- viable mais on évite tout doute en posant le composite qui matche exactement
-- le ORDER BY.
CREATE INDEX IF NOT EXISTS idx_maintenance_severity_created
  ON maintenance_tickets(severity DESC, created_at DESC);

-- Query : GET /v1/admin/maintenance-tickets?status=open — combine filtre status
-- + tri (severity DESC, created_at DESC). Le composite (status, severity DESC,
-- created_at DESC) permet un index scan ordonné quand status est filtré.
-- Status = 4 valeurs, 'open' et 'in_progress' représentent l'essentiel des
-- queries du dashboard maintenance.
CREATE INDEX IF NOT EXISTS idx_maintenance_status_severity_created
  ON maintenance_tickets(status, severity DESC, created_at DESC);
