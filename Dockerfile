# syntax=docker/dockerfile:1

# =============================================================================
# Obzorarr Docker Build
# Multi-stage build with Bun runtime for optimal image size
# =============================================================================

# Base stage - Alpine for smallest footprint
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Dependencies stage - production deps only
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Build stage - full install + build
FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Release stage - minimal runtime
FROM base AS release

# Create non-root user for security
RUN addgroup -S -g 1001 appgroup && \
    adduser -S -u 1001 -G appgroup appuser

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/build ./build

# Copy drizzle migrations for database setup
COPY --from=build /app/drizzle ./drizzle

# Create data directory for SQLite and set permissions
RUN mkdir -p data && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://localhost:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["bun", "./build"]
