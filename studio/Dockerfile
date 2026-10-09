# -----------------------------------------------------------------------------
# Node Builder Image
# -----------------------------------------------------------------------------
FROM node:20-alpine as builder

WORKDIR /app

# Install dependencies first (caching layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the project without blocking on repository-wide TS warnings/errors.
RUN npm run build:desktop

# -----------------------------------------------------------------------------
# Production Image (Nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Add custom Nginx configuration for React Router (SPA fallback)
RUN echo "server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
