import { type ReactNode, useEffect, useState } from 'react'
import { RelayEnvironmentProvider } from 'react-relay'
import { relayEnvironment } from '~/lib/relay-environment.client'

export const RelayClientProvider = ({ children }: { children: ReactNode }) => {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null

  return (
    <RelayEnvironmentProvider environment={relayEnvironment}>
      {children}
    </RelayEnvironmentProvider>
  )
}
