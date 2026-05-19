'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '../../lib/cn'

/**
 * Réponse de l'API publique gouv.fr — geo.api.gouv.fr/communes.
 * Doc : https://geo.api.gouv.fr/decoupage-administratif/communes
 */
type GovCommune = {
  nom: string
  code: string
  codesPostaux: string[]
  departement: { code: string; nom: string }
  region: { code: string; nom: string }
  population?: number
}

export type CommuneAutofill = {
  inseeCode: string
  postalCode: string
  name: string
  department: string
  region: string
  population: string
}

/**
 * Champ d'autocomplétion qui interroge geo.api.gouv.fr (gratuit, sans clé)
 * pour pré-remplir tous les champs administratifs d'une commune française à
 * partir de son nom ou de son code postal.
 *
 * Heuristique : si le query matche /^\d{2,5}$/ → recherche par code postal,
 * sinon → recherche par nom (boosté par population pour faire remonter les
 * grandes villes en premier).
 */
export function CommuneAutocomplete({ onSelect }: { onSelect: (c: CommuneAutofill) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GovCommune[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const isPostalCode = /^\d{2,5}$/.test(q)
        const param = isPostalCode
          ? `codePostal=${q}`
          : `nom=${encodeURIComponent(q)}&boost=population`
        const url = `https://geo.api.gouv.fr/communes?${param}&fields=nom,code,codesPostaux,departement,region,population&limit=10`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`api_${res.status}`)
        const data = (await res.json()) as GovCommune[]
        setResults(data)
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Scroll automatique pour garder l'élément actif visible dans la liste
  // quand on navigue au clavier vers le haut/bas.
  useEffect(() => {
    if (!open || results.length === 0) return
    const li = listRef.current?.querySelectorAll('li')[activeIndex]
    li?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, results.length])

  function pick(c: GovCommune) {
    onSelect({
      inseeCode: c.code,
      postalCode: c.codesPostaux[0] ?? '',
      name: c.nom,
      department: c.departement.code,
      region: c.region.nom,
      population: c.population != null ? String(c.population) : '',
    })
    setQuery(c.nom)
    setPicked(c.nom)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = results[activeIndex]
      if (c) pick(c)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-4">
      <label className="block">
        <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-emerald-300/90">
          <span>🔎 Rechercher une commune (auto-remplit le formulaire)</span>
          {picked && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              ✓ Auto-rempli depuis INSEE
            </span>
          )}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (picked && e.target.value !== picked) setPicked(null)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Paris 11e, 75011, Lyon, Marseille…"
          className={cn(
            'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
            'placeholder:text-white/30 focus:border-emerald-400/60',
          )}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-activedescendant={open && results[activeIndex] ? `commune-opt-${results[activeIndex].code}` : undefined}
          role="combobox"
        />
      </label>
      {open && (results.length > 0 || loading) && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-4 right-4 z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-white/15 bg-navy-800 shadow-xl"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-white/40">Recherche…</li>
          )}
          {results.map((c, i) => (
            <li key={c.code} id={`commune-opt-${c.code}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  // onMouseDown plutôt que onClick : sinon onBlur du parent
                  // ferme la liste avant que le clic ne soit enregistré.
                  e.preventDefault()
                  pick(c)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white/90 transition',
                  i === activeIndex ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
                )}
              >
                <span>{c.nom}</span>
                <span className="font-mono text-[11px] text-white/40">
                  {c.code} · {c.codesPostaux[0] ?? '—'} · {c.departement.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center justify-between text-[11px] text-white/40">
        <span>
          Source : <span className="font-mono">geo.api.gouv.fr</span> · données officielles INSEE
        </span>
        <span className="hidden sm:inline">
          <kbd className="rounded border border-white/20 px-1">↑↓</kbd> naviguer ·{' '}
          <kbd className="rounded border border-white/20 px-1">↵</kbd> sélectionner ·{' '}
          <kbd className="rounded border border-white/20 px-1">Esc</kbd> fermer
        </span>
      </p>
    </div>
  )
}
