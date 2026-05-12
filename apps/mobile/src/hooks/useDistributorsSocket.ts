import { useEffect } from 'react'
import Constants from 'expo-constants'

import { useDistributorsStore } from '../store/distributors'

const WS_URL =
  (Constants.expoConfig?.extra?.wsUrl as string | undefined) ?? 'ws://localhost:3000/ws'

type Incoming =
  | { type: 'stock_update'; distributorId: string; idleLockers: number }
  | {
      type: 'status_update'
      distributorId: string
      status: 'online' | 'offline' | 'maintenance' | 'decommissioned'
    }

/**
 * Maintient un WebSocket vers le backend pour recevoir en push les updates
 * de stock (idleLockers) et de statut (online/offline) des distributeurs.
 *
 * Reconnexion exponentielle plafonnée à 30 s. Idempotent : un seul socket
 * vivant par instance du hook ; à monter une seule fois (depuis l'écran carte).
 */
export function useDistributorsSocket(): void {
  const patchStock = useDistributorsStore((s) => s.patchStock)
  const patchStatus = useDistributorsStore((s) => s.patchStatus)

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelled) return
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        attempt = 0
      }

      ws.onmessage = (evt: WebSocketMessageEvent) => {
        try {
          const msg = JSON.parse(evt.data as string) as Incoming
          if (msg.type === 'stock_update') {
            patchStock(msg.distributorId, msg.idleLockers)
          } else if (msg.type === 'status_update') {
            patchStatus(msg.distributorId, msg.status)
          }
        } catch {
          // payload malformé — on ignore plutôt que cracher la connexion
        }
      }

      ws.onerror = () => {
        ws?.close()
      }

      ws.onclose = () => {
        if (cancelled) return
        const delay = Math.min(30_000, 1_000 * 2 ** attempt++)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [patchStock, patchStatus])
}
