'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/**
 * Provider React Query — un client par instance d'arbre React (singleton
 * useState pour survivre aux re-renders sans recréer le client).
 *
 * Defaults adaptés au PWA citoyen : staleTime court pour avoir des données
 * fraîches (distributeurs disponibles, casiers idle), retry conservateur
 * pour éviter de marteler l'API depuis un mobile sur 4G faible.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
