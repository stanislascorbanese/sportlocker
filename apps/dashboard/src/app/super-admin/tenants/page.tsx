import { fetchCommunes, fetchUsers } from '../../../lib/api'
import { InviteForm } from './_components/InviteForm'

export const dynamic = 'force-dynamic'

export default async function SuperAdminTenantsPage() {
  const [communes, admins] = await Promise.all([
    fetchCommunes(),
    fetchUsers({ role: 'admin' }),
  ])

  const adminsByCommune = new Map<string, typeof admins>()
  for (const a of admins) {
    const key = a.commune?.id ?? '__none__'
    const list = adminsByCommune.get(key) ?? []
    list.push(a)
    adminsByCommune.set(key, list)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-emerald-300">Super-admin</p>
        <h1 className="mt-1 font-display text-2xl tracking-tight">Tenants &amp; admins</h1>
        <p className="mt-1 text-sm text-white/60">
          Vue globale des communes et de leurs administrateurs. Inviter un nouvel admin
          envoie un lien d'activation à coller dans un mail.
        </p>
      </div>

      <InviteForm communes={communes.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/5 px-5 py-3 text-[11px] uppercase tracking-wider text-white/40">
          {communes.length} commune{communes.length > 1 ? 's' : ''} · {admins.length} admin{admins.length > 1 ? 's' : ''}
        </div>
        <ul className="divide-y divide-white/5">
          {communes.length === 0 && (
            <li className="px-5 py-6 text-sm text-white/50">Aucune commune enregistrée.</li>
          )}
          {communes.map((commune) => {
            const list = adminsByCommune.get(commune.id) ?? []
            return (
              <li key={commune.id} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="font-medium">{commune.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-white/40">
                      {commune.inseeCode} · {commune.distributorCount} distributeur{commune.distributorCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-white/40">
                    {list.length} admin{list.length > 1 ? 's' : ''}
                  </span>
                </div>
                {list.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-3 text-xs text-white/70">
                    {list.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-emerald-400/60" />
                        <span>{a.email}</span>
                        {a.isBanned && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">banni</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
