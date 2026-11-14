# syntax=docker/dockerfile:1
FROM node:26.13.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26.13.0-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Nothing host-specific is built in (#210): the browser calls /graphql on the
# page's origin, and the server reads GRAPHQL_URL_INTERNAL / MEDIA_URL at
# runtime, so one image runs on any host and port.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26.13.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null || exit 1
CMD ["node", "server.js"]
