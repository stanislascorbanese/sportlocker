'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'

import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { commonStrings } from '../../lib/i18n/common'
import { itemsStrings } from '../../lib/i18n/items'
import {
  createItemTypeAction,
  updateItemTypeAction,
  type FormState,
} from './_actions'

const INITIAL: FormState = { status: 'idle' }

export type ItemTypeInitial = {
  slug?: string
  name?: string
  category?: string
  description?: string | null
  imageUrl?: string | null
  cautionCents?: number
  maxDurationMinutes?: number
}

export function ItemTypeForm({
  mode,
  initial,
  id,
  lang,
}: {
  mode: 'create' | 'edit'
  initial?: ItemTypeInitial
  id?: string
  lang: Lang
}) {
  const t = itemsStrings(lang)
  const c = commonStrings(lang)
  const action = mode === 'create'
    ? createItemTypeAction
    : (prev: FormState, fd: FormData) => updateItemTypeAction(id ?? '', prev, fd)

  const [state, formAction] = useFormState(action, INITIAL)

  const v = initial ?? {}
  const cautionEuros = v.cautionCents != null ? (v.cautionCents / 100).toString() : ''
  const submitLabel = mode === 'create' ? t.btnSubmitCreateType : t.btnSubmitSaveType

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="slug"
          label={t.formItemTypeSlug}
          placeholder="ballon-basket"
          defaultValue={v.slug ?? ''}
          error={state.fieldErrors?.['slug']}
          required
          readOnly={mode === 'edit'}
          mono
        />
        <Field
          name="category"
          label={t.formItemTypeCategory}
          placeholder="ballon"
          defaultValue={v.category ?? ''}
          error={state.fieldErrors?.['category']}
          required
        />
      </div>

      <Field
        name="name"
        label={t.formItemTypeName}
        placeholder={lang === 'fr' ? 'Ballon de basket' : 'Basketball'}
        defaultValue={v.name ?? ''}
        error={state.fieldErrors?.['name']}
        required
      />

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-white/55">
          {t.formNotes}
        </span>
        <textarea
          name="description"
          rows={3}
          defaultValue={v.description ?? ''}
          className={cn(
            'mt-1.5 w-full resize-y rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none transition',
            'placeholder:text-white/30 focus:border-emerald-400/60',
            state.fieldErrors?.['description'] && 'border-rose-500/50',
          )}
        />
        {state.fieldErrors?.['description'] && (
          <span className="mt-1 block text-[11px] text-rose-300">{state.fieldErrors['description']}</span>
        )}
      </label>

      <Field
        name="imageUrl"
        label={t.formItemTypeImage}
        type="url"
        placeholder="https://cdn.sportlocker.fr/items/basketball.png"
        defaultValue={v.imageUrl ?? ''}
        error={state.fieldErrors?.['imageUrl']}
        hint={t.formItemTypeImageHint}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field
          name="cautionEuros"
          label={t.formCautionCents}
          type="number"
          step="1"
          min="0"
          placeholder="20"
          defaultValue={cautionEuros}
          error={state.fieldErrors?.['cautionEuros']}
          required
        />
        <Field
          name="maxDurationMinutes"
          label={t.formMaxDurationMin}
          type="number"
          step="15"
          min="15"
          placeholder="240"
          defaultValue={v.maxDurationMinutes ?? ''}
          error={state.fieldErrors?.['maxDurationMinutes']}
          required
        />
      </div>

      {state.status === 'error' && state.message && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/items?tab=types"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
        >
          {c.cancel}
        </Link>
        <SubmitButton label={submitLabel} submitting={t.btnSubmitSubmitting} />
      </div>
    </form>
  )
}

function SubmitButton({ label, submitting }: { label: string; submitting: string }) {
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
      {pending ? `${submitting}` : label}
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
