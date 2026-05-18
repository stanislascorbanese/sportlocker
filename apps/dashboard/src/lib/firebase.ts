'use client'

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

function readConfig(): { apiKey: string; authDomain: string; projectId: string; appId: string } {
  const apiKey     = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const appId      = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

  const missing: string[] = []
  if (!apiKey)     missing.push('NEXT_PUBLIC_FIREBASE_API_KEY')
  if (!authDomain) missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')
  if (!projectId)  missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  if (!appId)      missing.push('NEXT_PUBLIC_FIREBASE_APP_ID')
  if (missing.length) {
    throw new Error(`Firebase config manquante : ${missing.join(', ')}`)
  }
  return { apiKey: apiKey!, authDomain: authDomain!, projectId: projectId!, appId: appId! }
}

let appInstance: FirebaseApp | null = null

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance
  appInstance = getApps().length ? getApp() : initializeApp(readConfig())
  return appInstance
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}
