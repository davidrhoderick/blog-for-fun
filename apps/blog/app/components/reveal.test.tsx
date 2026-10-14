import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Reveal } from './reveal'

const stubMatchMedia = (reduceMotion: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('animates its content in', { tags: ['integration'] }, () => {
  stubMatchMedia(false)

  render(<Reveal delay={0.1}>Dispatches</Reveal>)

  expect(screen.getByText('Dispatches')).toBeTruthy()
})

test('skips the animation when motion is reduced', { tags: ['unit'] }, () => {
  stubMatchMedia(true)

  render(<Reveal>Still content</Reveal>)

  expect(screen.getByText('Still content')).toBeTruthy()
})
