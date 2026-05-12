-- 0001_fn_locker_is_available.sql
--
-- Fonction de disponibilité d'un casier — appelée par POST /v1/reservations
-- avant de tenter la création.
--
-- Un casier est disponible si :
--   - il existe
--   - son état est 'idle'
--   - il contient bien un item physique (current_item_id non null)
--
-- À appliquer également sur les bases bootstrap via schema.sql.

CREATE OR REPLACE FUNCTION fn_locker_is_available(p_locker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lockers
    WHERE id = p_locker_id
      AND state = 'idle'
      AND current_item_id IS NOT NULL
  );
$$;
