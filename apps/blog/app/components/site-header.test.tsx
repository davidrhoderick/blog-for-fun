import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import { SiteHeader } from './site-header'

test('links home, contact, and the theme toggle', {
  tags: ['integration'],
}, () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )

  render(
    <MemoryRouter>
      <SiteHeader />
    </MemoryRouter>,
  )

  expect(
    screen.getByRole('link', { name: /Field Notes/ }).getAttribute('href'),
  ).toBe('/')
  expect(
    screen.getByRole('link', { name: 'Say hello' }).getAttribute('href'),
  ).toBe('mailto:hello@example.com')
  expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
    'Switch to dark mode',
  )

  vi.unstubAllGlobals()
})
