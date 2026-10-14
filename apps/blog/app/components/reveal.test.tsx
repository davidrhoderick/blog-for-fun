import { render, screen } from '@testing-library/react'
import { gsap } from 'gsap'
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('animates its content in', { tags: ['integration'] }, () => {
  stubMatchMedia(false)
  const animate = vi.spyOn(gsap, 'from')

  render(<Reveal delay={0.1}>Dispatches</Reveal>)

  expect(screen.getByText('Dispatches')).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(1)
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ autoAlpha: 0, delay: 0.1 })
})

test('skips the animation when motion is reduced', { tags: ['unit'] }, () => {
  stubMatchMedia(true)
  const animate = vi.spyOn(gsap, 'from')

  render(<Reveal>Still content</Reveal>)

  expect(screen.getByText('Still content')).toBeTruthy()
  expect(animate).not.toHaveBeenCalled()
})
