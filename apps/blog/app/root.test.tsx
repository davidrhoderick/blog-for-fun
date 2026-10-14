import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ErrorBoundary } from './root'

const routeError = (status: number, statusText = 'Not Found') => ({
  status,
  statusText,
  internal: false,
  data: null,
})

test('renders a 404 message for missing routes', {
  tags: ['integration'],
}, () => {
  render(<ErrorBoundary error={routeError(404)} params={{}} />)

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

test('shows the stack for application errors', { tags: ['unit'] }, () => {
  render(<ErrorBoundary error={new Error('boom')} params={{}} />)

  expect(screen.getByText('boom')).toBeTruthy()
  expect(screen.getByText(/Error: boom/)).toBeTruthy()
})
