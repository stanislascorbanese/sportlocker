import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  extendReservation, fetchMyReservations, MAX_EXTENSIONS, type Reservation,
} from '../../src/api/reservations'

const PALETTE = {
  navy: '#0D1B2A',
  navy2: '#1A2E42',
  green: '#1D9E75',
  greenDim: '#15785A',
  red: '#D9533C',
  amber: '#F4A93C',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.6)',
  divider: 'rgba(255,255,255,0.08)',
}

export default function LoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: fetchMyReservations,
  })
  const reservation = data?.items.find((r) => r.id === id) ?? null

  const extend = useMutation({
    mutationFn: () => extendReservation(id!),
    onSuccess: (updated) => {
      // remplace dans le cache pour MAJ immédiate, puis invalide pour rafraîchir
      qc.setQueryData<{ items: Reservation[] }>(['my-reservations'], (prev) =>
        prev
          ? { items: prev.items.map((r) => (r.id === updated.id ? updated : r)) }
          : { items: [updated] },
      )
      qc.invalidateQueries({ queryKey: ['my-reservations'] })
    },
    onError: (err: Error) => {
      Alert.alert('Prolongation impossible', err.message)
    },
  })

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={PALETTE.green} />
      </SafeAreaView>
    )
  }

  if (!reservation) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Emprunt introuvable</Text>
        <Pressable onPress={() => router.back()} style={styles.backCta}>
          <Text style={styles.backText}>Retour</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const extensionsLeft = MAX_EXTENSIONS - reservation.extensionCount
  const canExtend = reservation.status === 'active' && extensionsLeft > 0 && !!reservation.dueAt

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.closeRow}>
        <Text style={styles.close}>✕</Text>
      </Pressable>

      <Text style={styles.title}>Emprunt en cours</Text>

      <StatusBadge status={reservation.status} />

      <Field label="Date butoir" value={formatDueAt(reservation.dueAt)} />
      <Field label="Temps restant" value={<CountdownText dueAt={reservation.dueAt} status={reservation.status} />} bold />
      <Field
        label="Prolongations utilisées"
        value={`${reservation.extensionCount} / ${MAX_EXTENSIONS}`}
      />
      <Field label="Réservation" value={reservation.id.slice(0, 8) + '…'} subtle />
      <Field label="Casier" value={reservation.lockerId.slice(0, 8) + '…'} subtle />

      <View style={styles.spacer} />

      <Pressable
        onPress={() => extend.mutate()}
        disabled={!canExtend || extend.isPending}
        style={[styles.cta, !canExtend && styles.ctaDisabled]}
      >
        <Text style={styles.ctaText}>
          {extend.isPending
            ? 'Prolongation en cours…'
            : !canExtend
              ? extensionsLeft === 0
                ? 'Plus de prolongation disponible'
                : 'Indisponible'
              : `Prolonger (${extensionsLeft} restant${extensionsLeft > 1 ? 'es' : 'e'})`}
        </Text>
      </Pressable>
    </SafeAreaView>
  )
}

function StatusBadge({ status }: { status: Reservation['status'] }) {
  const color =
    status === 'active' ? PALETTE.green :
    status === 'overdue' ? PALETTE.red :
    status === 'returned' ? PALETTE.muted :
    PALETTE.amber
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  )
}

function Field({
  label, value, bold, subtle,
}: { label: string; value: React.ReactNode; bold?: boolean; subtle?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, bold && styles.fieldValueBold, subtle && styles.fieldValueSubtle]}>
        {value}
      </Text>
    </View>
  )
}

function CountdownText({ dueAt, status }: { dueAt: string | null; status: Reservation['status'] }) {
  const [, force] = useState(0)

  useEffect(() => {
    if (status !== 'active' || !dueAt) return
    const interval = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(interval)
  }, [dueAt, status])

  if (!dueAt) return <>—</>
  const remainingMs = new Date(dueAt).getTime() - Date.now()
  if (remainingMs <= 0) return <>Dépassé</>
  const hours = Math.floor(remainingMs / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  return <>{`${hours} h ${minutes.toString().padStart(2, '0')}`}</>
}

function formatDueAt(dueAt: string | null): string {
  if (!dueAt) return '—'
  return new Date(dueAt).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.navy, paddingHorizontal: 24, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.navy, gap: 16 },
  muted: { color: PALETTE.muted },

  closeRow: { alignSelf: 'flex-end', padding: 8 },
  close: { color: PALETTE.white, fontSize: 22 },

  title: { color: PALETTE.white, fontSize: 24, fontWeight: '700', marginTop: 4, marginBottom: 16 },

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1,
    marginBottom: 24,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 11, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1 },

  field: { paddingVertical: 12, borderBottomWidth: 1, borderColor: PALETTE.divider },
  fieldLabel: { color: PALETTE.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  fieldValue: { color: PALETTE.white, fontSize: 17 },
  fieldValueBold: { fontSize: 28, fontWeight: '700' },
  fieldValueSubtle: { color: PALETTE.muted, fontSize: 14 },

  spacer: { flex: 1 },

  cta: {
    backgroundColor: PALETTE.green,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  ctaDisabled: { backgroundColor: PALETTE.navy2 },
  ctaText: { color: PALETTE.white, textAlign: 'center', fontSize: 16, fontWeight: '600' },

  backCta: { backgroundColor: PALETTE.green, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  backText: { color: PALETTE.white, fontWeight: '600' },
})
