# syntax=docker/dockerfile:1.7
# ---------- deps ----------
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/constants/package.json ./packages/constants/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/validators/package.json ./packages/validators/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/config/eslint-config/package.json ./packages/config/eslint-config/package.json
COPY packages/config/prettier-config/package.json ./packages/config/prettier-config/package.json
COPY packages/config/tsconfig/package.json ./packages/config/tsconfig/package.json

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build ----------
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

# Copy the entire installed tree from the deps stage — that includes the
# per-workspace node_modules folders where pnpm puts symlinks like
# `packages/types/node_modules/@lp/tsconfig` -> `packages/config/tsconfig`.
# Without these, tsc in any workspace can't resolve `@lp/tsconfig/base.json`
# and the build dies with TS6053.
COPY --from=deps /repo .
# Overlay the actual source (src/, tsconfig.json, etc.) — package.json files
# get overwritten with identical copies from the source tree.
COPY . .

RUN pnpm --filter @lp/types --filter @lp/constants --filter @lp/utils \
        --filter @lp/validators --filter @lp/sdk build && \
    pnpm --filter @lp/api build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /repo/apps/api/dist ./dist
COPY --from=build --chown=app:app /repo/apps/api/package.json ./package.json
COPY --from=build --chown=app:app /repo/node_modules ./node_modules

USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
