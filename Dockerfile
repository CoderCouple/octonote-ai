# NestJS API image for Railway. Installs from the pnpm workspace root and
# builds only @octonote/shared, @octonote/content + @octonote/api (the web app deploys to Vercel).

# Official Node image via AWS ECR Public: same image as Docker Hub, without its pull rate limits.
FROM public.ecr.aws/docker/library/node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
COPY packages/content/package.json packages/content/
# Workspace dependency of api/content; only its package.json is needed to install (nothing imports it at runtime).
COPY packages/octodraw/package.json packages/octodraw/
RUN NODE_ENV=development pnpm install --frozen-lockfile --filter @octonote/api...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/content packages/content
COPY services/api services/api
RUN pnpm --filter @octonote/shared build && pnpm --filter @octonote/content build && pnpm --filter @octonote/api build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/content/package.json packages/content/
COPY --from=build /app/packages/content/server.js packages/content/
COPY --from=build /app/packages/content/dist packages/content/dist
COPY packages/octodraw/package.json packages/octodraw/
COPY --from=build /app/services/api/package.json services/api/
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/services/api/drizzle services/api/drizzle
RUN pnpm install --frozen-lockfile --prod --filter @octonote/api...
EXPOSE 4000
CMD ["pnpm", "--filter", "@octonote/api", "start"]
