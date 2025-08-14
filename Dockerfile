# Multi-stage build for optimal size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Build application
RUN npm run build

# Production image
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S vivadoc -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=vivadoc:nodejs /app/dist ./dist
COPY --from=builder --chown=vivadoc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=vivadoc:nodejs /app/package.json ./

# Create volume for project data
VOLUME ["/workspace"]

USER vivadoc

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/cli.js", "dev", "-r", "/workspace", "-p", "3001"]