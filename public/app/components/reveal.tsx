import { gsap } from 'gsap'
import { useEffect, useRef } from 'react'

export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      gsap.from(element.current, {
        autoAlpha: 0,
        delay,
        duration: 0.7,
        ease: 'power3.out',
        y: 24,
      })
    }, element)

    return () => context.revert()
  }, [delay])

  return <div ref={element}>{children}</div>
}
