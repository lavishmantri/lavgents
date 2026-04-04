# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN ./node_modules/.bin/mastra build

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app

# Copy build output into a subdirectory so that the relative DB path
# (../data/mastra.db) resolves correctly to /app/data/mastra.db
COPY --from=build /app/.mastra/output ./output/
RUN cd output && npm install --omit=dev

# /app/data is bind-mounted from host for persistent SQLite storage
RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 4111

WORKDIR /app/output
CMD ["node", "index.mjs"]
