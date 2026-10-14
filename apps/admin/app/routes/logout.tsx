import { redirect } from 'react-router'
import { requireSameOrigin } from '~/lib/csrf.server'
import { requestGraphQL, responseHeaders } from '~/lib/graphql.server'
import type { Route } from './+types/logout'

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request)
  const { setCookie } = await requestGraphQL<{ logout: boolean }>(
    request,
    'mutation { logout }',
  )
  return redirect('/login', { headers: responseHeaders(setCookie) })
}

export async function loader() {
  return redirect('/')
}

export default function Logout() {
  return null
}
