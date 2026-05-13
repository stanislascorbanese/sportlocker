import { redirect } from 'next/navigation'

/** /distributors redirige vers la liste canonique servie sur "/". */
export default function DistributorsIndexPage() {
  redirect('/')
}
