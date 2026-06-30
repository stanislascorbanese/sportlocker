import { redirect } from 'next/navigation'

/**
 * Alias /item-types → /items?tab=types. Le CRUD complet (liste, créer,
 * éditer caution/durée, supprimer si aucun item physique) vit déjà dans
 * apps/dashboard/src/app/items et est partagé avec /items?tab=instances.
 *
 * On garde cette route pour matcher le naming back-office documenté
 * (POST /v1/admin/item-types) et faciliter la navigation directe.
 */
export const dynamic = 'force-static'

export default function ItemTypesAliasPage(): never {
  redirect('/items?tab=types')
}
