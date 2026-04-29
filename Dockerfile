# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY frontend/ ./
RUN npm run build

# Stage 2: Run Backend
FROM node:18-alpine
WORKDIR /app

# Install build dependencies for native modules (sqlite3, sharp) and timezone
RUN apk add --no-cache python3 make g++ tzdata
ENV TZ=Asia/Seoul

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --production --prefer-offline --no-audit

# Copy backend source
COPY backend/ ./

# Copy built frontend from previous stage
COPY --from=frontend-builder /build/frontend/dist ./public

# Create data directory for persistence
RUN mkdir -p data/originals data/thumbnails

EXPOSE 8081

ENV NODE_ENV=production
ENV PORT=8081
ENV DATABASE=/app/data/photo_feed.sqlite3

CMD ["node", "index.js"]
