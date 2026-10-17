import type { InitialRecords } from '@blog/graphql-runtime'
import { type ReactNode, useMemo } from 'react'
import { RelayEnvironmentProvider } from 'react-relay'
import { createPublicRelayEnvironment, PUBLIC_GRAPHQL_PATH } from '~/lib/relay'

/**
 * Provides a Relay environment seeded with a route's serialized records, so
 * queries resolve from cache during SSR and hydration. The route loaders
 * already fetched the data.
 */
export function RelayScope({
  children,
  records,
}: {
  children: ReactNode
  records?: InitialRecords
}) {
  const environment = useMemo(
    () => createPublicRelayEnvironment({ records, url: PUBLIC_GRAPHQL_PATH }),
    [records],
  )

  return (
    <RelayEnvironmentProvider environment={environment}>
      {children}
    </RelayEnvironmentProvider>
  )
}
