-- 0020_maintenance_comments_and_history.sql
--
-- Workflow complet des tickets de maintenance (page détail /maintenance/[id]).
--
-- Ajoute deux colonnes JSONB sur `maintenance_tickets` :
--   - comments       : commentaires internes (fil de discussion opérateur).
--   - status_history : journal des transitions de statut (audit léger).
--
-- Choix « minimal » : pas de table dédiée `maintenance_ticket_comments` ni
-- `maintenance_ticket_events`. Le volume par ticket est faible (quelques
-- commentaires / transitions), toujours lu en même temps que le ticket, et
-- jamais requêté transversalement → un JSONB append-only suffit et évite un
-- JOIN + une table de plus. Si un besoin de recherche cross-tickets émerge,
-- une migration ultérieure pourra normaliser.
--
-- Forme d'un commentaire :
--   { "id": uuid, "authorId": uuid, "authorEmail": text,
--     "authorName": text|null, "body": text, "createdAt": iso8601 }
--
-- Forme d'une transition de statut :
--   { "from": maintenance_status|null, "to": maintenance_status,
--     "at": iso8601, "byId": uuid|null, "byEmail": text|null }
--
-- Idempotent : ADD COLUMN IF NOT EXISTS → re-jouable sans risque.

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS comments       JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;
