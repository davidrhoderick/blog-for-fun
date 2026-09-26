import { data, Form, Link, Outlet, redirect, useMatches } from 'react-router'
import { getViewer, responseHeaders } from '~/lib/graphql.server'
import type { Route } from './+types/authenticated-layout'

export async function loader({ request }: Route.LoaderArgs) {
  const { body, setCookie } = await getViewer(request)
  if (!body.data?.viewer) {
    return redirect('/login', { headers: responseHeaders(setCookie) })
  }

  return data(
    { viewer: body.data.viewer },
    { headers: responseHeaders(setCookie) },
  )
}

export default function AuthenticatedLayout({
  loaderData,
}: Route.ComponentProps) {
  const matches = useMatches()
  const pageTitle = matches.reduce<string | undefined>((title, match) => {
    const handle = match.handle as { pageTitle?: string } | undefined
    return handle?.pageTitle ?? title
  }, undefined)

  return (
    <div className="min-h-screen bg-stone-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <div>
            <p className="text-xs tracking-[0.13em] text-slate-400 uppercase">
              Blog administration
            </p>
            <div className="mt-1 flex items-center gap-2 font-heading text-xl font-semibold tracking-[-0.03em]">
              {pageTitle === 'Home' ? (
                <span>Home</span>
              ) : (
                <>
                  <Link
                    className="text-slate-500 transition hover:text-slate-950"
                    to="/"
                  >
                    Home
                  </Link>
                  <span className="text-slate-300">/</span>
                  <span>{pageTitle}</span>
                </>
              )}
            </div>
          </div>
          <details className="group relative">
            <summary className="list-none cursor-pointer text-right marker:content-none">
              <p className="text-sm font-medium text-slate-800">
                {loaderData.viewer.displayName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {loaderData.viewer.email}
              </p>
            </summary>
            <div className="absolute top-full right-0 z-10 mt-3 w-44 border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10">
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  Sign out
                </button>
              </Form>
            </div>
          </details>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
