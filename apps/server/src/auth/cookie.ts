import { parseCookie, stringifySetCookie } from 'cookie'
import type { AuthSession } from './types'

// Cookies are secure by default; local HTTP development must opt out explicitly.
const useSecureCookies = !['development', 'test'].includes(
  process.env.NODE_ENV ?? '',
)

export const SESSION_COOKIE_NAME = useSecureCookies
  ? '__Host-admin_session'
  : 'admin_session'

export const readSessionToken = (request: Request) =>
  parseCookie(request.headers.get('cookie') ?? '')[SESSION_COOKIE_NAME] ?? null

export const createSessionCookie = (
  token: string,
  session: Pick<AuthSession, 'expiresAt'>,
) =>
  stringifySetCookie({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
    maxAge: Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1_000),
    ),
  })

export const createBlankSessionCookie = () =>
  stringifySetCookie({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  })
