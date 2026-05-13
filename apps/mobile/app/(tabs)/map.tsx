import { useEffect, useMemo } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useDistributorsNearby } from '../../src/hooks/useDistributorsNearby'
import { useDistributorsStore, type DistributorWithGeo } from '../../src/store/distributors'
import { useDistributorsSocket } from '../../src/hooks/useDistributorsSocket'
import { useLocationStore } from '../../src/store/location'
import { haversineKm } from '../../src/lib/distance'

const PALETTE = {
  navy: '#0D1B2A',
  navy2: '#1A2E42',
  green: '#1D9E75',
  orange: '#F4A93C',
  red: '#D9533C',
  grey: '#7A8893',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.6)',
  divider: 'rgba(255,255,255,0.08)',
}

const RADIUS_KM = 5

type Status = DistributorWithGeo['status']
type Row = DistributorWithGeo & { distanceKm: number }

function markerColor(status: Status, idleLockers: number): string {
  if (status === 'offline' || status === 'decommissioned') return PALETTE.grey
  if (idleLockers === 0) return PALETTE.red
  if (idleLockers === 1) return PALETTE.orange
  return PALETTE.green
}

export default function MapScreen() {
  const router = useRouter()

  const coords = useLocationStore((s) => s.coords)
  const fallbackReason = useLocationStore((s) => s.fallbackReason)
  const locationStatus = useLocationStore((s) => s.status)
  const requestPermission = useLocationStore((s) => s.requestPermission)

  const setAll = useDistributorsStore((s) => s.setAll)
  const byId = useDistributorsStore((s) => s.byId)

  useDistributorsSocket()

  // Demande la permission au montage si pas encore tentée.
  useEffect(() => {
    if (locationStatus === 'idle') {
      void requestPermission()
    }
  }, [locationStatus, requestPermission])

  // Géofiltrage côté serveur via /v1/distributors/nearby.
  const { data } = useDistributorsNearby(
    coords?.latitude ?? null,
    coords?.longitude ?? null,
    RADIUS_KM,
  )

  // Snapshot REST → store (la WS prend ensuite le relais en patches incrémentaux).
  // Le store filtre les distributeurs sans coords, mais /nearby les exclut déjà
  // côté SQL ; ce filtre devient un no-op pour les rangées renvoyées.
  useEffect(() => {
    if (!data?.items) return
    setAll(data.items)
  }, [data, setAll])

  const rows: Row[] = useMemo(() => {
    if (!coords) return []
    return Object.values(byId)
      .map((d) => ({
        ...d,
        distanceKm: haversineKm(coords.latitude, coords.longitude, d.latitude, d.longitude),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [byId, coords])

  if (!coords) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadingText}>Localisation…</Text>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {rows.map((d) => (
          <Marker
            key={d.id}
            coordinate={{ latitude: d.latitude, longitude: d.longitude }}
            pinColor={markerColor(d.status, d.idleLockers)}
            title={d.name}
            description={`${d.idleLockers}/${d.lockerCount} dispo · ${d.distanceKm.toFixed(1)} km`}
            onCalloutPress={() => router.push(`/reserve/${d.id}`)}
          />
        ))}
      </MapView>

      {fallbackReason && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{fallbackReason}</Text>
        </View>
      )}

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Distributeurs à proximité</Text>
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <DistributorRow row={item} onPress={() => router.push(`/reserve/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun distributeur disponible</Text>
          }
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  )
}

function DistributorRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const color = markerColor(row.status, row.idleLockers)
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.rowMeta}>
          {row.distanceKm.toFixed(1)} km · {row.idleLockers}/{row.lockerCount} dispo
          {row.status !== 'online' ? ` · ${row.status}` : ''}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.navy },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.navy },
  loadingText: { color: PALETTE.white, fontSize: 14 },

  map: { flex: 1.4 },

  banner: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: PALETTE.navy2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bannerText: { color: PALETTE.white, fontSize: 12 },

  sheet: {
    flex: 1,
    backgroundColor: PALETTE.navy,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: PALETTE.divider,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 12,
  },
  sheetTitle: { color: PALETTE.white, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  listContent: { paddingBottom: 24 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowPressed: { opacity: 0.6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  rowText: { flex: 1 },
  rowName: { color: PALETTE.white, fontSize: 15, fontWeight: '500' },
  rowMeta: { color: PALETTE.muted, fontSize: 12, marginTop: 2 },
  chev: { color: PALETTE.muted, fontSize: 22, paddingLeft: 8 },
  sep: { height: 1, backgroundColor: PALETTE.divider },
  empty: { color: PALETTE.muted, textAlign: 'center', marginTop: 28, fontSize: 13 },
})
