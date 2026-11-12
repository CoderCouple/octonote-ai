# NestJS API image for Railway. Installs from the pnpm workspace root and
# builds only what the API runs (the web app deploys to Vercel): @octonote/shared,
# @octonote/content, the AI libraries (@octonote/compose with widgets,
# interactive and motion it validates against; @octonote/manim for videos)
# and @octonote/api.

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
COPY packages/compose/package.json packages/compose/
COPY packages/widgets/package.json packages/widgets/
COPY packages/interactive/package.json packages/interactive/
COPY packages/motion/package.json packages/motion/
COPY packages/manim/package.json packages/manim/
# Workspace dependency of api/content; only its package.json is needed to install (nothing imports it at runtime).
COPY packages/octodraw/package.json packages/octodraw/
RUN NODE_ENV=development pnpm install --frozen-lockfile --filter @octonote/api...

FROM base AS build
WORKDIR /app
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/content packages/content
COPY packages/compose packages/compose
COPY packages/widgets packages/widgets
COPY packages/interactive packages/interactive
COPY packages/motion packages/motion
COPY packages/manim packages/manim
COPY services/api services/api
RUN pnpm --filter @octonote/shared build && pnpm --filter @octonote/content build \
 && pnpm --filter @octonote/widgets build && pnpm --filter @octonote/interactive build && pnpm --filter @octonote/motion build \
 && pnpm --filter @octonote/compose build && pnpm --filter @octonote/manim build \
 && pnpm --filter @octonote/api build

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
# The AI libraries: built code plus the files their package.json exports (examples, styles).
COPY --from=build /app/packages/compose/package.json packages/compose/
COPY --from=build /app/packages/compose/dist packages/compose/dist
COPY --from=build /app/packages/widgets/package.json packages/widgets/
COPY --from=build /app/packages/widgets/dist packages/widgets/dist
COPY --from=build /app/packages/widgets/examples packages/widgets/examples
COPY --from=build /app/packages/interactive/package.json packages/interactive/
COPY --from=build /app/packages/interactive/dist packages/interactive/dist
COPY --from=build /app/packages/interactive/examples packages/interactive/examples
COPY --from=build /app/packages/motion/package.json packages/motion/
COPY --from=build /app/packages/motion/dist packages/motion/dist
COPY --from=build /app/packages/motion/examples packages/motion/examples
COPY --from=build /app/packages/manim/package.json packages/manim/
COPY --from=build /app/packages/manim/dist packages/manim/dist
COPY --from=build /app/services/api/package.json services/api/
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/services/api/drizzle services/api/drizzle
# The AI libraries import React as a peer; pnpm's strict layout wouldn't let them
# see the API's copy, so hoist it to the root node_modules where Node finds it.
RUN printf 'public-hoist-pattern[]=react\npublic-hoist-pattern[]=react-dom\npublic-hoist-pattern[]=scheduler\n' >> .npmrc \
 && pnpm install --frozen-lockfile --prod --filter @octonote/api...
EXPOSE 4000
CMD ["pnpm", "--filter", "@octonote/api", "start"]
