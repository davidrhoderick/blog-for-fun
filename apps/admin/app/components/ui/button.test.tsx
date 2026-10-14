import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Button } from './button'

test('renders a themed button and merges custom classes', {
  tags: ['integration'],
}, () => {
  render(
    <Button className="extra-class" size="lg" variant="outline">
      Save
    </Button>,
  )

  const button = screen.getByRole('button', { name: 'Save' })
  expect(button.getAttribute('data-slot')).toBe('button')
  expect(button.className).toContain('extra-class')
  expect(button.className).toContain('h-9')
  expect(button.className).toContain('border-border')
})

test('defaults to the primary variant', { tags: ['unit'] }, () => {
  render(<Button>Default</Button>)

  expect(screen.getByRole('button').className).toContain('bg-primary')
})
