'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '../../lib/cn'

/**
 * Réponse de l'API BAN (Base Adresse Nationale) — api-adresse.data.gouv.fr.
 * Doc : https://adresse.data.gouv.fr/api-doc/adresse
 *
 * On extrait :
 *   - geometry.coordinates [lng, lat]
 *   - properties.label : adresse complète formatée
 *   - properties.citycode : code INSEE de la commune (pour matcher en BDD)
 */
type BanFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    label: string
    citycode: string
    city: string
    postcode: string
    score: number
    type: 'housenumber' | 'street' | 'locality' | 'municipality'
  }
}

export type AddressAutofill = {
  latitude: string
  longitude: string
  label: string
  cityCode: string
}

/**
 * Recherche d'adresse avec auto-complétion via l'API BAN gouv (gratuit, sans
 * clé, illimité). Renvoie lat/lng + label + code INSEE ville sur sélection.
 *
 * Le code INSEE permet au formulaire parent de pré-sélectionner la commune
 * correspondante dans le dropdown si elle existe déjà en BDD.
 */
export function AddressAutocomplete({ onSelect }: { onSelect: (a: AddressAutofill) => void }) {
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
        const data = (await res.json()) as { features: BanFeature[] }
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
    const [lng, lat] = f.geometry.coordinates
    onSelect({
      latitude: String(lat),
      longitude: String(lng),
      label: f.properties.label,
      cityCode: f.properties.citycode,
    })
    setQuery(f.properties.label)
    setPicked(f.properties.label)
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
          <span>📍 Rechercher l'adresse du distributeur</span>
          {picked && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              ✓ Géolocalisé via BAN
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
          placeholder="10 rue de la Mairie, 75011 Paris…"
          className={cn(
            'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
            'placeholder:text-white/30 focus:border-emerald-400/60',
          )}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-activedescendant={open && results[activeIndex] ? `addr-opt-${activeIndex}` : undefined}
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
            <li key={`${f.properties.citycode}-${i}`} id={`addr-opt-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(f)
                }}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm text-white/90 transition',
                  i === activeIndex ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
                )}
              >
                <span className="truncate">{f.properties.label}</span>
                <span className="font-mono text-[11px] text-white/40">
                  INSEE {f.properties.citycode} · {f.properties.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center justify-between text-[11px] text-white/40">
        <span>
          Source : <span className="font-mono">api-adresse.data.gouv.fr</span> · BAN officielle
        </span>
        <span className="hidden sm:inline">
          <kbd className="rounded border border-white/20 px-1">↑↓</kbd>{' '}
          <kbd className="rounded border border-white/20 px-1">↵</kbd>{' '}
          <kbd className="rounded border border-white/20 px-1">Esc</kbd>
        </span>
      </p>
    </div>
  )
}
