import { lazy, Suspense, useEffect, useState } from 'react'
import type { Route } from './+types/posts'

export const meta = (_args: Route.MetaArgs) => [
  { title: 'Posts | Blog administration' },
]

export const handle = { pageTitle: 'Posts' }

const ClientPosts = lazy(() => import('~/components/posts.client'))

export default function Posts() {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {isHydrated ? (
        <Suspense
          fallback={
            <p className="border border-slate-200 px-5 py-8 text-sm text-slate-500">
              Loading posts...
            </p>
          }
        >
          <ClientPosts />
        </Suspense>
      ) : (
        <p className="border border-slate-200 px-5 py-8 text-sm text-slate-500">
          Loading posts...
        </p>
      )}
    </main>
  )
}
