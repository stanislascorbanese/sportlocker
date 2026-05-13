import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createReservation, type Reservation } from '../api/reservations'

interface CreateReservationInput {
  lockerId: string
  itemId: string
  communeId: string
}

/**
 * Mutation autour de POST /v1/reservations. Invalide les queries impactées
 * (mes réservations, détail distributeur) au succès. Les callers gèrent la
 * navigation eux-mêmes via le retour `mutateAsync` ou `onSuccess` local.
 */
export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation<Reservation, Error, CreateReservationInput>({
    mutationFn: ({ lockerId, itemId, communeId }) =>
      createReservation(lockerId, itemId, communeId),
    onSuccess: (reservation) => {
      qc.invalidateQueries({ queryKey: ['my-reservations'] })
      qc.invalidateQueries({ queryKey: ['distributor', reservation.distributorId] })
    },
  })
}
