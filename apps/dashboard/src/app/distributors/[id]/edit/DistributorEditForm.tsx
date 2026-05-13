'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'

import { updateDistributorAction, type FormState } from '../../_actions'
import { cn } from '../../../../lib/cn'
import type { DistributorDetail } from '../../../../lib/api'

const INITIAL: FormState = { status: 'idle' }

const STATUS_OPTIONS = ['online', 'offline', 'maintenance', 'decommissioned'] as const

export function DistributorEditForm({ distributor }: { distributor: DistributorDetail }) {
  const action = updateDistributorAction.bind(null, distributor.id)
  const [state, formAction] = useFormState(action, INITIAL)

  return (
    <form action={formAction} className="space-y-5">
      <Field
        name="name"
        label="Nom affiché"
        defaultValue={distributor.name}
        error={state.fieldErrors?.['name']}
        required
      />

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-white/55">
          Statut
        </span>
        <select
          name="status"
          defaultValue={distributor.status}
          className={cn(
            'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none',
            'focus:border-emerald-400/60',
            state.fieldErrors?.['status'] && 'border-rose-500/50',
          )}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-navy-800">{s}</option>
          ))}
        </select>
        {state.fieldErrors?.['status'] && (
          <span className="mt-1 block text-[11px] text-rose-300">
            {state.fieldErrors['status']}
          </span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field
          name="latitude"
          label="Latitude"
          type="number"
          step="0.000001"
          defaultValue={distributor.latitude ?? ''}
          error={state.fieldErrors?.['latitude']}
        />
        <Field
          name="longitude"
          label="Longitude"
          type="number"
          step="0.000001"
          defaultValue={distributor.longitude ?? ''}
          error={state.fieldErrors?.['longitude']}
        />
      </div>

      <p className="text-[11px] text-white/40">
        Le numéro de série et le nombre de casiers ne sont pas modifiables (structure physique).
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
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  )
}

type FieldProps = {
  name: string
  label: string
  error?: string | undefined
} & React.InputHTMLAttributes<HTMLInputElement>

function Field({ name, label, error, ...rest }: FieldProps) {
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
          error && 'border-rose-500/50',
        )}
      />
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  )
}
