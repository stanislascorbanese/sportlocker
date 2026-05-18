import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { SESSION_COOKIE, decodeSession } from '../../../lib/session'

const PostBody = z.object({
  sessionToken: z.string().min(20),
})

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null)
  const parsed = PostBody.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const token = parsed.data.sessionToken
  const payload = decodeSession(token)
  if (!payload) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
  const jar = await cookies()
  jar.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(): Promise<NextResponse> {
  const jar = await cookies()
  jar.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return NextResponse.json({ ok: true })
}
