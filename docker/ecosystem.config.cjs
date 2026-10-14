module.exports = {
  apps: [
    {
      name: 'caddy',
      script: '/usr/sbin/caddy',
      args: 'run --config /app/docker/Caddyfile --adapter caddyfile',
      interpreter: 'none',
    },
    {
      name: 'graphql',
      script: './node_modules/.bin/tsx',
      args: 'src/server.ts',
      cwd: '/app/apps/server',
      interpreter: 'none',
      env: {
        HOST: '127.0.0.1',
        PORT: '4000',
      },
    },
    {
      name: 'blog',
      script: './node_modules/.bin/react-router-serve',
      args: './build/server/index.js',
      cwd: '/app/apps/blog',
      interpreter: 'none',
      env: {
        GRAPHQL_URL: 'http://127.0.0.1:4000/graphql',
        PORT: '3000',
      },
    },
    {
      name: 'admin',
      script: './node_modules/.bin/react-router-serve',
      args: './build/server/index.js',
      cwd: '/app/apps/admin',
      interpreter: 'none',
      env: {
        GRAPHQL_URL: 'http://127.0.0.1:4000/graphql',
        PORT: '3001',
      },
    },
  ],
}
