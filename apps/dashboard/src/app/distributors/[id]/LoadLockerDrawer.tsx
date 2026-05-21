'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '../../../lib/cn'
import { ITEM_CONDITIONS, type ItemCondition } from '../../../lib/api-enums'
import { loadLockerAction, type LoadLockerState } from './_actions'

const INITIAL: LoadLockerState = { status: 'idle' }

const CONDITION_LABEL: Record<ItemCondition, string> = {
  new: 'Neuf', good: 'Bon état', worn: 'Usé', damaged: 'Endommagé', lost: 'Perdu',
}

export type LoadableLockerOption = {
  id: string
  position: number
}

export type ItemTypeOption = {
  id: string
  name: string
  category: string
}

export function LoadLockerDrawer({
  distributorId,
  distributorName,
  itemTypes,
  lockers,
  demo,
}: {
  distributorId: string
  distributorName: string
  itemTypes: ItemTypeOption[]
  lockers: LoadableLockerOption[]
  /** Désactive l'envoi quand on est en mode démo (API indispo). */
  demo: boolean
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(true)}
        disabled={demo || itemTypes.length === 0 || lockers.length === 0}
        title={
          demo                  ? 'Mode démo : action désactivée'
          : itemTypes.length === 0 ? 'Aucun type d\'article au catalogue'
          : lockers.length === 0   ? 'Aucun casier idle vide'
          : undefined
        }
        className={cn(
          'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition',
          'hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        + Charger un casier
      </button>

      {open && (
        <DrawerPanel
          onClose={() => {
            setOpen(false)
            // Rendre le focus au bouton après fermeture pour l'a11y.
            setTimeout(() => buttonRef.current?.focus(), 0)
          }}
          distributorId={distributorId}
          distributorName={distributorName}
          itemTypes={itemTypes}
          lockers={lockers}
        />
      )}
    </>
  )
}

function DrawerPanel({
  onClose,
  distributorId,
  distributorName,
  itemTypes,
  lockers,
}: {
  onClose: () => void
  distributorId: string
  distributorName: string
  itemTypes: ItemTypeOption[]
  lockers: LoadableLockerOption[]
}) {
  const boundAction = (prev: LoadLockerState, fd: FormData) =>
    loadLockerAction(distributorId, prev, fd)
  const [state, formAction] = useFormState(boundAction, INITIAL)

  // Echap → fermeture. Ferme aussi automatiquement après succès (UX : revoir
  // la grille mise à jour). On garde la possibilité d'enchaîner via le bouton
  // "Charger un autre" qui reset le formulaire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
      />

      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-hidden border-l border-white/10 bg-navy-900 shadow-2xl"
        role="dialog"
        aria-label="Charger un casier"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Charger un casier
            </h3>
            <p className="mt-0.5 truncate text-sm text-white">{distributorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg border border-white/10 p-1.5 text-white/60 transition hover:border-white/30 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {state.status === 'success' ? (
          <SuccessView state={state} onReset={onClose} />
        ) : (
          <form action={formAction} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <Select
              name="itemTypeId"
              label="Type d'article"
              required
              error={state.fieldErrors?.['itemTypeId']}
              defaultValue=""
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
              autoComplete="off"
              autoFocus
              required
              mono
              hint="Scanner le tag ou saisir manuellement (4 caractères minimum)"
              error={state.fieldErrors?.['rfidTag']}
            />

            <Select
              name="condition"
              label="État"
              defaultValue="new"
              required
              error={state.fieldErrors?.['condition']}
            >
              {ITEM_CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABEL[c]}</option>
              ))}
            </Select>

            <Select
              name="lockerId"
              label="Casier de destination"
              defaultValue=""
              required
              error={state.fieldErrors?.['lockerId']}
              hint={`${lockers.length} casier${lockers.length > 1 ? 's' : ''} idle vide${lockers.length > 1 ? 's' : ''} dispo`}
            >
              <option value="" disabled>— Choisir un casier vide —</option>
              {lockers.map((l) => (
                <option key={l.id} value={l.id}>
                  Casier #{l.position + 1}
                </option>
              ))}
            </Select>

            {state.status === 'error' && state.message && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {state.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Annuler
              </button>
              <SubmitButton />
            </div>
          </form>
        )}
      </aside>
    </>
  )
}

function SuccessView({
  state, onReset,
}: { state: LoadLockerState; onReset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        ✓
      </div>
      <h4 className="font-display text-xl text-white">Casier chargé</h4>
      <p className="mt-2 max-w-xs text-sm text-white/60">
        {state.message ?? 'L\'article est désormais associé au casier sélectionné.'}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
      >
        Retour à la grille
      </button>
    </div>
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
      {pending ? 'Chargement…' : 'Charger'}
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
