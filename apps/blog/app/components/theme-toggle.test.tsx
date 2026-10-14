import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ThemeToggle } from './theme-toggle'

const stubMatchMedia = (dark: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

test('restores the stored theme and toggles it', {
  tags: ['integration'],
}, () => {
  stubMatchMedia(false)
  window.localStorage.setItem('theme', 'dark')

  render(<ThemeToggle />)

  expect(document.documentElement.dataset.theme).toBe('dark')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))

  expect(document.documentElement.dataset.theme).toBe('light')
  expect(window.localStorage.getItem('theme')).toBe('light')
})

test('falls back to the system colour scheme', { tags: ['unit'] }, () => {
  stubMatchMedia(true)

  render(<ThemeToggle />)

  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.getByRole('button').textContent).toBe('Light')
})
