import { data } from 'react-router'
import { proxyGraphQL } from '~/lib/graphql.server'
import type { Route } from './+types/api.graphql'

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    throw data('Method not allowed', { status: 405 })
  }

  return proxyGraphQL(request)
}
