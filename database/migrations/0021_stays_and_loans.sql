-- 0021_stays_and_loans.sql
--
-- Le prêt de matériel en camping, sans compte et sans paiement.
--
-- Contexte : le pivot de septembre 2026 remplace le vacancier-avec-compte par
-- un vacancier qui n'existe que le temps de son séjour. Il ne crée pas de
-- compte, ne saisit pas de carte, et ne revient pas l'année suivante. La table
-- `reservations` ne convient pas pour ça : elle exige un `user_id`, porte un
-- `qr_jti`, un `price_cents` et un créneau horaire — quatre notions qui n'ont
-- plus de sens. Plutôt que de rendre la moitié de ses colonnes nullables, on
-- pose deux tables neuves et on laisse `reservations` au modèle historique.
--
--   stays  : un séjour, tel que le camping le connaît déjà à son check-in.
--   loans  : un article sorti d'un casier, et rentré ou pas.
--
-- Ce qu'on ne stocke pas, volontairement : aucun email, aucun téléphone, aucune
-- adresse, aucune géolocalisation. Un séjour, c'est un numéro d'emplacement, un
-- nom de famille et deux dates — le strict nécessaire pour rendre un ballon à
-- la bonne personne et facturer ce qui ne revient pas.
--
-- Idempotent : IF NOT EXISTS partout → re-jouable sans risque.

-- ─── stays ─────────────────────────────────────────────────────────────────
--
-- `stay_ref` est le numéro d'emplacement ou de réservation tel qu'il est écrit
-- sur le carnet de séjour du client. Il est unique par camping et par saison,
-- pas globalement : deux campings ont tous les deux un emplacement 12.

CREATE TABLE IF NOT EXISTS stays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id    UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  stay_ref      VARCHAR(32)  NOT NULL,
  last_name     VARCHAR(120) NOT NULL,
  first_name    VARCHAR(120),
  arrives_on    DATE NOT NULL,
  departs_on    DATE NOT NULL,
  -- Trace de l'import qui a créé la ligne, pour pouvoir rejouer ou annuler un
  -- fichier entier sans toucher aux séjours saisis autrement.
  import_batch  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stays_dates_check CHECK (departs_on >= arrives_on)
);

-- Un même numéro d'emplacement est réutilisé d'un client à l'autre dans la
-- saison : l'unicité porte donc sur (camping, référence, date d'arrivée).
CREATE UNIQUE INDEX IF NOT EXISTS idx_stays_commune_ref_arrival
  ON stays(commune_id, stay_ref, arrives_on);

-- Recherche d'identification : on cherche par référence sur un camping donné,
-- puis on compare le nom en mémoire (insensible casse/accents).
CREATE INDEX IF NOT EXISTS idx_stays_commune_ref ON stays(commune_id, stay_ref);

-- Séjours en cours à une date donnée — utilisé par l'écran d'accueil et par la
-- purge de fin de saison.
CREATE INDEX IF NOT EXISTS idx_stays_window ON stays(commune_id, departs_on);

CREATE INDEX IF NOT EXISTS idx_stays_import_batch ON stays(import_batch)
  WHERE import_batch IS NOT NULL;

-- ─── loans ─────────────────────────────────────────────────────────────────
--
-- Un emprunt. Pas de statut énuméré : `returned_at IS NULL` suffit à dire si
-- l'article est dehors. Les états intermédiaires de l'ancien modèle
-- (scheduled, pending, expired) n'existent pas ici — le casier s'ouvre ou ne
-- s'ouvre pas, il n'y a rien à réserver d'avance.

CREATE TABLE IF NOT EXISTS loans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id            UUID NOT NULL REFERENCES stays(id) ON DELETE RESTRICT,
  distributor_id     UUID NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  locker_id          UUID NOT NULL REFERENCES lockers(id) ON DELETE RESTRICT,
  item_id            UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  borrowed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at        TIMESTAMPTZ,
  -- Casier utilisé au retour : le vacancier repose l'article où il y a de la
  -- place, pas forcément là où il l'a pris.
  return_locker_id   UUID REFERENCES lockers(id) ON DELETE SET NULL,
  -- Renseigné quand le camping passe la ligne en compte séjour. On ne stocke
  -- aucun montant : SportLocker ne connaît pas le tarif du camping.
  charged_at         TIMESTAMPTZ,
  charged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loans_return_order_check CHECK (returned_at IS NULL OR returned_at >= borrowed_at)
);

-- Un seul emprunt vivant par séjour. C'est la règle produit tranchée en
-- septembre 2026 : une famille fait deux allers-retours plutôt que de vider la
-- borne. La contrainte est ici et pas seulement dans le code, parce que deux
-- requêtes simultanées passeraient à travers une vérification applicative.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_one_live_per_stay
  ON loans(stay_id) WHERE returned_at IS NULL;

-- Ce qui est encore dehors, borne par borne — la requête de l'écran « Non
-- rendus » et du bloc « À faire » de la page Aujourd'hui.
CREATE INDEX IF NOT EXISTS idx_loans_open
  ON loans(distributor_id, borrowed_at DESC) WHERE returned_at IS NULL;

-- Un article ne peut pas être dehors deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_one_live_per_item
  ON loans(item_id) WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loans_stay       ON loans(stay_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrowed   ON loans(borrowed_at DESC);

-- Statistiques d'usage : combien d'emprunts par jour sur un camping.
CREATE INDEX IF NOT EXISTS idx_loans_distributor_borrowed
  ON loans(distributor_id, borrowed_at DESC);
