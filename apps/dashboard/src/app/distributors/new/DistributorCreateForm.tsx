'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'

import type { Commune } from '../../../lib/api'
import { createDistributorAction, type FormState } from '../_actions'
import { cn } from '../../../lib/cn'
import { AddressAutocomplete, type AddressAutofill } from '../AddressAutocomplete'

const INITIAL: FormState = { status: 'idle' }

export function DistributorCreateForm({ communes }: { communes: Commune[] }) {
  const [state, formAction] = useFormState(createDistributorAction, INITIAL)
  const [communeId, setCommuneId] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [autofillNotice, setAutofillNotice] = useState<string | null>(null)

  function onAddressSelect(a: AddressAutofill) {
    setLatitude(a.latitude.toFixed(6))
    setLongitude(a.longitude.toFixed(6))
    const match = communes.find((c) => c.inseeCode === a.citycode)
    if (match) {
      setCommuneId(match.id)
      setAutofillNotice(`Commune ${match.name} sélectionnée automatiquement (INSEE ${a.citycode}).`)
    } else if (a.citycode) {
      setAutofillNotice(
        `Commune INSEE ${a.citycode} (${a.city}) absente de la liste — créez-la d'abord ou sélectionnez-la manuellement.`,
      )
    } else {
      setAutofillNotice(null)
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <AddressAutocomplete onSelect={onAddressSelect} />
      {autofillNotice && (
        <p className="text-[11px] text-emerald-200/80">{autofillNotice}</p>
      )}

      <Field
        name="serialNumber"
        label="Numéro de série"
        placeholder="SL-MAIRIE-001"
        error={state.fieldErrors?.['serialNumber']}
        required
      />

      <Field
        name="name"
        label="Nom affiché"
        placeholder="Distributeur Parc Mairie"
        error={state.fieldErrors?.['name']}
        required
      />

      {communes.length > 0 ? (
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-white/55">
            Commune
          </span>
          <select
            name="communeId"
            required
            value={communeId}
            onChange={(e) => setCommuneId(e.target.value)}
            className={cn(
              'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
              'focus:border-emerald-400/60',
              state.fieldErrors?.['communeId'] && 'border-rose-500/50',
            )}
          >
            <option value="" disabled>Sélectionnez une commune…</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.inseeCode})
              </option>
            ))}
          </select>
          {state.fieldErrors?.['communeId'] && (
            <span className="mt-1 block text-[11px] text-rose-300">{state.fieldErrors['communeId']}</span>
          )}
          <span className="mt-1 block text-[11px] text-white/40">
            <Link href="/communes/new" className="text-emerald-300/80 hover:text-emerald-200">
              + créer une nouvelle commune
            </Link>
          </span>
        </label>
      ) : (
        <Field
          name="communeId"
          label="Commune (UUID)"
          placeholder="76e317a8-616c-486c-87cb-73253f411d8a"
          hint="Aucune commune chargée — saisir l'UUID directement."
          error={state.fieldErrors?.['communeId']}
          required
          mono
        />
      )}

      <Field
        name="lockerCount"
        label="Nombre de casiers"
        type="number"
        defaultValue="4"
        min={1}
        max={64}
        error={state.fieldErrors?.['lockerCount']}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          name="latitude"
          label="Latitude"
          type="number"
          step="0.000001"
          placeholder="48.8581"
          value={latitude}
          onChange={(e) => setLatitude(e.currentTarget.value)}
          error={state.fieldErrors?.['latitude']}
        />
        <Field
          name="longitude"
          label="Longitude"
          type="number"
          step="0.000001"
          placeholder="2.347"
          value={longitude}
          onChange={(e) => setLongitude(e.currentTarget.value)}
          error={state.fieldErrors?.['longitude']}
        />
      </div>
      <p className="-mt-3 text-[11px] text-white/40">
        Remplis automatiquement par l&apos;adresse — éditable pour ajuster finement.
      </p>

      {state.status === 'error' && state.message && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/distributors"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Annuler
        </Link>
        <SubmitButton />
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-navy-900 transition',
        'hover:bg-emerald-400 disabled:opacity-50',
      )}
    >
      {pending ? 'Création…' : 'Créer le distributeur'}
    </button>
  )
}

type FieldProps = {
  name: string
  label: string
  hint?: string | undefined
  error?: string | undefined
  mono?: boolean | undefined
} & React.InputHTMLAttributes<HTMLInputElement>

function Field({ name, label, hint, error, mono, ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-white/55">
        {label}
      </span>
      <input
        name={name}
        {...rest}
        className={cn(
          'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
          'placeholder:text-white/30 focus:border-emerald-400/60',
          mono && 'font-mono text-xs',
          error && 'border-rose-500/50',
        )}
      />
      {hint && !error && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  )
}
