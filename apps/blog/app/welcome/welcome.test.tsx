import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Welcome } from './welcome'

test('renders the starter links', { tags: ['integration'] }, () => {
  render(<Welcome />)

  expect(
    screen
      .getByRole('link', { name: /React Router Docs/ })
      .getAttribute('href'),
  ).toBe('https://reactrouter.com/docs')
  expect(
    screen.getByRole('link', { name: /Join Discord/ }).getAttribute('href'),
  ).toBe('https://rmx.as/discord')
})
