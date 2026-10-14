import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import type { Route } from './+types/home'
import Home, { handle, meta } from './home'

test('links to the post list', { tags: ['integration'] }, () => {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )

  expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('href')).toBe(
    '/posts',
  )
})

test('titles the console home page', { tags: ['unit'] }, () => {
  expect(meta({} as Route.MetaArgs)).toEqual([
    { title: 'Home | Blog administration' },
  ])
  expect(handle).toEqual({ pageTitle: 'Home' })
})
