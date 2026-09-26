import { Link, NavLink } from 'react-router'
import { ThemeToggle } from './theme-toggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-mark" to="/">
        <span aria-hidden="true">*</span> Field Notes
      </Link>
      <nav aria-label="Primary navigation" className="site-nav">
        <NavLink to="/">Dispatches</NavLink>
        <a href="mailto:hello@example.com">Say hello</a>
        <ThemeToggle />
      </nav>
    </header>
  )
}
