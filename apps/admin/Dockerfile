# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/admin/package.json ./apps/admin/package.json
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
COPY --from=deps /repo ./
COPY . .
# NEXT_PUBLIC_API_URL is inlined into the client bundle at BUILD time. Bake the
# prod API origin here (overridable via --build-arg) so admin calls
# api.swistrade.com, not the localhost fallback in the app code.
ARG NEXT_PUBLIC_API_URL=https://api.swistrade.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @lp/types --filter @lp/constants --filter @lp/utils \
        --filter @lp/validators --filter @lp/sdk build && \
    NEXT_OUTPUT=standalone pnpm --filter @lp/admin build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=app:app /repo/apps/admin/public ./apps/admin/public
USER app
EXPOSE 3002
CMD ["node", "apps/admin/server.js"]
