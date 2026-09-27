# syntax=docker/dockerfile:1
#
# Ronne web app (feature 005). Multi-stage: install → build → a slim runtime with Next.js's
# standalone server, the compiled setup/migrate/reset scripts and their two native modules.
# State (database file, storage, settings) lives in /app/data: mount a volume there.

# Node.js 24 LTS on Debian 13 (trixie), pinned by digest (docs/policies/dependencies.md §2).
# Written in FROM directly, not through an ARG, so Dependabot can update the digest.
FROM node:26-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

# ---- Install dependencies (with the supply-chain settings in pnpm-workspace.yaml) ----
FROM base AS deps
# Build tools, only for compiling better-sqlite3 when no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# pnpm itself, at the version in package.json's packageManager (Corepack can't start pnpm 12).
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/mcp/package.json packages/mcp/
COPY packages/repo-tools/package.json packages/repo-tools/
RUN pnpm install --frozen-lockfile

# ---- Build the standalone server and the scripts ----
FROM deps AS build
COPY . .
RUN NEXT_OUTPUT=standalone pnpm --filter @ronne/web build \
 && node docker/collect-native.mjs apps/web /native/node_modules

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    RONNE_ENV_FILE=/app/data/.env \
    RONNE_DATA_DIR=/app/data \
    RONNE_RUNTIME=docker
# Only what runs: the server and scripts use `node` alone, and the pnpm stand-in below calls node
# directly. The base image's npm, npx, corepack and Yarn 1 are removed, which also removes the
# vulnerabilities in npm's bundled dependencies that Trivy reports for the base image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/dist-scripts ./apps/web/dist-scripts
COPY --from=build --chown=node:node /native/node_modules ./apps/web/node_modules
COPY --chmod=755 docker/pnpm /usr/local/bin/pnpm
# ./data (the default SQLite path and storage in setup) points at the volume.
RUN mkdir -p /app/data && chown node:node /app/data \
 && ln -s /app/data /app/apps/web/data
VOLUME ["/app/data"]
USER node
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Checks the volume, applies pending migrations, then starts the server (scripts/start.ts).
CMD ["node", "dist-scripts/start.mjs"]
