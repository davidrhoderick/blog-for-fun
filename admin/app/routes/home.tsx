import { Welcome } from '../welcome/welcome'
import type { Route } from './+types/home'

export const meta = (_args: Route.MetaArgs) => [
  { title: 'New React Router App' },
  { name: 'description', content: 'Welcome to React Router!' },
]

export default function Home() {
  return <Welcome />
}
