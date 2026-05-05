# Phase 0 production image: multi-stage Node 12 builder + nginx runtime.
# Independent of Dockerfile.dev (the local dev container used to run npm/ng/test);
# this is what `docker compose up frontend` actually serves.
# TODO: pin both base images to sha256 digests later (matches the rest of the
# repo's Dockerfiles per the 2026-04-23 architecture decision).

# === Builder ===
FROM node:12.22.12-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -- --configuration production

# === Runtime ===
FROM nginx:alpine AS runtime
COPY --from=build /app/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
