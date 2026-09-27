import { createRelayEnvironment } from '@blog/graphql-runtime'
import type { GraphQLResponse } from 'relay-runtime'

export const relayEnvironment = createRelayEnvironment(
  async (request, variables) => {
    if (!request.text) {
      throw new Error(`Relay operation ${request.name} has no query text`)
    }

    const response = await fetch(`${import.meta.env.BASE_URL}api/graphql`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: request.name,
        query: request.text,
        variables,
      }),
    })
    if (!response.ok) {
      throw new Error(`GraphQL proxy returned HTTP ${response.status}`)
    }

    return (await response.json()) as GraphQLResponse
  },
)
