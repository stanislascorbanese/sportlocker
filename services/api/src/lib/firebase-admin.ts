import { env } from '../config/env.js'

type FirebaseAdmin = (typeof import('firebase-admin'))['default']

let cached: FirebaseAdmin | null = null

/**
 * Retourne l'instance `firebase-admin` avec l'app par défaut initialisée, ou
 * `null` si FIREBASE_* n'est pas configuré (dev sans Firebase → les appelants
 * basculent sur leur fallback / renvoient une erreur propre).
 *
 * Garde via `admin.apps.length` plutôt qu'un booléen local : plusieurs modules
 * (auth citoyen, auth admin, e-mails transactionnels) partagent la même app
 * par défaut. Un second `initializeApp()` lèverait "default app already exists"
 * — historiquement chaque module avait son propre flag `firebaseInitialized`,
 * si bien que le 2ᵉ module à s'initialiser plantait selon l'ordre d'appel et
 * son erreur était avalée (→ login cassé en apparence aléatoire). Ce garde
 * partagé rend l'init idempotente quel que soit l'ordre.
 */
export async function getFirebaseAdmin(): Promise<FirebaseAdmin | null> {
  if (cached) return cached
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY || !env.FIREBASE_PROJECT_ID) return null
  const admin = (await import('firebase-admin')).default
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      projectId: env.FIREBASE_PROJECT_ID,
    })
  }
  cached = admin
  return admin
}
