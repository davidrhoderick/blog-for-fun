import {
  createRelayEnvironment,
  type FetchGraphQL,
  type InitialRecords,
} from '@blog/graphql-runtime'
import type { GraphQLResponse } from 'relay-runtime'

/** Same-origin path the public site's browser transport posts to. */
export const PUBLIC_GRAPHQL_PATH = '/graphql'

const createFetchGraphQL =
  (url: string): FetchGraphQL =>
  async (request, variables) => {
    if (!request.text) {
      throw new Error(`Relay operation ${request.name} has no query text`)
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: request.text, variables }),
    })
    if (!response.ok) {
      throw new Error(`GraphQL server returned HTTP ${response.status}`)
    }

    return (await response.json()) as GraphQLResponse
  }

/**
 * A Relay environment for the public site. Loaders build one empty to fetch
 * with; the route component rebuilds one from the loader's serialized records
 * so `store-or-network` renders from cache during SSR and hydration.
 */
export const createPublicRelayEnvironment = ({
  records,
  url,
}: {
  records?: InitialRecords
  url: string
}) => createRelayEnvironment(createFetchGraphQL(url), records)
