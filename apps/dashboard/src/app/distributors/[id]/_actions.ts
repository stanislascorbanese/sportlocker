'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'

import {
  ApiError,
  ITEM_CONDITIONS,
  ItemCreateInput,
  createItem,
} from '../../../lib/api'

/**
 * État renvoyé par l'action "Charger un casier". Suit la même convention que
 * apps/dashboard/src/app/items/_actions.ts : un message global + des
 * erreurs par champ pour permettre au formulaire de surligner.
 */
export type LoadLockerState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
  /** id du casier chargé en cas de succès, pour permettre un focus côté UI. */
  loadedLockerId?: string
}

const LoadLockerForm = z.object({
  itemTypeId: z.string().uuid({ message: 'Type d\'article requis' }),
  rfidTag:    z.string().trim().min(4, '4 caractères minimum').max(64, '64 max'),
  condition:  z.enum(ITEM_CONDITIONS).default('new'),
  lockerId:   z.string().uuid({ message: 'Casier requis' }),
})

export async function loadLockerAction(
  distributorId: string,
  _prev: LoadLockerState,
  formData: FormData,
): Promise<LoadLockerState> {
  const parsed = LoadLockerForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
    }
    return { status: 'error', message: 'Vérifiez les champs du formulaire.', fieldErrors }
  }

  const input: ItemCreateInput = {
    itemTypeId:      parsed.data.itemTypeId,
    rfidTag:         parsed.data.rfidTag,
    condition:       parsed.data.condition,
    currentLockerId: parsed.data.lockerId,
  }

  try {
    await createItem(input)
  } catch (err) {
    return apiErrorToLoadState(err)
  }

  // Rafraîchit la vue détail + cache items global.
  revalidatePath(`/distributors/${distributorId}`)
  revalidateTag(`distributor:${distributorId}`)
  revalidateTag('distributors')
  revalidateTag('items')

  return {
    status: 'success',
    message: `Casier chargé · RFID ${parsed.data.rfidTag}`,
    loadedLockerId: parsed.data.lockerId,
  }
}

/**
 * Conversion ApiError → état formulaire avec messages français propres et
 * un mapping des codes connus côté backend admin-items.
 */
function apiErrorToLoadState(err: unknown): LoadLockerState {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return { status: 'error', message: 'Session expirée. Reconnectez-vous.' }
    }
    if (err.status === 403) {
      if (err.detail === 'forbidden_cross_commune') {
        return { status: 'error', message: 'Ce casier appartient à une autre commune.' }
      }
      if (err.detail === 'forbidden_orphan_create_super_admin_only') {
        return { status: 'error', message: 'Création sans casier réservée aux super-admins.' }
      }
      return { status: 'error', message: 'Action refusée — privilèges insuffisants.' }
    }
    if (err.status === 404) {
      if (err.detail === 'item_type_not_found') {
        return {
          status: 'error',
          message: 'Type d\'article introuvable.',
          fieldErrors: { itemTypeId: 'introuvable' },
        }
      }
      if (err.detail === 'locker_not_found') {
        return {
          status: 'error',
          message: 'Casier introuvable.',
          fieldErrors: { lockerId: 'introuvable' },
        }
      }
      return { status: 'error', message: 'Ressource introuvable.' }
    }
    if (err.status === 409) {
      if (err.detail === 'rfid_tag_conflict') {
        return {
          status: 'error',
          message: 'Ce tag RFID est déjà associé à un autre article.',
          fieldErrors: { rfidTag: 'déjà utilisé' },
        }
      }
      return { status: 'error', message: 'Conflit : ressource déjà existante.' }
    }
    return { status: 'error', message: `API ${err.status}: ${err.detail}` }
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue.' }
}
