import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'

export default function ScanScreen() {
  const [perm, requestPerm] = useCameraPermissions()
  const [scanned, setScanned] = useState<string | null>(null)

  if (!perm) return <Text>Chargement permissions…</Text>
  if (!perm.granted) {
    requestPerm()
    return <Text>Caméra requise pour scanner</Text>
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => scanned !== data && setScanned(data)}
      />
      {scanned && (
        <View style={styles.banner}>
          <Text style={styles.text}>QR détecté</Text>
          {/* TODO: poster au firmware via Bluetooth Low Energy ou validation API */}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  banner: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12 },
  text: { fontWeight: '600' },
})
