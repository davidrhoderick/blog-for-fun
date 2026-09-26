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
    <main className="flex min-h-screen items-center justify-center bg-[#071316] px-5 py-12 text-stone-100">
      <section className="w-full max-w-md border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/20 sm:p-10">
        <div>
          <p className="font-heading text-sm font-semibold tracking-[0.18em] text-cyan-200 uppercase">
            Editorial console
          </p>
          <p className="mt-10 text-xs tracking-[0.16em] text-stone-500 uppercase">
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
                className="h-12 w-full border border-white/15 bg-black/15 px-4 text-base text-white outline-none transition focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15"
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
                className="h-12 w-full border border-white/15 bg-black/15 px-4 text-base text-white outline-none transition focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15"
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
