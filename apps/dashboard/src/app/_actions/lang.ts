'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { LANG_COOKIE, isLang } from '../../lib/lang'

/**
 * Server action pour changer la langue. Pose un cookie 1 an, puis revalide
 * la racine pour que `<html lang>` soit recalculé au prochain rendu.
 */
export async function setLangAction(value: string): Promise<void> {
  if (!isLang(value)) return
  const jar = await cookies()
  jar.set(LANG_COOKIE, value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 an
    sameSite: 'lax',
    httpOnly: false, // côté client lecture via document.cookie possible
  })
  revalidatePath('/', 'layout')
}
