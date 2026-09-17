import {
  createBlankSessionCookie,
  createSessionCookie,
  readSessionToken,
} from './cookie'
import { validateSessionToken } from './session'
import type { AuthSession, Principal } from './types'

export type AuthContext = {
  request: Request
  responseHeaders: Headers
  sessionToken: string | null
  session: AuthSession | null
  principal: Principal | null
}

export const createAuthContext = async (
  request: Request,
): Promise<AuthContext> => {
  const responseHeaders = new Headers()
  const sessionToken = readSessionToken(request)
  if (!sessionToken) {
    return {
      request,
      responseHeaders,
      sessionToken: null,
      session: null,
      principal: null,
    }
  }

  const result = await validateSessionToken(sessionToken)
  if (!result.session || !result.principal) {
    responseHeaders.set('set-cookie', createBlankSessionCookie())
    return {
      request,
      responseHeaders,
      sessionToken: null,
      session: null,
      principal: null,
    }
  }

  if (result.renewed) {
    responseHeaders.set(
      'set-cookie',
      createSessionCookie(sessionToken, result.session),
    )
  }

  return {
    request,
    responseHeaders,
    sessionToken,
    session: result.session,
    principal: result.principal,
  }
}
