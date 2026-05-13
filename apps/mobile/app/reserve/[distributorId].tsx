import { useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { type DistributorLocker } from '../../src/api/distributors'
import { useDistributorDetail } from '../../src/hooks/useDistributorDetail'
import { useCreateReservation } from '../../src/hooks/useCreateReservation'

const PALETTE = {
  navy: '#0D1B2A',
  navy2: '#1A2E42',
  navy3: '#243447',
  green: '#1D9E75',
  greenDim: '#15785A',
  red: '#D9533C',
  amber: '#F4A93C',
  grey: '#7A8893',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.6)',
  divider: 'rgba(255,255,255,0.08)',
}

function lockerColor(state: DistributorLocker['state'], hasItem: boolean): string {
  if (state === 'fault') return PALETTE.red
  if (state === 'idle' && hasItem) return PALETTE.green
  if (state === 'reserved') return PALETTE.amber
  return PALETTE.grey
}

function statusLabel(state: DistributorLocker['state'], hasItem: boolean): string {
  if (state === 'fault') return 'Hors service'
  if (state === 'idle' && !hasItem) return 'Vide'
  if (state === 'idle') return 'Disponible'
  if (state === 'reserved') return 'Réservé'
  if (state === 'active') return 'En cours'
  if (state === 'returning') return 'Retour'
  return state
}

export default function DistributorDetailScreen() {
  const { distributorId } = useLocalSearchParams<{ distributorId: string }>()
  const router = useRouter()
  const [selectedLockerId, setSelectedLockerId] = useState<string | null>(null)

  const { data, isLoading, error } = useDistributorDetail(distributorId)
  const reserve = useCreateReservation()

  const onReserve = () => {
    if (!data) return
    const locker = data.lockers.find((l) => l.id === selectedLockerId)
    if (!locker?.currentItemId) {
      Alert.alert('Réservation impossible', 'Casier sans item')
      return
    }
    reserve.mutate(
      { lockerId: locker.id, itemId: locker.currentItemId, communeId: data.communeId },
      {
        onSuccess: (res) => { router.push(`/qr/${res.id}`) },
        onError: (err) => { Alert.alert('Réservation impossible', err.message) },
      },
    )
  }

  const availableCount = useMemo(
    () => data?.lockers.filter((l) => l.state === 'idle' && l.currentItemId).length ?? 0,
    [data],
  )

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={PALETTE.green} />
      </SafeAreaView>
    )
  }
  if (error || !data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Distributeur introuvable</Text>
        <Pressable onPress={() => router.back()} style={styles.smallCta}>
          <Text style={styles.smallCtaText}>Retour</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const selectedLocker = data.lockers.find((l) => l.id === selectedLockerId)
  const canReserve =
    !!selectedLocker &&
    selectedLocker.state === 'idle' &&
    !!selectedLocker.currentItemId &&
    !reserve.isPending

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} style={styles.closeRow}>
        <Text style={styles.close}>✕</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{data.name}</Text>
        <View style={styles.metaRow}>
          <StatusPill status={data.status} />
          <Text style={styles.metaText}>{availableCount} dispo / {data.lockerCount} casiers</Text>
        </View>

        <Text style={styles.section}>Casiers</Text>
        <View style={styles.grid}>
          {data.lockers.map((l) => {
            const hasItem = !!l.currentItemId
            const isAvailable = l.state === 'idle' && hasItem
            const isSelected = selectedLockerId === l.id
            return (
              <Pressable
                key={l.id}
                onPress={() => isAvailable && setSelectedLockerId(l.id)}
                style={[
                  styles.tile,
                  { borderColor: lockerColor(l.state, hasItem) },
                  isSelected && styles.tileSelected,
                  !isAvailable && styles.tileDisabled,
                ]}
              >
                <Text style={styles.tilePosition}>#{l.position + 1}</Text>
                <Text style={styles.tileStatus}>{statusLabel(l.state, hasItem)}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.legend}>
          <LegendDot color={PALETTE.green} label="Disponible" />
          <LegendDot color={PALETTE.amber} label="Réservé" />
          <LegendDot color={PALETTE.grey} label="Vide / en cours" />
          <LegendDot color={PALETTE.red} label="Hors service" />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onReserve}
          disabled={!canReserve}
          style={[styles.cta, !canReserve && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>
            {reserve.isPending
              ? 'Réservation…'
              : selectedLocker
                ? `Réserver le casier #${selectedLocker.position + 1}`
                : 'Sélectionner un casier disponible'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function StatusPill({ status }: { status: 'online' | 'offline' | 'maintenance' | 'decommissioned' }) {
  const color =
    status === 'online' ? PALETTE.green :
    status === 'maintenance' ? PALETTE.amber :
    PALETTE.grey
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{status}</Text>
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.navy, gap: 16 },
  errorText: { color: PALETTE.muted, fontSize: 14 },

  closeRow: { alignSelf: 'flex-end', padding: 16 },
  close: { color: PALETTE.white, fontSize: 22 },

  scroll: { paddingHorizontal: 24, paddingBottom: 24 },

  title: { color: PALETTE.white, fontSize: 26, fontWeight: '700', marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  metaText: { color: PALETTE.muted, fontSize: 13 },

  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },

  section: { color: PALETTE.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  tile: {
    width: 88, height: 88,
    borderRadius: 14, borderWidth: 1.5,
    backgroundColor: PALETTE.navy2,
    alignItems: 'center', justifyContent: 'center',
  },
  tileSelected: {
    backgroundColor: PALETTE.navy3,
    borderWidth: 2.5,
  },
  tileDisabled: { opacity: 0.45 },
  tilePosition: { color: PALETTE.white, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  tileStatus: { color: PALETTE.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { color: PALETTE.muted, fontSize: 11 },

  footer: {
    padding: 24, paddingTop: 16,
    borderTopWidth: 1, borderColor: PALETTE.divider,
    backgroundColor: PALETTE.navy,
  },
  cta: {
    backgroundColor: PALETTE.green,
    paddingVertical: 16,
    borderRadius: 14,
  },
  ctaDisabled: { backgroundColor: PALETTE.navy2 },
  ctaText: { color: PALETTE.white, textAlign: 'center', fontSize: 16, fontWeight: '600' },

  smallCta: { backgroundColor: PALETTE.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  smallCtaText: { color: PALETTE.white, fontWeight: '600' },
})
