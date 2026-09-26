import { Link } from 'react-router'
import type { Route } from './+types/home'

export const meta = (_args: Route.MetaArgs) => [
  { title: 'Home | Blog administration' },
]

export const handle = { pageTitle: 'Home' }

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link
        to="/posts"
        className="block border border-slate-200 bg-white px-5 py-4 font-heading text-lg font-semibold transition hover:border-slate-400"
      >
        Posts
      </Link>
    </main>
  )
}
