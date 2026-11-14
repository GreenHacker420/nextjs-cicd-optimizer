---
name: nextjs-cicd-optimizer
description: Optimizes Next.js 16 & 15 CI/CD pipelines, Docker container builds, and deployment workflows to achieve under 90-second build and release cycles. Applies Turbopack disk caching, BuildKit cache mounts, GHCR registry layer caching, standalone output packaging, lightweight zero-node health checks, and swap-safe zero-downtime container rollouts.
---

# Next.js 16 & 15 CI/CD Speed & Docker Build Optimizer

A comprehensive agent guide and production standard for slashing Next.js 16 and 15 CI/CD build and deployment times from **6–10 minutes down to under 90 seconds** while ensuring 100% stability on resource-constrained host instances (1GB–2GB RAM / 1–2 vCPUs).

---

## 1. When to Activate This Skill

Activate this skill whenever:
- User asks to optimize, speed up, or troubleshoot slow Next.js 16/15 builds, Docker container creation, or GitHub Actions CI/CD workflows.
- Next.js Turbopack or Docker builds take longer than 2 minutes.
- GitHub Actions runners exceed job timeout limits or consume excessive build minutes.
- Production containers trigger false `unhealthy` healthcheck timeouts on low-CPU / low-RAM VMs (e.g. AWS EC2 t3/t4g, Oracle Cloud OCI micro/ampere instances).
- Deployments cause memory thrashing, high swap usage, or 502 Bad Gateway outages during container rollouts.

---

## 2. Core Optimization Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Next.js 16 Optimized CI/CD Pipeline                  │
└────────────────────────────────────────────────────────────────────────┘
                                     │
    ┌────────────────────────────────┼────────────────────────────────┐
    ▼                                ▼                                ▼
[1. Strict Context]          [2. Dual Layer Cache]         [3. BuildKit Mounts]
.dockerignore excludes:      GitHub Actions: type=gha      npm: /root/.npm
- .next, node_modules        Registry: :buildcache         Next.js: /app/.next/cache
- .git, .vercel, *.tsbuild   (reused across runners)       (Turbopack graph cache)
Context: ~300MB → <5MB       Cache pull: ~15s              Build time: 4m → ~25s
    │                                │                                │
    └────────────────────────────────┼────────────────────────────────┘
                                     ▼
                     [4. Multi-Stage Dockerfile]
                     - deps: package*.json with npm ci
                     - builder: Next.js 16 standalone build
                     - runner: node:22-alpine non-root
                     - Debloat: strip npm, npx, yarn (~25MB)
                     - Runtime footprint: ~85MB
                                     │
                                     ▼
                     [5. Consolidated Pipeline Job]
                     Single GitHub Actions job eliminates:
                     - Second runner queue wait (~30s)
                     - Artifact upload/download roundtrip (~25s)
                                     │
                                     ▼
                     [6. Swap-Safe VM Rollout]
                     - Target: 1GB-2GB RAM VPS / Bare-Metal
                     - Fast graceful stop: docker stop -t 3
                     - Host cache mount: /opt/cache:/app/.next/cache
                     - Zero-Node healthcheck: busybox wget (<2ms)
                     - Health poll: 0.5s intervals (ready in ~1.5s)
                     - Automated instant rollback on failure ($OLD_IMAGE)
                     - Background async prune: docker image prune -f &
```

---

## 3. Next.js 16 & Turbopack Highlights

Next.js 16 features **Turbopack as default** along with **Turbopack File System Caching**:
1. **Incremental Compilation Preservation**:
   Mounting `/app/.next/cache` via BuildKit (`--mount=type=cache,id=nextjs,target=/app/.next/cache`) persists Turbopack's disk cache across builds, slashing page compilation to seconds.
2. **React 19 & Compiler Optimization**:
   Full support for React 19's memoizing React Compiler without runtime Babel overhead.
3. **Node.js 22 LTS Runtime**:
   Leverages modern V8 JIT performance, native fetch, and web standards.

---

## 4. The 7 Pillars of Sub-90s Next.js CI/CD

### Pillar 1: Strict `.dockerignore` (Context Reduction)
Passing build context to the Docker daemon often wastes 30–60 seconds uploading `.next`, `node_modules`, or Git history.
- **Rule**: Exclude all transient, build, and environment artifacts.
- **Reference**:
  ```dockerignore
  node_modules
  .next
  .vercel
  .git
  .github
  .env*
  npm-debug.log*
  yarn-debug.log*
  yarn-error.log*
  .pnpm-debug.log*
  .DS_Store
  *.pem
  tsconfig.tsbuildinfo
  test
  tests
  coverage
  *.md
  ```

### Pillar 2: BuildKit Cache Mounts inside Dockerfile
Reinstalling npm packages and recompiling all Next.js pages from scratch on every commit wastes minutes.
- **Rule**: Use BuildKit cache mounts for both the package manager and the Next.js compiler:
  ```dockerfile
  # Cached dependency installation
  RUN --mount=type=cache,id=npm,target=/root/.npm \
      npm ci --prefer-offline --no-audit --maxsockets 7

  # Cached incremental Next.js 16 Turbopack compilation
  RUN --mount=type=cache,id=nextjs,target=/app/.next/cache \
      npm run build
  ```

### Pillar 3: Dual Buildx Cache (GHA + Container Registry)
GitHub Actions cache (`type=gha`) is scoped to repository branches and frequently evicts large layers.
- **Rule**: Combine `type=gha,mode=max` with an external container registry cache tag (`:buildcache`) on GHCR or Docker Hub:
  ```yaml
  cache-from: |
    type=gha
    type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
  cache-to: |
    type=gha,mode=max
    type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max,image-manifest=true
  ```

### Pillar 4: Next.js Standalone Mode & Runtime Debloating
Next.js `output: "standalone"` automatically traces required node_modules, producing a self-contained server bundle that cuts image size from ~800MB to ~100MB.
- **Rule**: Enable `output: "standalone"` in `next.config.ts` / `next.config.js`.
- **Debloating**: In the final `runner` stage, remove unnecessary package manager binaries shipped with the base Node.js Alpine image:
  ```dockerfile
  # Shed ~25MB of dead package manager weight from production image
  RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn*
  ```

### Pillar 5: Lightweight Zero-Node Health Checks
On 0.5–1.0 vCPU instances, executing `node -e "fetch('http://127.0.0.1:3000/api/health')"` forces the V8 engine to spin up and compile JavaScript every 2 seconds. This consumes 30MB+ of RAM and takes 2.5+ seconds, triggering false `unhealthy` timeouts and container death spirals.
- **Rule**: Use built-in BusyBox `wget` inside the container:
  ```bash
  --health-cmd "wget -qO- http://127.0.0.1:3000/api/health || exit 1" \
  --health-interval 3s --health-timeout 3s --health-retries 3 --health-start-period 2s
  ```
- **Performance difference**: Busybox `wget` executes in **<2ms** with **0MB** runtime memory overhead.

### Pillar 6: Pipeline Job Consolidation
Splitting CI/CD into separate `build` and `deploy` jobs requires spinning up a second GitHub Actions runner, re-authenticating, downloading layers, and waiting in runner queue queues (costing 30–60 seconds).
- **Rule**: Consolidate into a single `build-and-deploy` job when deploying directly via SSH or runner agents.

### Pillar 7: Swap-Safe Zero-Downtime Rollout on 1GB VPS
Running two Next.js instances simultaneously on a 1GB host causes Out-Of-Memory (OOM) kills or thrashing.
- **Rule**:
  1. Fast graceful stop: `docker stop -t 3 <container> >/dev/null 2>&1 || true`
  2. Launch new container with memory limits (`-m 512M --cpus 1.0 -e NODE_OPTIONS=--max-old-space-size=384`).
  3. Fast health polling: Poll `http://127.0.0.1:PORT/api/health` every 0.5s for up to 6s.
  4. Instant fallback: If unhealthy, start `$OLD_IMAGE` immediately.
  5. Asynchronous cleanup: Run `(docker image prune -f >/dev/null 2>&1 &)` in the background so it never blocks workflow completion.

---

## 5. Production Golden Templates

### 5.1 Production Multi-Stage `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7-labs
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# -------------------------------------------------------------
# Stage 1: Dependencies with BuildKit NPM Cache
# -------------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --maxsockets 7

# -------------------------------------------------------------
# Stage 2: Builder with Next.js 16 Turbopack Cache
# -------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=cache,id=nextjs,target=/app/.next/cache \
    npm run build

# -------------------------------------------------------------
# Stage 3: Minimal Production Runner (Debloated ~85MB)
# -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Security: Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Strip dead package manager binaries from production image (~25MB saved)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn*

# Copy standalone build and public static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Fast lightweight busybox healthcheck (<2ms)
HEALTHCHECK --interval=3s --timeout=3s --retries=3 --start-period=2s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
```

---

### 5.2 `next.config.ts` Settings for Next.js 16 + React 19

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required: Generates minimal standalone server.js bundle
  output: "standalone",

  // Performance: Enable gzip/brotli compression
  compress: true,

  // Security: Remove x-powered-by header
  poweredByHeader: false,

  // React Strict Mode for predictable hydration
  reactStrictMode: true,

  // Next.js 16 + React 19 Compiler support
  experimental: {
    reactCompiler: true,
  },

  // Optimize production image caching
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
};

export default nextConfig;
```
