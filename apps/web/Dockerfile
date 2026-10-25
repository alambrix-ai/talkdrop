# Talkdrop web — Vite SPA + public/brand static assets (nginx)
# Build from repo root:
#   docker build -f apps/web/Dockerfile -t talkdrop/web:0.1.0 .
# Or:
#   docker compose -f infra/docker-compose.yml -f infra/docker-compose.app.yml build web

FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

# Install web + workspace deps (shared/ui). Other apps' package.json exist so the lockfile resolves.
RUN pnpm install --frozen-lockfile --filter @talkdrop/web...

# Sources — public/brand/portraits/*.jpg must be present for Vite publicDir copy
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/web apps/web

RUN test -f apps/web/public/brand/portraits/mei.jpg \
  && test -f apps/web/public/brand/portraits/tomas.jpg \
  && test -f apps/web/public/brand/logo-mark.svg

RUN pnpm --filter @talkdrop/shared build \
  && pnpm --filter @talkdrop/ui build \
  && pnpm --filter @talkdrop/web build

# Fail the image build if Vite did not emit brand portraits into dist
RUN test -f apps/web/dist/brand/portraits/mei.jpg \
  && test -f apps/web/dist/brand/portraits/tomas.jpg \
  && test -f apps/web/dist/brand/app-icon.png \
  && ls -la apps/web/dist/brand/portraits/

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Runtime assert: static root contains portraits
RUN test -f /usr/share/nginx/html/brand/portraits/mei.jpg \
  && test -f /usr/share/nginx/html/brand/portraits/tomas.jpg

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/brand/portraits/mei.jpg || exit 1

CMD ["nginx", "-g", "daemon off;"]
