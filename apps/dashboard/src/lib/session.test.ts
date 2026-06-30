import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE, SESSION_ROLES, decodeSession, isSessionExpired, type SessionPayload } from './session'

/**
 * Forge un JWT factice (sans signature valide — on ne vérifie pas la signature
 * côté UI). Le header est constant, le payload est passé en argument, et la
 * 3e partie est une chaîne quelconque (`x`) pour que split('.').length === 3.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64Url(JSON.stringify(payload))
  return `${header}.${body}.x`
}

function base64Url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

describe('session constants', () => {
  it('SESSION_COOKIE est sl_session', () => {
    expect(SESSION_COOKIE).toBe('sl_session')
  })

  it('SESSION_ROLES contient super_admin, admin, operator', () => {
    expect(SESSION_ROLES).toEqual(['super_admin', 'admin', 'operator'])
  })
})

describe('decodeSession', () => {
  it('décode un payload valide minimal', () => {
    const token = fakeJwt({
      sub: 'user-1',
      email: 'alice@example.com',
      role: 'operator',
      exp: 9_999_999_999,
    })
    const decoded = decodeSession(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.sub).toBe('user-1')
    expect(decoded?.email).toBe('alice@example.com')
    expect(decoded?.role).toBe('operator')
  })

  it('accepte communeId nullable', () => {
    const token = fakeJwt({
      sub: 'u',
      email: 'a@b.c',
      role: 'admin',
      communeId: null,
      exp: 1,
    })
    const decoded = decodeSession(token)
    expect(decoded?.communeId).toBeNull()
  })

  it('accepte communeId string', () => {
    const token = fakeJwt({
      sub: 'u',
      email: 'a@b.c',
      role: 'admin',
      communeId: 'commune-paris-11',
      exp: 1,
    })
    expect(decodeSession(token)?.communeId).toBe('commune-paris-11')
  })

  it('renvoie null si le JWT a moins de 3 parties', () => {
    expect(decodeSession('abc')).toBeNull()
    expect(decodeSession('abc.def')).toBeNull()
  })

  it('renvoie null si le payload n\'est pas du JSON valide', () => {
    expect(decodeSession('header.notjson.sig')).toBeNull()
  })

  it('renvoie null si le payload n\'a pas les champs requis', () => {
    const bad = fakeJwt({ foo: 'bar' })
    expect(decodeSession(bad)).toBeNull()
  })

  it('renvoie null si le rôle est inconnu', () => {
    const bad = fakeJwt({
      sub: 'u',
      email: 'a@b.c',
      role: 'hacker',
      exp: 1,
    })
    expect(decodeSession(bad)).toBeNull()
  })

  it('décode correctement un payload avec caractères UTF-8 (accents)', () => {
    const token = fakeJwt({
      sub: 'u',
      email: 'élève@école.fr',
      role: 'operator',
      exp: 1,
    })
    expect(decodeSession(token)?.email).toBe('élève@école.fr')
  })
})

describe('isSessionExpired', () => {
  const base: SessionPayload = {
    sub: 'u',
    email: 'a@b.c',
    role: 'operator',
    exp: 1_000,
  }

  it('renvoie true si exp <= now', () => {
    expect(isSessionExpired(base, 1_000)).toBe(true)
    expect(isSessionExpired(base, 2_000)).toBe(true)
  })

  it('renvoie false si exp > now', () => {
    expect(isSessionExpired(base, 999)).toBe(false)
    expect(isSessionExpired(base, 0)).toBe(false)
  })

  it('utilise Date.now() par défaut si nowSeconds non fourni', () => {
    // Token avec exp très loin dans le futur → forcément pas expiré.
    const farFuture = { ...base, exp: 9_999_999_999 }
    expect(isSessionExpired(farFuture)).toBe(false)
    // Token avec exp dans le passé → forcément expiré.
    const past = { ...base, exp: 1 }
    expect(isSessionExpired(past)).toBe(true)
  })
})
