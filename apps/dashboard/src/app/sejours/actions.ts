'use server'

import { revalidateTag } from 'next/cache'

import { ApiError, importStaysCsv, previewStaysCsv } from '../../lib/api'
import type { StayImportPreview, StayImportResult } from '../../lib/api'

/**
 * Le CSV traverse une server action plutôt que d'aller du navigateur vers
 * l'API : le jeton d'admin ne sort ainsi jamais du serveur Next, et l'écran
 * n'a pas besoin de connaître l'URL de l'API.
 *
 * Les deux actions renvoient une union succès/erreur au lieu de lever. Un
 * import refusé parce qu'une colonne est mal nommée est un cas courant, pas un
 * plantage : il doit s'afficher dans l'écran, pas remplacer l'écran.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string }

/**
 * `throwApiError` appelle `redirect()` sur un 401, et `redirect()` signale en
 * levant. Attraper cette exception-là transformerait une session expirée en
 * « erreur inconnue » au lieu de renvoyer vers la page de connexion : on la
 * laisse repartir.
 */
function isRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}

function codeOf(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'unknown'
}

export async function previewStaysAction(csv: string): Promise<ActionResult<StayImportPreview>> {
  try {
    return { ok: true, data: await previewStaysCsv(csv) }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, code: codeOf(err) }
  }
}

export async function importStaysAction(csv: string): Promise<ActionResult<StayImportResult>> {
  try {
    const data = await importStaysCsv(csv)
    revalidateTag('stays')
    return { ok: true, data }
  } catch (err) {
    if (isRedirect(err)) throw err
    return { ok: false, code: codeOf(err) }
  }
}
