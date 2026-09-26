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

export const createRelayEnvironment = (fetchGraphQL: FetchGraphQL) =>
  new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource()),
  })
