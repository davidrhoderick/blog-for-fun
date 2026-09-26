import {
  index,
  layout,
  type RouteConfig,
  route,
} from '@react-router/dev/routes'

export default [
  route('api/graphql', 'routes/api.graphql.ts'),
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.tsx'),
  layout('routes/authenticated-layout.tsx', [
    index('routes/home.tsx'),
    route('posts', 'routes/posts.tsx'),
    route('posts/:id', 'routes/post.tsx'),
  ]),
] satisfies RouteConfig
