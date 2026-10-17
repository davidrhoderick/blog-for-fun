import {
  type ConcreteRequest,
  fetchQuery,
  type GraphQLResponse,
  type RequestParameters,
  type Variables,
} from 'relay-runtime'
import { expect, test } from 'vitest'
import { createRelayEnvironment } from './index'

// A hand-written Relay operation, so the package test does not depend on the
// Relay Babel transform (which this package does not configure).
const viewerSelections = [
  {
    kind: 'LinkedField',
    alias: null,
    name: 'viewer',
    storageKey: null,
    args: null,
    concreteType: 'Viewer',
    plural: false,
    selections: [
      {
        kind: 'ScalarField',
        alias: null,
        name: 'id',
        storageKey: null,
        args: null,
      },
    ],
  },
]

const viewerQuery = {
  kind: 'Request',
  fragment: {
    kind: 'Fragment',
    name: 'ViewerQuery',
    type: 'Query',
    metadata: null,
    argumentDefinitions: [],
    selections: viewerSelections,
  },
  operation: {
    kind: 'Operation',
    name: 'ViewerQuery',
    argumentDefinitions: [],
    selections: viewerSelections,
  },
  params: {
    id: 'viewer-query',
    name: 'ViewerQuery',
    operationKind: 'query',
    text: 'query ViewerQuery { viewer { id } }',
    metadata: {},
    providedVariables: null,
  },
} as unknown as ConcreteRequest

test('wires the injected fetch function into a working Relay environment', {
  tags: ['integration'],
}, async () => {
  const calls: Array<{ name: string; variables: Variables }> = []
  const environment = createRelayEnvironment(
    async (request: RequestParameters, variables: Variables) => {
      calls.push({ name: request.name, variables })
      return { data: { viewer: { id: 'viewer-1' } } } satisfies GraphQLResponse
    },
  )

  const data = await fetchQuery(environment, viewerQuery, {}).toPromise()

  expect(data).toEqual({ viewer: { id: 'viewer-1' } })
  expect(calls).toEqual([{ name: 'ViewerQuery', variables: {} }])
})

test('serves a store-or-network query from seeded records alone', {
  tags: ['integration'],
}, async () => {
  const source = createRelayEnvironment(async () => ({
    data: { viewer: { id: 'viewer-1' } },
  }))
  await fetchQuery(source, viewerQuery, {}).toPromise()

  const hydrated = createRelayEnvironment(async () => {
    throw new Error('the network must not be called when records are seeded')
  }, source.getStore().getSource().toJSON())

  const data = await fetchQuery(
    hydrated,
    viewerQuery,
    {},
    {
      fetchPolicy: 'store-or-network',
    },
  ).toPromise()

  expect(data).toEqual({ viewer: { id: 'viewer-1' } })
})
