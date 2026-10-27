# Multi-stage build for the NestJS API and worker (same image, different CMD).
# Build from the repo root:  docker build -f apps/api/Dockerfile -t job-copilot-api .
FROM node:20-bookworm-slim AS deps
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @copilot/api --workspace @copilot/shared --include-workspace-root

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @copilot/shared && npm run build -w @copilot/api && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1001 --create-home app
COPY --from=build --chown=app /repo/node_modules ./node_modules
COPY --from=build --chown=app /repo/packages/shared ./packages/shared
COPY --from=build --chown=app /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=app /repo/apps/api/package.json ./apps/api/package.json
USER app
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run migrations then start. For the worker service override CMD with: node dist/worker.js
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
