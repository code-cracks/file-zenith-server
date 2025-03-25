# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm and wget
RUN apk add --no-cache curl wget && \
    curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v9.4.0/pnpm-linuxstatic-x64" -o /bin/pnpm && \
    chmod +x /bin/pnpm

COPY package*.json ./
# Install dependencies including devDependencies
RUN pnpm install

COPY . .
RUN pnpm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install pnpm and wget
RUN apk add --no-cache curl wget && \
    curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v9.4.0/pnpm-linuxstatic-x64" -o /bin/pnpm && \
    chmod +x /bin/pnpm

# Set environment variables
ENV HUSKY=0
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_OPTIONS="--trace-warnings"

COPY package*.json ./
# Install only production dependencies and skip postinstall scripts
RUN pnpm install --prod --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 8080

# Add a startup script
COPY <<'EOF' /start.sh
#!/bin/sh
set -e

echo "Starting NestJS application..."
node --trace-warnings dist/main.js 2>&1 | tee /app/server.log
EOF

RUN chmod +x /start.sh

CMD ["/start.sh"] 