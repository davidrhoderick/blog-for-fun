import { expect, test } from 'vitest'
import routes from './routes'

test('exposes the index and post routes', { tags: ['unit'] }, () => {
  expect(routes).toMatchObject([
    { index: true, file: 'routes/home.tsx' },
    { path: 'posts/:slug', file: 'routes/post.tsx' },
  ])
})
