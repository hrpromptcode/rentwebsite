# Multi-stage build for the storefront app. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t rentweb-web .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
COPY tooling/package.json tooling/
RUN find packages tooling -type f ! -name package.json -delete 2>/dev/null; true
RUN pnpm install --frozen-lockfile --filter @rentweb/web...

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter @rentweb/web... \
 && DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @rentweb/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
