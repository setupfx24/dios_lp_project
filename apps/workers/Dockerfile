# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/workers/package.json ./apps/workers/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/constants/package.json ./packages/constants/package.json
COPY packages/validators/package.json ./packages/validators/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/config/eslint-config/package.json ./packages/config/eslint-config/package.json
COPY packages/config/prettier-config/package.json ./packages/config/prettier-config/package.json
COPY packages/config/tsconfig/package.json ./packages/config/tsconfig/package.json
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo ./
COPY . .
RUN pnpm --filter @lp/types --filter @lp/constants --filter @lp/utils \
        --filter @lp/core --filter @lp/validators --filter @lp/sdk build && \
    pnpm --filter @lp/workers build

FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
# Full built workspace so pnpm symlinks + packages/*/dist resolve at runtime.
COPY --from=build /repo /repo
WORKDIR /repo/apps/workers
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
