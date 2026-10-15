FROM node:24-alpine AS dependencies

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/blog/package.json apps/blog/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/graphql-runtime/package.json packages/graphql-runtime/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .

RUN pnpm --filter server run dev:codegen
RUN pnpm --filter blog run build
RUN pnpm --filter admin run build

FROM node:24-alpine AS runtime

RUN apk add --no-cache caddy tini
RUN corepack enable

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app /app

# Production image: drop devDependencies (the build above needed them). The
# runtime keeps only prod deps, plus `tsx`, which the server and the Fly release
# command use to run TypeScript directly.
RUN pnpm install --prod --frozen-lockfile

EXPOSE 8080

ENTRYPOINT ["tini", "--"]
CMD ["./node_modules/.bin/pm2-runtime", "start", "docker/ecosystem.config.cjs"]
