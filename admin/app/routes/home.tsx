import type { Route } from './+types/home'

export const meta = (_args: Route.MetaArgs) => [
  { title: 'Editorial | Blog administration' },
  { name: 'description', content: 'Manage blog posts and revisions.' },
]

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-cyan-700 uppercase">
          Workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          Your editorial desk
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-600">
          Authentication is active. Post management will live here as the
          editorial interface is built out.
        </p>
      </div>
      <section className="mt-12 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-3">
        {[
          ['Posts', 'Create and maintain published writing.'],
          ['Revisions', 'Review the content history for every post.'],
          ['Access', 'Protected by server-enforced permissions.'],
        ].map(([title, description]) => (
          <div key={title} className="min-h-40 bg-white p-6">
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
