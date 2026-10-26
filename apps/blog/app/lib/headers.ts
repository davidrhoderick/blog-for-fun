import type { HeadersFunction } from 'react-router'

/** Default Cache-Control for public blog pages. */
export const DEFAULT_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'

/**
 * Default headers for a public blog route. Pass overrides to deviate from the
 * default cache policy; overrides are spread over the defaults.
 */
export const blogHeaders =
  (overrides: Record<string, string> = {}): HeadersFunction =>
  () => ({ 'cache-control': DEFAULT_CACHE_CONTROL, ...overrides })
