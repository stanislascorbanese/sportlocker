'use server'

import { revalidateTag } from 'next/cache'

import { markLoanCharged } from '../../lib/api'

/**
 * Marque un emprunt « passé en compte séjour », ou annule le marquage.
 *
 * Renvoie un booléen plutôt que de lever : le bouton est optimiste et doit
 * pouvoir revenir en arrière proprement quand le réseau du camping lâche. Une
 * exception non rattrapée afficherait l'écran d'erreur de Next à quelqu'un qui
 * fait le tour des emplacements avec son téléphone.
 */
export async function markLoanChargedAction(id: string, charged: boolean): Promise<boolean> {
  try {
    await markLoanCharged(id, charged)
    revalidateTag('loans')
    return true
  } catch {
    return false
  }
}
