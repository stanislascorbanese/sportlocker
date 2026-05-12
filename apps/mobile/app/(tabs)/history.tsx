import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'

import { fetchMyReservations, type Reservation } from '../../src/api/reservations'

const PALETTE = {
  navy: '#0D1B2A',
  green: '#1D9E75',
  red: '#D9533C',
  amber: '#F4A93C',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.55)',
  divider: 'rgba(255,255,255,0.08)',
}

function statusColor(status: Reservation['status']): string {
  if (status === 'active') return PALETTE.green
  if (status === 'overdue') return PALETTE.red
  if (status === 'pending') return PALETTE.amber
  return PALETTE.muted
}

export default function HistoryScreen() {
  const router = useRouter()
  const { data } = useQuery({ queryKey: ['my-reservations'], queryFn: fetchMyReservations })

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mes emprunts</Text>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const isActive = item.status === 'active'
          const Row = (
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: statusColor(item.status) }]} />
              <View style={styles.text}>
                <Text style={styles.status}>{item.status}</Text>
                <Text style={styles.id}>{item.id.slice(0, 8)}…</Text>
              </View>
              {isActive && <Text style={styles.chev}>›</Text>}
            </View>
          )
          return isActive ? (
            <Pressable onPress={() => router.push(`/loan/${item.id}`)} android_ripple={{ color: '#ffffff10' }}>
              {Row}
            </Pressable>
          ) : (
            Row
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun emprunt pour l'instant</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: PALETTE.navy },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12, color: PALETTE.white },
  row: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  text: { flex: 1 },
  status: { fontWeight: '500', color: PALETTE.white, textTransform: 'capitalize' },
  id: { color: PALETTE.muted, fontSize: 12, marginTop: 2 },
  chev: { color: PALETTE.muted, fontSize: 22, paddingLeft: 8 },
  sep: { height: 1, backgroundColor: PALETTE.divider },
  empty: { textAlign: 'center', marginTop: 40, color: PALETTE.muted },
})
