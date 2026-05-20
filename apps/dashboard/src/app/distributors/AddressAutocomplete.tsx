'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '../../lib/cn'

/**
 * Feature GeoJSON renvoyée par api-adresse.data.gouv.fr (BAN).
 * Doc : https://adresse.data.gouv.fr/api-doc/adresse
 */
type BanFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] } // [lon, lat]
  properties: {
    label: string
    score: number
    type: 'housenumber' | 'street' | 'locality' | 'municipality'
    name?: string
    postcode?: string
    citycode?: string // code INSEE
    city?: string
    context?: string
  }
}

export type AddressAutofill = {
  label: string
  latitude: number
  longitude: number
  postcode: string
  citycode: string
  city: string
}

/**
 * Champ d'autocomplétion qui interroge api-adresse.data.gouv.fr (BAN,
 * gratuit, sans clé) pour pré-remplir latitude/longitude + code INSEE à
 * partir d'une adresse postale libre.
 *
 * Sur sélection, `onSelect` reçoit lat/lng au format décimal et le citycode
 * INSEE pour permettre l'auto-sélection de la commune côté formulaire parent.
 */
export function AddressAutocomplete({
  onSelect,
  hint,
}: {
  onSelect: (a: AddressAutofill) => void
  hint?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BanFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=8&autocomplete=1`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`api_${res.status}`)
        const data = (await res.json()) as { features?: BanFeature[] }
        setResults(data.features ?? [])
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

  useEffect(() => {
    if (!open || results.length === 0) return
    const li = listRef.current?.querySelectorAll('li')[activeIndex]
    li?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, results.length])

  function pick(f: BanFeature) {
    const [lon, lat] = f.geometry.coordinates
    const p = f.properties
    onSelect({
      label: p.label,
      latitude: lat,
      longitude: lon,
      postcode: p.postcode ?? '',
      citycode: p.citycode ?? '',
      city: p.city ?? '',
    })
    setQuery(p.label)
    setPicked(p.label)
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
      const f = results[activeIndex]
      if (f) pick(f)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-4">
      <label className="block">
        <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-emerald-300/90">
          <span>📍 Rechercher l&apos;adresse (auto-remplit lat/lng + commune)</span>
          {picked && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              ✓ Auto-rempli depuis BAN
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
          placeholder="12 rue de la Mairie, 44115 Basse-Goulaine…"
          className={cn(
            'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
            'placeholder:text-white/30 focus:border-emerald-400/60',
          )}
          aria-autocomplete="list"
          aria-expanded={open}
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
          {results.map((f, i) => (
            <li key={`${f.properties.label}-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(f)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white/90 transition',
                  i === activeIndex ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
                )}
              >
                <span className="truncate">{f.properties.label}</span>
                <span className="font-mono text-[11px] text-white/40 shrink-0">
                  {f.properties.postcode ?? '—'} · {f.properties.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center justify-between text-[11px] text-white/40">
        <span>
          {hint ?? (
            <>
              Source : <span className="font-mono">api-adresse.data.gouv.fr</span> · Base Adresse Nationale
            </>
          )}
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
