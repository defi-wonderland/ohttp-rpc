# OHTTP Gateway Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM oven/bun:1.1.38-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package files for workspace
COPY package.json bun.lock ./
COPY packages/ ./packages/
COPY tsconfig.base.json ./

# Copy gateway package
COPY apps/gateway/package.json ./apps/gateway/

# Install dependencies from root
RUN bun install

# Copy gateway source code
COPY apps/gateway/ ./apps/gateway/

# Set working directory to gateway
WORKDIR /app/apps/gateway

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1.1.38-alpine AS production

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    addgroup -g 1001 -S ohttp && \
    adduser -S ohttp -u 1001 -G ohttp

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=ohttp:ohttp /app/apps/gateway/dist ./dist
COPY --from=builder --chown=ohttp:ohttp /app/apps/gateway/package.json ./

# Copy workspace dependencies
COPY --from=builder --chown=ohttp:ohttp /app/node_modules ./node_modules
COPY --from=builder --chown=ohttp:ohttp /app/packages ./packages

# Create directories for configuration and logs
RUN mkdir -p /app/config /app/logs && \
    chown -R ohttp:ohttp /app

# Switch to non-root user
USER ohttp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.GATEWAY_PORT || 8788) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Expose port (default 8788)
EXPOSE 8788

# Set production environment
ENV NODE_ENV=production

# Start the application
CMD ["bun", "dist/index.js"]
