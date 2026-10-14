import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PostDate } from './post-date'

test('formats a published timestamp as a UTC date', {
  tags: ['integration'],
}, () => {
  render(<PostDate value="2026-01-02T23:30:00.000Z" />)

  const time = screen.getByText('Jan 2, 2026')
  expect(time.tagName).toBe('TIME')
  expect(time.getAttribute('datetime')).toBe('2026-01-02T23:30:00.000Z')
})
