import type { Metadata } from 'next'

import { getLang } from '../lang-server'
import type { Lang } from '../lang'

/**
 * Helper qui génère un `generateMetadata` localisé Next.js pour les pages
 * du dashboard. Lit le cookie `sportlocker-lang` côté serveur, résout le
 * titre depuis la fonction de résolution passée, et retourne le `Metadata`
 * attendu par Next.js.
 *
 * Pourquoi ne pas utiliser `export const metadata = {...}` statique ?
 * Next.js ne peut pas connaître la lang à la compilation : le rendu est
 * dynamique (force-dynamic + cookie). On a donc besoin d'un
 * `generateMetadata` async qui s'exécute par request.
 *
 * Usage :
 *   export const generateMetadata = makeMetadata(
 *     (lang) => communesStrings(lang).metaTitle
 *   )
 */
export function makeMetadata(
  resolveTitle: (lang: Lang) => string,
): () => Promise<Metadata> {
  return async () => {
    const lang = await getLang()
    return { title: resolveTitle(lang) }
  }
}
