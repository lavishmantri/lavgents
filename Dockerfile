# Stage 1: Build
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN ./node_modules/.bin/mastra build --studio

# Stage 2: Production
FROM node:22-alpine AS production
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copy build output into a subdirectory so that the relative DB path
# (../data/mastra.db) resolves correctly to /app/data/mastra.db
COPY --from=build /app/.mastra/output ./output/
RUN cd output && npm ci --omit=dev
RUN apk del python3 make g++

# /app/data is bind-mounted from host for persistent SQLite storage
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mastra -u 1001 && \
    chown -R mastra:nodejs /app
USER mastra

ENV NODE_ENV=production
ENV MASTRA_HOST=0.0.0.0
ENV MASTRA_STUDIO_PATH=studio

EXPOSE 4111

WORKDIR /app/output
CMD ["node", "index.mjs"]
