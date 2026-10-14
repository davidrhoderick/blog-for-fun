import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ErrorBoundary, links } from './root'

const routeError = (status: number, statusText: string) => ({
  status,
  statusText,
  internal: false,
  data: null,
})

test('renders a 404 message for missing routes', {
  tags: ['integration'],
}, () => {
  render(<ErrorBoundary error={routeError(404, 'Not Found')} params={{}} />)

  expect(screen.getByRole('heading').textContent).toBe('404')
  expect(
    screen.getByText('The requested page could not be found.'),
  ).toBeTruthy()
})

test('shows route status text for other route errors', {
  tags: ['unit'],
}, () => {
  render(
    <ErrorBoundary error={routeError(500, 'Server exploded')} params={{}} />,
  )

  expect(screen.getByRole('heading').textContent).toBe('Error')
  expect(screen.getByText('Server exploded')).toBeTruthy()
})

test('falls back for route errors without status text', {
  tags: ['unit'],
}, () => {
  render(<ErrorBoundary error={routeError(500, '')} params={{}} />)

  expect(screen.getByText('An unexpected error occurred.')).toBeTruthy()
})

test('shows the stack for application errors', { tags: ['unit'] }, () => {
  render(<ErrorBoundary error={new Error('boom')} params={{}} />)

  expect(screen.getByText('boom')).toBeTruthy()
  expect(screen.getByText(/Error: boom/)).toBeTruthy()
})

test('falls back for unknown error values', { tags: ['unit'] }, () => {
  render(<ErrorBoundary error="not an error" params={{}} />)

  expect(screen.getByText('An unexpected error occurred.')).toBeTruthy()
})

test('preloads the console fonts', { tags: ['unit'] }, () => {
  expect(links()).toHaveLength(3)
  expect(links()[0]).toMatchObject({ rel: 'preconnect' })
})
