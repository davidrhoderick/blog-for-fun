import { data, Form, redirect, useNavigation } from 'react-router'
import { requireSameOrigin } from '~/lib/csrf.server'
import {
  getViewer,
  requestGraphQL,
  responseHeaders,
  type Viewer,
} from '~/lib/graphql.server'
import type { Route } from './+types/login'

export const meta = () => [{ title: 'Sign in | Blog administration' }]

export async function loader({ request }: Route.LoaderArgs) {
  const { body, setCookie } = await getViewer(request)
  if (body.data?.viewer) {
    return redirect('/', { headers: responseHeaders(setCookie) })
  }

  return data(null, { headers: responseHeaders(setCookie) })
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request)
  const formData = await request.formData()
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return data({ error: 'Enter your email and password.' }, { status: 400 })
  }

  const { body, setCookie } = await requestGraphQL<{ login: Viewer }>(
    request,
    `mutation Login($input: LoginInput!) {
      login(input: $input) { id email displayName roles }
    }`,
    { input: { email, password } },
  )

  if (!body.data?.login) {
    return data(
      { error: 'The email or password is incorrect.' },
      { status: 400, headers: responseHeaders(setCookie) },
    )
  }

  return redirect('/', { headers: responseHeaders(setCookie) })
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#071316] text-stone-100 lg:grid-cols-[minmax(0,1.15fr)_minmax(28rem,0.85fr)]">
      <section className="relative hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(53,151,165,0.2),transparent_36%),linear-gradient(145deg,transparent_35%,rgba(255,255,255,0.035)_35%,rgba(255,255,255,0.035)_36%,transparent_36%)] bg-[length:auto,42px_42px]" />
        <p className="relative font-heading text-sm font-semibold tracking-[0.24em] text-cyan-200 uppercase">
          Editorial console
        </p>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-xs tracking-[0.2em] text-stone-400 uppercase">
            Private workspace
          </p>
          <h1 className="font-heading text-6xl leading-[0.98] font-semibold tracking-[-0.05em]">
            Write deliberately. Publish confidently.
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-stone-400">
            Draft, revise, and maintain the archive from one focused workspace.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="mb-12 font-heading text-sm font-semibold tracking-[0.2em] text-cyan-200 uppercase lg:hidden">
            Editorial console
          </p>
          <p className="text-xs tracking-[0.18em] text-stone-500 uppercase">
            Authorized access only
          </p>
          <h2 className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em]">
            Sign in
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            Use the administrator account provisioned for this site.
          </p>

          <Form method="post" className="mt-10 space-y-6">
            <label className="block">
              <span className="mb-2 block text-xs font-medium tracking-[0.12em] text-stone-300 uppercase">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                className="h-12 w-full border border-white/15 bg-white/[0.035] px-4 text-base text-white outline-none transition focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium tracking-[0.12em] text-stone-300 uppercase">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-12 w-full border border-white/15 bg-white/[0.035] px-4 text-base text-white outline-none transition focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15"
              />
            </label>

            {actionData?.error ? (
              <p
                role="alert"
                className="border-l-2 border-red-400 bg-red-400/10 px-4 py-3 text-sm text-red-100"
              >
                {actionData.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full bg-cyan-200 px-5 text-sm font-semibold tracking-[0.08em] text-[#071316] uppercase transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in...' : 'Enter workspace'}
            </button>
          </Form>
        </div>
      </section>
    </main>
  )
}
