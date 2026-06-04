import { fetchCommunes, fetchUsers } from '../../../lib/api'
import { getLang } from '../../../lib/lang-server'
import { superAdminStrings } from '../../../lib/i18n/super-admin'
import { InviteForm } from './_components/InviteForm'

export const dynamic = 'force-dynamic'

export default async function SuperAdminTenantsPage() {
  const lang = await getLang()
  const t = superAdminStrings(lang)

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
        <p className="text-[11px] uppercase tracking-wider text-emerald-300">{t.eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl tracking-tight">{t.pageTitle}</h1>
        <p className="mt-1 text-sm text-white/60">{t.subtitle}</p>
      </div>

      <InviteForm communes={communes.map((c) => ({ id: c.id, name: c.name }))} lang={lang} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/5 px-5 py-3 text-[11px] uppercase tracking-wider text-white/40">
          {communes.length} {communes.length > 1 ? t.communeMany : t.commune1} · {admins.length} {admins.length > 1 ? t.adminMany : t.admin1}
        </div>
        <ul className="divide-y divide-white/5">
          {communes.length === 0 && (
            <li className="px-5 py-6 text-sm text-white/50">{t.noCommunes}</li>
          )}
          {communes.map((commune) => {
            const list = adminsByCommune.get(commune.id) ?? []
            return (
              <li key={commune.id} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="font-medium">{commune.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-white/40">
                      {commune.inseeCode} · {commune.distributorCount} {commune.distributorCount > 1 ? t.distributorMany : t.distributor1}
                    </p>
                  </div>
                  <span className="text-[11px] text-white/40">
                    {list.length} {list.length > 1 ? t.adminMany : t.admin1}
                  </span>
                </div>
                {list.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-3 text-xs text-white/70">
                    {list.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-emerald-400/60" />
                        <span>{a.email}</span>
                        {a.isBanned && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">{t.bannedBadge}</span>}
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
