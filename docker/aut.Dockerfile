# syntax=docker/dockerfile:1
#
# QA packaging of the application under test.
#
# The `deps` and `build` stages are byte-for-byte the same as the upstream
# application-under-test/Dockerfile (so the AUT binary is identical and layer
# cache is shared). The upstream runner stage re-runs `prisma generate`,
# `npm prune` and a recursive `chown` over node_modules, which takes a very
# long time on Docker Desktop file systems. For an ephemeral test
# environment we run the built output directly as the unprivileged `node` user.
# The upstream Dockerfile is kept unmodified for reference.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM build AS runner
ENV NODE_ENV=production
USER node
EXPOSE 3000
# Same start-up sequence as upstream: migrate, seed demo data, start the API.
# WORKAROUND for BUG-007 (docs/bug-reports/BUG-007-container-entrypoint-missing.md):
# `nest build` emits dist/src/main.js (prisma/seed.ts widens the TypeScript root),
# but the upstream CMD starts dist/main.js, so the upstream image exits on start.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/src/main.js"]
