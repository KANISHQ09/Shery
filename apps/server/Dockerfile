# SheryAI backend image.
# Build from the REPOSITORY ROOT (the npm workspace lockfile lives there):
#   docker build -f apps/server/Dockerfile -t sheryai-server .
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Workspace manifests + root lockfile first (layer cache). npm ci needs every workspace's
# package.json to validate the lockfile, even though only the server is installed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY packages/shared-types/package.json packages/shared-types/

# Production dependencies for the server workspace only
RUN npm ci --omit=dev --workspace=sheryai-backend --include-workspace-root=false --no-audit --no-fund

# Server source
COPY apps/server/server.js apps/server/
COPY apps/server/src apps/server/src

# Writable dir for STORAGE_PROVIDER=local (cloud storage is recommended in production)
RUN mkdir -p apps/server/uploads/videos

# Non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser \
  && chown -R appuser:appgroup /app
USER appuser

WORKDIR /app/apps/server

# Most hosts inject PORT; this is only the fallback
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
