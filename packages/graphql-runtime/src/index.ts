import {
  Environment,
  type GraphQLResponse,
  Network,
  RecordSource,
  type RequestParameters,
  Store,
  type Variables,
} from 'relay-runtime'

export type FetchGraphQL = (
  request: RequestParameters,
  variables: Variables,
) => Promise<GraphQLResponse>

/**
 * A serialized Relay store: what `store.getSource().toJSON()` returns on the
 * server and what a hydration environment is seeded from on the client.
 */
export type InitialRecords = ConstructorParameters<typeof RecordSource>[0]

export const createRelayEnvironment = (
  fetchGraphQL: FetchGraphQL,
  records?: InitialRecords,
) =>
  new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource(records)),
  })
