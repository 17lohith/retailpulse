# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN addgroup -S rp && adduser -S rp -G rp && mkdir -p /tmp/retailpulse-uploads && chown rp:rp /tmp/retailpulse-uploads
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
USER rp
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "src/server.js"]
