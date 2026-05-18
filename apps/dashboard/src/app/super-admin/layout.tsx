import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { getSessionUser } from '../../lib/session-server'

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login?redirect=/super-admin/tenants')
  if (user.role !== 'super_admin') {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6">
        <h1 className="font-display text-lg">Accès refusé</h1>
        <p className="mt-2 text-sm text-white/70">
          Cette section est réservée aux super-admins SportLocker.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
