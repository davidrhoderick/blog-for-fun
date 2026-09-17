import { data, Form, Outlet, redirect } from 'react-router'
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
  return (
    <div className="min-h-screen bg-stone-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-heading text-lg font-semibold tracking-[-0.03em]">
              Editorial
            </span>
            <span className="text-xs tracking-[0.13em] text-slate-400 uppercase">
              Blog administration
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {loaderData.viewer.displayName}
            </span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="border border-slate-300 px-3 py-1.5 text-xs font-semibold tracking-[0.08em] uppercase transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
              >
                Sign out
              </button>
            </Form>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
