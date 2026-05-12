import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarStyle: { backgroundColor: '#0D1B2A', borderTopColor: 'rgba(255,255,255,0.08)' },
        headerStyle: { backgroundColor: '#0D1B2A' },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen name="map"     options={{ title: 'Carte' }} />
      <Tabs.Screen name="history" options={{ title: 'Historique' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
      <Tabs.Screen name="index"   options={{ href: null }} />
    </Tabs>
  )
}
