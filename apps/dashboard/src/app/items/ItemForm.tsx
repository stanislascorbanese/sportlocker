'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'

import { cn } from '../../lib/cn'
// Important : importer depuis api-enums (client-safe), PAS depuis ../../lib/api
// qui embarquerait next/headers côté client et casserait le build Next.js.
// cf. apps/dashboard/src/lib/api-enums.ts pour le contexte.
import { ITEM_CONDITIONS, type ItemCondition } from '../../lib/api-enums'
import {
  createItemAction,
  updateItemAction,
  type FormState,
} from './_actions'

const INITIAL: FormState = { status: 'idle' }

const CONDITION_LABEL: Record<ItemCondition, string> = {
  new: 'Neuf',
  good: 'Bon état',
  worn: 'Usé',
  damaged: 'Endommagé',
  lost: 'Perdu',
}

export type LockerOption = {
  id: string
  position: number
  distributorId: string
  distributorName: string
  distributorSerial: string
  state: string
}

export type ItemInitial = {
  itemTypeId?: string
  rfidTag?: string
  condition?: ItemCondition
  currentLockerId?: string | null
  lastInspectedAt?: string | null
}

export function ItemForm({
  mode,
  initial,
  id,
  itemTypes,
  lockers,
}: {
  mode: 'create' | 'edit'
  initial?: ItemInitial
  id?: string
  itemTypes: Array<{ id: string; name: string; category: string }>
  lockers: LockerOption[]
}) {
  const action = mode === 'create'
    ? createItemAction
    : (prev: FormState, fd: FormData) => updateItemAction(id ?? '', prev, fd)

  const [state, formAction] = useFormState(action, INITIAL)

  const v = initial ?? {}
  // lastInspectedAt API renvoie ISO datetime, on extrait juste la date pour l'input.
  const lastInspectedDate = v.lastInspectedAt ? v.lastInspectedAt.slice(0, 10) : ''

  return (
    <form action={formAction} className="space-y-5">
      <Select
        name="itemTypeId"
        label="Type d'article"
        defaultValue={v.itemTypeId ?? ''}
        disabled={mode === 'edit'}
        hint={mode === 'edit' ? 'Non modifiable après création — un article = instance figée d\'un type' : undefined}
        error={state.fieldErrors?.['itemTypeId']}
        required
      >
        <option value="" disabled>— Choisir un type —</option>
        {itemTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.category})
          </option>
        ))}
      </Select>

      <Field
        name="rfidTag"
        label="Tag RFID"
        placeholder="RFID-BB-0001"
        defaultValue={v.rfidTag ?? ''}
        error={state.fieldErrors?.['rfidTag']}
        required
        mono
        hint="Identifiant unique inscrit sur la puce — minimum 4 caractères"
      />

      <Select
        name="condition"
        label="État"
        defaultValue={v.condition ?? 'new'}
        error={state.fieldErrors?.['condition']}
        required
      >
        {ITEM_CONDITIONS.map((c) => (
          <option key={c} value={c}>{CONDITION_LABEL[c]}</option>
        ))}
      </Select>

      <Select
        name="currentLockerId"
        label="Casier actuel"
        defaultValue={v.currentLockerId ?? ''}
        error={state.fieldErrors?.['currentLockerId']}
        hint="Choisir un casier vacant. Laisse vide pour stock atelier (super-admin uniquement)."
      >
        <option value="">— Stock atelier (orphelin) —</option>
        {lockers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.distributorName} · casier #{l.position + 1} ({l.distributorSerial})
            {l.state !== 'idle' ? ` — ${l.state}` : ''}
          </option>
        ))}
      </Select>

      {mode === 'edit' && (
        <Field
          name="lastInspectedAt"
          label="Dernière inspection"
          type="date"
          defaultValue={lastInspectedDate}
          error={state.fieldErrors?.['lastInspectedAt']}
          hint="Date du dernier contrôle physique. Laisse vide si jamais inspecté."
        />
      )}

      {state.status === 'error' && state.message && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/items?tab=instances"
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
  const label = mode === 'create' ? 'Créer l\'article' : 'Enregistrer'
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
          mono && 'font-mono text-xs',
          error && 'border-rose-500/50',
        )}
      />
      {hint && !error && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  )
}

type SelectProps = {
  name: string
  label: string
  hint?: string | undefined
  error?: string | undefined
} & React.SelectHTMLAttributes<HTMLSelectElement>

function Select({ name, label, hint, error, children, ...rest }: SelectProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-white/55">
        {label}
      </span>
      <select
        name={name}
        {...rest}
        className={cn(
          'mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
          'focus:border-emerald-400/60',
          'disabled:cursor-not-allowed disabled:bg-navy-900 disabled:text-white/50',
          error && 'border-rose-500/50',
        )}
      >
        {children}
      </select>
      {hint && !error && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  )
}
