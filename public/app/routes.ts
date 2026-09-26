import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('posts/:slug', 'routes/post.tsx'),
] satisfies RouteConfig
