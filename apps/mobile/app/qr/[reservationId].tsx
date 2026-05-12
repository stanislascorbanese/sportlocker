/**
 * Écran QR — affiche le code à scanner par le firmware pour déverrouiller.
 *
 * Contenu encodé : le `nonce` de la réservation (ou plus tard un JWT signé par
 * l'API via GET /reservations/:id/token quand cet endpoint sera implémenté).
 * Le firmware lit la valeur, vérifie sa signature offline (clé partagée),
 * commande le verrou GPIO et publie un event MQTT.
 *
 * Sécurité écran : luminosité forcée au maximum (à brancher avec expo-brightness
 * dans une itération suivante), affichage du compte à rebours `expiresAt`.
 */
import { useEffect, useState } from 'react'
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'react-native-qrcode-svg'

import { fetchMyReservations, type Reservation } from '../../src/api/reservations'

const PALETTE = {
  navy: '#0D1B2A',
  navy2: '#1A2E42',
  green: '#1D9E75',
  red: '#D9533C',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.65)',
}

export default function QrScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>()
  const router = useRouter()
  const { width } = useWindowDimensions()

  // Polling court pour rafraîchir l'état (si l'emprunt devient `active` côté
  // firmware, on bascule automatiquement vers l'écran loan).
  const { data, isLoading } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: fetchMyReservations,
    refetchInterval: 5_000,
  })

  const reservation = data?.items.find((r) => r.id === reservationId) ?? null

  // Auto-redirect si le firmware a déverrouillé (status → active).
  useEffect(() => {
    if (reservation?.status === 'active') {
      router.replace(`/loan/${reservationId}`)
    }
  }, [reservation?.status, reservationId, router])

  const qrPayload = qrPayloadFor(reservation)
  const qrSize = Math.min(width * 0.7, 280)

  if (isLoading || !reservation) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={PALETTE.green} />
      </SafeAreaView>
    )
  }

  if (reservation.status !== 'pending') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Réservation {reservation.status}</Text>
        <Text style={styles.muted}>
          {reservation.status === 'cancelled'
            ? 'Cette réservation a été annulée.'
            : reservation.status === 'expired'
              ? 'Le code a expiré sans ouverture du casier.'
              : 'Cette réservation n\'est plus en attente de déverrouillage.'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.smallCta}>
          <Text style={styles.smallCtaText}>Retour</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.closeRow}>
        <Text style={styles.close}>✕</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>Approchez-vous du distributeur</Text>
        <Text style={styles.subtitle}>Présentez ce code devant la caméra</Text>

        <View style={[styles.qrFrame, { width: qrSize + 32, height: qrSize + 32 }]}>
          <QRCode
            value={qrPayload}
            size={qrSize}
            backgroundColor={PALETTE.white}
            color={PALETTE.navy}
          />
        </View>

        <Countdown expiresAt={reservation.expiresAt} />

        <View style={styles.meta}>
          <MetaLine label="Casier" value={reservation.lockerId.slice(0, 8) + '…'} />
          <MetaLine label="Réservation" value={reservation.id.slice(0, 8) + '…'} />
        </View>
      </View>
    </SafeAreaView>
  )
}

function qrPayloadFor(reservation: Reservation | null): string {
  if (!reservation) return ''
  // Pour l'instant : nonce brut. À remplacer par le JWT signé renvoyé par
  // GET /reservations/:id/token (mode offline) dans la prochaine itération.
  return reservation.qrToken ?? reservation.nonce ?? reservation.id
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const remainingMs = new Date(expiresAt).getTime() - now
  if (remainingMs <= 0) {
    return <Text style={[styles.countdown, { color: PALETTE.red }]}>Code expiré</Text>
  }
  const minutes = Math.floor(remainingMs / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1000).toString().padStart(2, '0')
  const color = remainingMs < 60_000 ? PALETTE.red : PALETTE.white
  return (
    <View style={styles.countdownWrap}>
      <Text style={styles.countdownLabel}>Expire dans</Text>
      <Text style={[styles.countdown, { color }]}>{minutes}:{seconds}</Text>
    </View>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.navy, gap: 16, padding: 24 },

  closeRow: { alignSelf: 'flex-end', padding: 16 },
  close: { color: PALETTE.white, fontSize: 24 },

  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 24 },

  title: { color: PALETTE.white, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: PALETTE.muted, fontSize: 14, textAlign: 'center', marginTop: -16 },
  muted: { color: PALETTE.muted, fontSize: 14, textAlign: 'center' },

  qrFrame: {
    backgroundColor: PALETTE.white,
    borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  countdownWrap: { alignItems: 'center' },
  countdownLabel: { color: PALETTE.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  countdown: { fontSize: 36, fontWeight: '300', fontVariant: ['tabular-nums'] },

  meta: { width: '100%', gap: 8 },
  metaLine: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { color: PALETTE.muted, fontSize: 12 },
  metaValue: { color: PALETTE.white, fontSize: 12, fontFamily: 'DM Mono' },

  smallCta: { backgroundColor: PALETTE.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  smallCtaText: { color: PALETTE.white, fontWeight: '600' },
})
