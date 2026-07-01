'use client'

import { useEffect, useRef, useState } from 'react'

import { LiveEvent } from '@sportlocker/types'

import { buildLiveWsUrl } from './live-url'
import { nextBackoffMs } from './backoff'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

/**
 * État de la connexion temps réel, tel qu'affiché à l'opérateur :
 *  - `connecting` : première ouverture en cours.
 *  - `live`       : flux ouvert, patches reçus en direct.
 *  - `reconnecting` : coupure, tentatives de reconnexion en backoff.
 *  - `offline`    : plusieurs tentatives échouées — on continue d'essayer en
 *    tâche de fond, mais l'UI bascule sur un fallback (rafraîchissement).
 */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

/** Au-delà de ce nombre d'échecs consécutifs, on passe l'UI en mode `offline`. */
const OFFLINE_AFTER_ATTEMPTS = 4

export interface UseLiveEventsOptions {
  /** Filtre serveur : ne recevoir que les events de ce distributeur (page détail). */
  distributorId?: string | null
  /** Callback invoqué pour chaque event valide. Doit être stable (useCallback). */
  onEvent: (event: LiveEvent) => void
  /** Coupe le hook (ex. flag de désactivation). Défaut : actif. */
  enabled?: boolean
  /** Appelé quand on (re)passe `live` après une coupure → resync recommandé. */
  onResync?: () => void
}

/**
 * Ouvre et maintient une connexion au flux temps réel `/v1/admin/live`.
 *
 * Cycle de vie : à chaque connexion on demande un ticket frais à la route Next
 * `/api/live-ticket` (le token de session est httpOnly, illisible ici), puis on
 * ouvre le WebSocket. Sur coupure, reconnexion en backoff. Le hook nettoie tout
 * à l'unmount et ignore les events des sockets périmés (garde anti-StrictMode /
 * anti-course lors des reconnexions rapides).
 */
export function useLiveEvents({
  distributorId = null,
  onEvent,
  enabled = true,
  onResync,
}: UseLiveEventsOptions): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting')

  // Refs pour les callbacks afin de ne pas relancer l'effet à chaque render.
  const onEventRef = useRef(onEvent)
  const onResyncRef = useRef(onResync)
  onEventRef.current = onEvent
  onResyncRef.current = onResync

  useEffect(() => {
    if (!enabled) return

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let hadLiveOnce = false
    let disposed = false

    async function connect(): Promise<void> {
      if (disposed) return
      setStatus(attempt === 0 ? 'connecting' : (attempt >= OFFLINE_AFTER_ATTEMPTS ? 'offline' : 'reconnecting'))

      let ticket: string
      try {
        const res = await fetch('/api/live-ticket', { method: 'POST' })
        if (!res.ok) throw new Error(`ticket_http_${res.status}`)
        const body = (await res.json()) as { ticket?: unknown }
        if (typeof body.ticket !== 'string') throw new Error('ticket_malformed')
        ticket = body.ticket
      } catch {
        scheduleReconnect()
        return
      }
      if (disposed) return

      const url = buildLiveWsUrl(API_URL, { ticket, distributorId })
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }
      socket = ws

      ws.onopen = () => {
        if (disposed || socket !== ws) return
        attempt = 0
        setStatus('live')
        if (hadLiveOnce) onResyncRef.current?.()
        hadLiveOnce = true
      }

      ws.onmessage = (ev: MessageEvent) => {
        if (disposed || socket !== ws) return
        let payload: unknown
        try {
          payload = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        } catch {
          return
        }
        const parsed = LiveEvent.safeParse(payload)
        if (parsed.success) onEventRef.current(parsed.data)
      }

      ws.onclose = () => {
        if (disposed || socket !== ws) return
        socket = null
        scheduleReconnect()
      }

      // onerror est suivi d'un onclose : on laisse onclose gérer la reconnexion
      // pour ne pas la déclencher deux fois.
      ws.onerror = () => { /* handled by onclose */ }
    }

    function scheduleReconnect(): void {
      if (disposed) return
      attempt += 1
      setStatus(attempt >= OFFLINE_AFTER_ATTEMPTS ? 'offline' : 'reconnecting')
      const delay = nextBackoffMs(attempt - 1)
      reconnectTimer = setTimeout(() => { void connect() }, delay)
    }

    void connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
        socket.close(1000, 'unmount')
      }
    }
  }, [distributorId, enabled])

  return status
}
