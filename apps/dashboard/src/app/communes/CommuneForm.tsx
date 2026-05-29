'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'

import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { commonStrings } from '../../lib/i18n/common'
import { communesStrings } from '../../lib/i18n/communes'
import { createCommuneAction, updateCommuneAction, type FormState } from './_actions'
import { CommuneAutocomplete, type CommuneAutofill } from './CommuneAutocomplete'

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
  lang,
}: {
  mode: 'create' | 'edit'
  initial?: CommuneInitial
  id?: string
  lang: Lang
}) {
  const t = communesStrings(lang)
  const c = commonStrings(lang)
  const action = mode === 'create'
    ? createCommuneAction
    : (prev: FormState, fd: FormData) => updateCommuneAction(id ?? '', prev, fd)

  const [state, formAction] = useFormState(action, INITIAL)

  const v = initial ?? {}
  const monthlyFeeEuros = v.monthlyFeeCents != null ? (v.monthlyFeeCents / 100).toString() : ''

  // État contrôlé pour les 6 champs administratifs auto-remplissables via
  // CommuneAutocomplete. Les champs contrat/contact restent uncontrolled
  // (defaultValue) car pas concernés par l'auto-remplissage.
  const [fields, setFields] = useState({
    inseeCode: v.inseeCode ?? '',
    postalCode: v.postalCode ?? '',
    name: v.name ?? '',
    department: v.department ?? '',
    region: v.region ?? '',
    population: v.population != null ? String(v.population) : '',
  })

  function setField<K extends keyof typeof fields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function applyAutofill(co: CommuneAutofill) {
    setFields(co)
  }

  return (
    <form action={formAction} className="space-y-5">
      {mode === 'create' && <CommuneAutocomplete lang={lang} onSelect={applyAutofill} />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          name="inseeCode"
          label={t.fieldInseeCode}
          placeholder="75111"
          value={fields.inseeCode}
          onChange={(e) => setField('inseeCode', e.target.value)}
          error={state.fieldErrors?.['inseeCode']}
          required
          readOnly={mode === 'edit'}
          hint={mode === 'edit' ? t.fieldInseeHintImmutable : t.fieldInseeHint5}
          mono
        />
        <Field
          name="postalCode"
          label={t.fieldPostalCode}
          placeholder="75011"
          value={fields.postalCode}
          onChange={(e) => setField('postalCode', e.target.value)}
          error={state.fieldErrors?.['postalCode']}
          required
        />
      </div>

      <Field
        name="name"
        label={t.fieldName}
        placeholder="Paris 11e"
        value={fields.name}
        onChange={(e) => setField('name', e.target.value)}
        error={state.fieldErrors?.['name']}
        required
      />

      <div className="grid grid-cols-3 gap-4">
        <Field
          name="department"
          label={t.fieldDepartment}
          placeholder="75"
          value={fields.department}
          onChange={(e) => setField('department', e.target.value)}
          error={state.fieldErrors?.['department']}
          required
        />
        <div className="col-span-2">
          <Field
            name="region"
            label={t.fieldRegion}
            placeholder="Île-de-France"
            value={fields.region}
            onChange={(e) => setField('region', e.target.value)}
            error={state.fieldErrors?.['region']}
            required
          />
        </div>
      </div>

      <Field
        name="population"
        label={t.fieldPopulation}
        type="number"
        placeholder="147017"
        value={fields.population}
        onChange={(e) => setField('population', e.target.value)}
        error={state.fieldErrors?.['population']}
      />

      <fieldset className="rounded-lg border bg-gray-50 p-4 dark:border-white/10 dark:bg-navy-900/50">
        <legend className="px-2 text-eyebrow text-gray-500 dark:text-white/50">{t.fieldsetContract}</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field
            name="contractStart"
            label={t.fieldStart}
            type="date"
            defaultValue={v.contractStart ?? ''}
            error={state.fieldErrors?.['contractStart']}
          />
          <Field
            name="contractEnd"
            label={t.fieldEnd}
            type="date"
            defaultValue={v.contractEnd ?? ''}
            error={state.fieldErrors?.['contractEnd']}
          />
        </div>
        <div className="mt-4">
          <Field
            name="monthlyFeeEuros"
            label={t.fieldMonthlyFee}
            type="number"
            step="1"
            placeholder="1500"
            defaultValue={monthlyFeeEuros}
            error={state.fieldErrors?.['monthlyFeeEuros']}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border bg-gray-50 p-4 dark:border-white/10 dark:bg-navy-900/50">
        <legend className="px-2 text-eyebrow text-gray-500 dark:text-white/50">{t.fieldsetContact}</legend>
        <Field
          name="contactEmail"
          label={t.fieldEmail}
          type="email"
          placeholder="contact@mairie.fr"
          defaultValue={v.contactEmail ?? ''}
          error={state.fieldErrors?.['contactEmail']}
        />
        <div className="mt-4">
          <Field
            name="contactPhone"
            label={t.fieldPhone}
            placeholder="+33 1 53 27 11 00"
            defaultValue={v.contactPhone ?? ''}
            error={state.fieldErrors?.['contactPhone']}
          />
        </div>
      </fieldset>

      {state.status === 'error' && state.message && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/communes"
          className="rounded-lg border px-4 py-2 text-sm text-gray-700 transition-colors duration-base ease-out-soft hover:border-gray-400 hover:text-navy-900 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white"
        >
          {c.cancel}
        </Link>
        <SubmitButton mode={mode} createLabel={t.createCommune} saveLabel={t.saveCommune} />
      </div>
    </form>
  )
}

function SubmitButton({
  mode,
  createLabel,
  saveLabel,
}: {
  mode: 'create' | 'edit'
  createLabel: string
  saveLabel: string
}) {
  const { pending } = useFormStatus()
  const label = mode === 'create' ? createLabel : saveLabel
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-base ease-out-soft',
        'hover:bg-emerald-500 disabled:opacity-50',
        'dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400',
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
      <span className="block text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-white/55">
        {label}
      </span>
      <input
        name={name}
        {...rest}
        className={cn(
          'mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm text-navy-900 outline-none transition-colors duration-base',
          'border-gray-300 placeholder:text-gray-400 focus:border-emerald-500',
          'read-only:cursor-not-allowed read-only:bg-gray-100 read-only:text-gray-500',
          'dark:border-white/15 dark:bg-navy-800 dark:text-white dark:placeholder:text-white/30 dark:focus:border-emerald-400/60',
          'dark:read-only:bg-navy-900 dark:read-only:text-white/50',
          mono && 'font-mono text-xs',
          error && 'border-rose-400 dark:border-rose-500/50',
        )}
      />
      {hint && !error && (
        <span className="mt-1 block text-meta text-gray-500 dark:text-white/40">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-meta text-rose-700 dark:text-rose-300">{error}</span>
      )}
    </label>
  )
}
