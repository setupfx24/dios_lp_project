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
COPY packages/config/eslint-config/package.json ./packages/config/eslint-config/package.json
COPY packages/config/prettier-config/package.json ./packages/config/prettier-config/package.json
COPY packages/config/tsconfig/package.json ./packages/config/tsconfig/package.json
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm --filter @lp/types --filter @lp/constants --filter @lp/utils \
        --filter @lp/validators --filter @lp/sdk build && \
    pnpm --filter @lp/workers build

FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/workers/dist ./dist
COPY --from=build --chown=app:app /repo/apps/workers/package.json ./package.json
COPY --from=build --chown=app:app /repo/node_modules ./node_modules
USER app
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
