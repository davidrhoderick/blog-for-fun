import { lazy, Suspense, useEffect, useState } from 'react'
import type { Route } from './+types/post'

export const meta = (_args: Route.MetaArgs) => [
  { title: 'Post | Blog administration' },
]

export const handle = { pageTitle: 'Post' }

const ClientPost = lazy(() => import('~/components/post.client'))

export default function Post({ params }: Route.ComponentProps) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {isHydrated ? (
        <Suspense fallback={<p className="editor-loading">Loading post...</p>}>
          <ClientPost id={params.id} />
        </Suspense>
      ) : (
        <p className="editor-loading">Loading post...</p>
      )}
    </main>
  )
}
