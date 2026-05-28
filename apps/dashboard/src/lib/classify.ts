/**
 * Helpers de classification métier réutilisables (testables unitairement).
 *
 * On regroupe ici les fonctions pures qui transforment des données
 * backend (Stripe Connect status, dates de contrat, trust score…) en
 * "kind" lisible côté UI. Les pages les consomment via un mapping
 * `kind → { tone, label, icon }`.
 *
 * Pourquoi extraire ici plutôt que dans les `page.tsx` ?
 *  - Permet de tester avec vitest sans dépendre du rendu Next.js.
 *  - Évite la duplication entre pages qui ont la même logique
 *    (ex. trust score apparaît dans /users + /reports).
 */

import type { StripeConnectStatus } from './api'

// ─── Stripe Connect ──────────────────────────────────────────────────────

export type StripeConnectKind =
  | 'not_started'
  | 'pending_verification'
  | 'charges_only'
  | 'payouts_only'
  | 'fully_verified'

/**
 * Classifie le statut Stripe Connect d'un tenant.
 *
 * Précédence (du plus avancé au moins avancé) :
 *   fully_verified > charges_only > payouts_only > pending_verification > not_started
 */
export function classifyStripeConnect(status: StripeConnectStatus): StripeConnectKind {
  if (!status.connected) return 'not_started'
  if (status.chargesEnabled && status.payoutsEnabled) return 'fully_verified'
  if (status.chargesEnabled) return 'charges_only'
  if (status.payoutsEnabled) return 'payouts_only'
  return 'pending_verification'
}

// ─── Contrat commune ─────────────────────────────────────────────────────

export type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'none'

/** Fenêtre de "soon" pour un contrat qui se termine : 60 jours. */
export const CONTRACT_EXPIRING_WINDOW_MS = 60 * 24 * 3600 * 1000

/**
 * Classifie le statut d'un contrat commune basé sur sa date de fin.
 * Si pas de date de fin → `none` (commune sans contrat actif).
 */
export function classifyContract(
  contractEnd: string | null,
  now: number = Date.now(),
): ContractStatus {
  if (!contractEnd) return 'none'
  const endMs = new Date(contractEnd).getTime()
  if (endMs < now) return 'expired'
  if (endMs - now < CONTRACT_EXPIRING_WINDOW_MS) return 'expiring_soon'
  return 'active'
}

// ─── Trust score utilisateur ─────────────────────────────────────────────

export type TrustLevel = 'high' | 'medium' | 'low'

/**
 * Classifie un trust score utilisateur (0-100).
 *   ≥ 90 → high   (citoyens modèles, accès auto à options premium)
 *   ≥ 60 → medium (cas normal)
 *   <  60 → low    (alerter ops + restrictions possibles)
 */
export function classifyTrustScore(score: number): TrustLevel {
  if (score >= 90) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

// ─── Maintenance severity ────────────────────────────────────────────────

export type SeverityTone = 'info' | 'good' | 'warn' | 'bad' | 'critical'

/** Map severity 1-5 → tone visuel. Plus le ticket est sévère, plus la couleur tire vers rose. */
export function classifySeverity(severity: number): SeverityTone {
  if (severity <= 1) return 'info'
  if (severity === 2) return 'good'
  if (severity === 3) return 'warn'
  if (severity === 4) return 'bad'
  return 'critical'  // 5 et plus
}
