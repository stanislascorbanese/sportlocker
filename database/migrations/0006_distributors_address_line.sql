-- 0006_distributors_address_line.sql
--
-- Garantit que la colonne `address_line` existe sur la table `distributors`.
--
-- Cette colonne est déjà déclarée dans database/schema.sql (le bootstrap
-- appliqué sur une DB vide), mais aucune migration versionnée ne l'avait
-- ajoutée explicitement. Pour les DB existantes créées avant l'ajout de la
-- colonne dans schema.sql, cette migration la crée. Pour les DB fraîches,
-- elle ne fait rien (IF NOT EXISTS).
--
-- Contexte : exposition de address_line dans l'API POST/PUT /v1/distributors
-- pour persister l'adresse postale auto-remplie par l'autocomplete BAN
-- (cf. apps/dashboard/src/app/distributors/AddressAutocomplete.tsx).
--
-- Idempotent : safe à re-jouer (IF NOT EXISTS).

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS address_line VARCHAR(200);
