import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="reserve/[distributorId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="loan/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="qr/[reservationId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
