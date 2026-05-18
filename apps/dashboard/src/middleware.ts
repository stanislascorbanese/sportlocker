import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE, decodeSession, isSessionExpired } from './lib/session'

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return redirectToLogin(request)

  const payload = decodeSession(token)
  if (!payload || isSessionExpired(payload)) {
    const res = redirectToLogin(request)
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  return NextResponse.next()
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  const fromPath = request.nextUrl.pathname + request.nextUrl.search
  if (fromPath !== '/' && !fromPath.startsWith('/login')) {
    url.searchParams.set('redirect', fromPath)
  } else {
    url.search = ''
  }
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     * - /login, /accept-invite (pages publiques)
     * - /api/session (endpoint set-cookie post-login)
     * - /_next/* (assets Next)
     * - /favicon.ico, /robots.txt, fichiers statiques (extension .xxx)
     */
    '/((?!login|accept-invite|api/session|_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\..*).*)',
  ],
}
