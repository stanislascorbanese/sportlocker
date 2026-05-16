'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'

import { cn } from '../../lib/cn'
import { createCommuneAction, updateCommuneAction, type FormState } from './_actions'

const INITIAL: FormState = { status: 'idle' }

export type CommuneInitial = {
  inseeCode?: string
  name?: string
  postalCode?: string
  department?: string
  region?: string
  population?: number | null
  contractStart?: string | null
  contractEnd?: string | null
  monthlyFeeCents?: number
  contactEmail?: string | null
  contactPhone?: string | null
}

export function CommuneForm({
  mode,
  initial,
  id,
}: {
  mode: 'create' | 'edit'
  initial?: CommuneInitial
  id?: string
}) {
  const action = mode === 'create'
    ? createCommuneAction
    : (prev: FormState, fd: FormData) => updateCommuneAction(id ?? '', prev, fd)

  const [state, formAction] = useFormState(action, INITIAL)

  const v = initial ?? {}
  const monthlyFeeEuros = v.monthlyFeeCents != null ? (v.monthlyFeeCents / 100).toString() : ''

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="inseeCode"
          label="Code INSEE"
          placeholder="75111"
          defaultValue={v.inseeCode ?? ''}
          error={state.fieldErrors?.['inseeCode']}
          required
          readOnly={mode === 'edit'}
          hint={mode === 'edit' ? 'Non modifiable après création' : '5 chiffres'}
          mono
        />
        <Field
          name="postalCode"
          label="Code postal"
          placeholder="75011"
          defaultValue={v.postalCode ?? ''}
          error={state.fieldErrors?.['postalCode']}
          required
        />
      </div>

      <Field
        name="name"
        label="Nom"
        placeholder="Paris 11e"
        defaultValue={v.name ?? ''}
        error={state.fieldErrors?.['name']}
        required
      />

      <div className="grid grid-cols-3 gap-4">
        <Field
          name="department"
          label="Département"
          placeholder="75"
          defaultValue={v.department ?? ''}
          error={state.fieldErrors?.['department']}
          required
        />
        <div className="col-span-2">
          <Field
            name="region"
            label="Région"
            placeholder="Île-de-France"
            defaultValue={v.region ?? ''}
            error={state.fieldErrors?.['region']}
            required
          />
        </div>
      </div>

      <Field
        name="population"
        label="Population (optionnel)"
        type="number"
        placeholder="147017"
        defaultValue={v.population ?? ''}
        error={state.fieldErrors?.['population']}
      />

      <fieldset className="rounded-lg border border-white/10 bg-navy-900/50 p-4">
        <legend className="px-2 text-[11px] uppercase tracking-wider text-white/50">Contrat</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field
            name="contractStart"
            label="Début"
            type="date"
            defaultValue={v.contractStart ?? ''}
            error={state.fieldErrors?.['contractStart']}
          />
          <Field
            name="contractEnd"
            label="Fin"
            type="date"
            defaultValue={v.contractEnd ?? ''}
            error={state.fieldErrors?.['contractEnd']}
          />
        </div>
        <div className="mt-4">
          <Field
            name="monthlyFeeEuros"
            label="Fee mensuel (€)"
            type="number"
            step="1"
            placeholder="1500"
            defaultValue={monthlyFeeEuros}
            error={state.fieldErrors?.['monthlyFeeEuros']}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-white/10 bg-navy-900/50 p-4">
        <legend className="px-2 text-[11px] uppercase tracking-wider text-white/50">Contact</legend>
        <Field
          name="contactEmail"
          label="Email"
          type="email"
          placeholder="contrats@mairie.fr"
          defaultValue={v.contactEmail ?? ''}
          error={state.fieldErrors?.['contactEmail']}
        />
        <div className="mt-4">
          <Field
            name="contactPhone"
            label="Téléphone"
            placeholder="+33 1 53 27 11 00"
            defaultValue={v.contactPhone ?? ''}
            error={state.fieldErrors?.['contactPhone']}
          />
        </div>
      </fieldset>

      {state.status === 'error' && state.message && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/communes"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Annuler
        </Link>
        <SubmitButton mode={mode} />
      </div>
    </form>
  )
}

function SubmitButton({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus()
  const label = mode === 'create' ? 'Créer la commune' : 'Enregistrer'
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-navy-900 transition',
        'hover:bg-emerald-400 disabled:opacity-50',
      )}
    >
      {pending ? `${label}…` : label}
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
          'read-only:cursor-not-allowed read-only:bg-navy-900 read-only:text-white/50',
          mono && 'font-mono text-xs',
          error && 'border-rose-500/50',
        )}
      />
      {hint && !error && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  )
}
