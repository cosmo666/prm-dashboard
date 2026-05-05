# Phase 0 production image: multi-stage Node 12 builder + nginx runtime.
# Independent of Dockerfile.dev (the local dev container used to run npm/ng/test);
# this is what `docker compose up frontend` actually serves.
# Base images are pinned to sha256 digests to match the 2026-04-23 architecture
# decision (reproducible builds — tag-only refs are mutable).

# === Builder ===
FROM node:12.22.12-alpine@sha256:d4b15b3d48f42059a15bd659be60afe21762aae9d6cbea6f124440895c27db68 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -- --configuration production

# === Runtime ===
FROM nginx:alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS runtime
COPY --from=build /app/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
