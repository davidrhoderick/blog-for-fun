import { expect, test } from 'vitest'
import routes from './routes'

test('wires the public, login, and authenticated routes', {
  tags: ['integration'],
}, () => {
  expect(routes).toHaveLength(4)
  expect(routes[0]).toMatchObject({
    path: 'api/graphql',
    file: 'routes/api.graphql.ts',
  })
  expect(routes[1]).toMatchObject({ path: 'login', file: 'routes/login.tsx' })
  expect(routes[2]).toMatchObject({ path: 'logout', file: 'routes/logout.tsx' })
  expect(routes[3]).toMatchObject({
    file: 'routes/authenticated-layout.tsx',
    children: [
      { index: true, file: 'routes/home.tsx' },
      { path: 'posts', file: 'routes/posts.tsx' },
      { path: 'posts/:id', file: 'routes/post.tsx' },
    ],
  })
})
