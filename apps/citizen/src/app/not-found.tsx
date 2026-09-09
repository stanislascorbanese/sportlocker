import Link from 'next/link'
import { TopBar } from '@/components/Chrome'

export default function NotFound() {
  return (
    <main className="screen">
      <TopBar />
      <div className="flex flex-1 flex-col justify-center gap-6 text-center">
        <h1 className="font-display text-display-md font-bold">Page introuvable</h1>
        <p className="text-ink-muted">
          Scannez à nouveau le QR code collé sur la borne, ou saisissez son code.
        </p>
        <Link href="/" className="btn-primary">
          Saisir le code de la borne
        </Link>
      </div>
    </main>
  )
}
