# NestJS API image for Railway. Installs from the pnpm workspace root and
# builds only @octonote/shared + @octonote/api (the web app deploys to Vercel).

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
RUN NODE_ENV=development pnpm install --frozen-lockfile --filter @octonote/api...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api
RUN pnpm --filter @octonote/shared build && pnpm --filter @octonote/api build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/api/package.json services/api/
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/services/api/drizzle services/api/drizzle
RUN pnpm install --frozen-lockfile --prod --filter @octonote/api...
EXPOSE 4000
CMD ["pnpm", "--filter", "@octonote/api", "start"]
