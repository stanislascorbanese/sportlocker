'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, MapPin, Package } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'

import { fetchActiveReservation, type ReservationActive } from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'

/**
 * Affiche la réservation active de l'utilisateur avec son QR code à
 * scanner sur la borne pour déverrouiller le casier.
 *
 * Le QR contient un JWT HS256 signé par l'API (cf. règles métier
 * CLAUDE.md : valable 15 min, nonce anti-replay). On le rend en SVG pour
 * une netteté maximale même en zoom (impression écran).
 *
 * Refresh auto chaque minute pour mettre à jour le timer et capter un
 * changement de statut (reserved → active dès que l'utilisateur scanne).
 */
export default function ReservationPage() {
  const params = useParams<{ id: string }>()
  const user = useRequireAuth()

  const query = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  })

  if (!user) return null

  const reservation = query.data
  // Soit on a une réservation active qui matche l'id, soit on attend.
  const isCurrent = reservation?.id === params.id

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">Réservation active</p>
          <h1 className="font-display text-xl font-semibold">Scanner pour déverrouiller</h1>
        </div>
      </header>

      {query.isLoading && <p className="text-sm text-white/50">Chargement…</p>}
      {!query.isLoading && !isCurrent && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Aucune réservation active ne correspond à cet ID. Elle a peut-être expiré ou été annulée.
        </p>
      )}
      {isCurrent && reservation && <ReservationContent r={reservation} />}
    </main>
  )
}

function ReservationContent({ r }: { r: ReservationActive }) {
  const [remaining, setRemaining] = useState(() => msUntil(r.expiresAt))

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntil(r.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [r.expiresAt])

  const expired = remaining <= 0

  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6">
        <QRCodeSVG
          value={r.qrToken}
          size={256}
          level="H"
          marginSize={0}
          className={cn(expired && 'opacity-30')}
        />
        <p className="text-[11px] font-mono text-navy-900/50 text-center max-w-[256px] truncate">
          {r.qrToken.slice(0, 32)}…
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <Row icon={<MapPin className="h-4 w-4" />} label="Distributeur" value={r.distributor.name} />
        <Row icon={<Package className="h-4 w-4" />} label="Article" value={r.item.typeName} />
        <Row
          icon={<Clock className="h-4 w-4" />}
          label="Temps restant"
          value={expired ? 'Expiré' : formatRemaining(remaining)}
          highlight={!expired}
        />
      </section>

      <p className="text-center text-[11px] text-white/40">
        Présente ce QR au scanner du distributeur. Le casier s'ouvre automatiquement.
      </p>
    </>
  )
}

function Row({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-white/40">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
        <p className={cn('text-sm', highlight && 'font-mono font-semibold text-emerald-300')}>{value}</p>
      </div>
    </div>
  )
}

function msUntil(isoDate: string): number {
  return Math.max(0, new Date(isoDate).getTime() - Date.now())
}

function formatRemaining(ms: number): string {
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return `${min}:${String(sec).padStart(2, '0')}`
}
