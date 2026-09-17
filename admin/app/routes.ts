import {
  index,
  layout,
  type RouteConfig,
  route,
} from '@react-router/dev/routes'

export default [
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.tsx'),
  layout('routes/authenticated-layout.tsx', [index('routes/home.tsx')]),
] satisfies RouteConfig
