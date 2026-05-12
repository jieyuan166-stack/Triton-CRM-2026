FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl sqlite
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
RUN mkdir -p /app/backups && chown -R nextjs:nodejs /app/backups

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
