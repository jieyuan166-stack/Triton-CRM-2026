FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate && pnpm prisma generate && pnpm build && pnpm prune --prod

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl sqlite su-exec
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
RUN mkdir -p /app/backups /app/prisma/data /app/uploads /app/disaster-recovery/requests && chown -R nextjs:nodejs /app/backups /app/prisma/data /app/uploads /app/disaster-recovery/requests

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod 755 /app/docker/entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Synology ACLs can mask shared-group permissions on bind mounts. Run the CRM
# with the NAS service account's numeric identity (uid 1000, gid 10), the same
# identity used by the host-side recovery worker. The process remains non-root
# in the container and has access only to the explicitly mounted directories.
CMD ["sh", "-c", "chown -R 1000:10 /app/backups /app/prisma/data && chmod -R u+rwX,g+rwX /app/backups /app/prisma/data && su-exec 1000:10 /app/docker/entrypoint.sh"]
