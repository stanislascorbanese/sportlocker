import { View, Text, Button, StyleSheet } from 'react-native'
import { useAuthStore } from '../../src/store/auth'

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.line}>Email : {user?.email ?? '—'}</Text>
      <Text style={styles.line}>Trust score : {user?.trustScore ?? '—'}</Text>
      <View style={styles.spacer} />
      <Button title="Se déconnecter" onPress={signOut} color="#C04040" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 20 },
  line: { fontSize: 16, marginBottom: 8 },
  spacer: { flex: 1 },
})
