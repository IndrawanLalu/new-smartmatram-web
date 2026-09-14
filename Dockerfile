# ===== SMART-Mataram — Web (Next.js 16, standalone) =====
# Build: butuh NEXT_PUBLIC_* sebagai ARG (di-bake saat build).

# ---- deps: install semua dependency (pnpm 9, lockfile v9) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder: build Next.js standalone ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* wajib ada saat build (di-inline ke bundle client)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WA_GROUP_REALISASI
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WA_GROUP_REALISASI=$NEXT_PUBLIC_WA_GROUP_REALISASI \
    NEXT_TELEMETRY_DISABLED=1

# Placeholder khusus BUILD: Next 16 mengevaluasi modul route API saat "collect
# page data", dan sebagian route membuat Supabase service-role client di module
# scope (butuh key non-kosong). Ini TIDAK ter-bake ke runtime (stage runner FROM
# baru, hanya COPY artefak) — saat jalan, nilai asli dari .env (env_file) dipakai.
ENV SUPABASE_SERVICE_ROLE_KEY=build-time-placeholder-not-used-at-runtime

RUN pnpm build

# ---- runner: image ramping, cuma output standalone ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
