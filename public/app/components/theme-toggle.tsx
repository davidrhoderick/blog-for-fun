import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('theme')
    const darkTheme =
      savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)

    setDark(darkTheme)
    document.documentElement.dataset.theme = darkTheme ? 'dark' : 'light'
  }, [])

  const toggleTheme = () => {
    const nextTheme = !dark
    setDark(nextTheme)
    document.documentElement.dataset.theme = nextTheme ? 'dark' : 'light'
    window.localStorage.setItem('theme', nextTheme ? 'dark' : 'light')
  }

  return (
    <button
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className="theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true">{dark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
