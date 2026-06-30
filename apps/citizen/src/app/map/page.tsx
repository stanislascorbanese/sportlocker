import { redirect } from 'next/navigation'

/**
 * La carte est désormais l'écran d'accueil. /map reste accessible pour
 * la rétro-compat (notifications, raccourcis PWA) mais redirige vers /.
 */
export default function MapPage() {
  redirect('/')
}
