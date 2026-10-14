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

EXPOSE 8080

ENTRYPOINT ["tini", "--"]
CMD ["./node_modules/.bin/pm2-runtime", "start", "docker/ecosystem.config.cjs"]
