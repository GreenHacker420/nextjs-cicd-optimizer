---
name: nextjs-cicd-optimizer
description: Optimizes Next.js 16 & 15 CI/CD pipelines, Docker container builds, and deployment workflows to achieve under 90-second build and release cycles. Applies Turbopack disk caching, BuildKit cache mounts, GHCR registry layer caching, standalone output packaging, lightweight zero-node health checks, and swap-safe zero-downtime container rollouts across npm, pnpm, and Bun.
---

# Next.js 16 Modern Stack CI/CD Speed & Docker Build Optimizer

A comprehensive agent guide and production standard for slashing Next.js 16 and 15 CI/CD build and deployment times from **6–10 minutes down to under 90 seconds** while supporting the latest ecosystem stack:
- **Next.js 16** (Turbopack Default, Cache Components, Partial Pre-Rendering, `proxy.ts`)
- **React 19** (Server Components, Server Actions, React Compiler)
- **Tailwind CSS v4** (CSS-first `@import "tailwindcss";`, Oxidized Engine)
- **TypeScript 5.8+** (Strict ESM, `verbatimModuleSyntax`, `isolatedDeclarations`)
- **Node.js 22 LTS / Bun 1.2+ / pnpm v10**
- **Docker BuildKit 1.8+ & Buildx v3** (GHCR Dual Layer Cache, OCI Manifests)

---

## 1. When to Activate This Skill

Activate this skill whenever:
- User asks to optimize, speed up, or troubleshoot slow Next.js 16/15 builds, Docker container creation, or GitHub Actions CI/CD workflows.
- Next.js Turbopack or Docker builds take longer than 2 minutes.
- Modern package managers (`pnpm`, `bun`, or `npm`) need Docker BuildKit store caching configured.
- GitHub Actions runners exceed job timeout limits or consume excessive build minutes.
- Production containers trigger false `unhealthy` healthcheck timeouts on low-CPU / low-RAM VMs (e.g. AWS EC2 t3/t4g, Oracle Cloud OCI micro/ampere instances).
- Deployments cause memory thrashing, high swap usage, or 502 Bad Gateway outages during container rollouts.

---

## 2. The Latest Stack Blueprint (2026)

| Layer | Modern 2026 Standard | Key CI/CD & Build Advantage |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16** | Turbopack is default; disk caching in `.next/cache` cuts rebuilds to <25s. |
| **UI Engine** | **React 19 + React Compiler** | Automatic memoization with `experimental.reactCompiler: true`. |
| **Styling** | **Tailwind CSS v4** | `@import "tailwindcss";` without heavy `postcss.config.js` or `tailwind.config.js`. |
| **Language** | **TypeScript 5.8+** | Fast incremental type checking, `isolatedDeclarations`. |
| **Runtimes** | **Node.js 22 LTS / Bun 1.2+** | Native fetch, web streams, high-performance V8 engine. |
| **Package Mgr** | **pnpm v10 / bun / npm 11** | BuildKit cache mounts tailored for each store (`/pnpm/store`, `/root/.bun`, `/root/.npm`). |
| **Edge Proxy** | **`proxy.ts`** | Modern edge routing boundary replacing legacy middleware. |
| **Observability**| **`instrumentation.ts`** | Native OpenTelemetry runtime diagnostics. |
| **OCI Engine** | **Docker BuildKit 1.8+** | Dual cache (`type=gha` + `type=registry,ref=...:buildcache,mode=max`). |

---

## 3. The 7 Pillars of Sub-90s Next.js CI/CD

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
Reinstalling dependencies and recompiling all Next.js pages from scratch on every commit wastes minutes.
- **Rule**: Use BuildKit cache mounts for both the package manager store and the Next.js Turbopack compiler:
  - **npm**: `--mount=type=cache,id=npm,target=/root/.npm`
  - **pnpm**: `--mount=type=cache,id=pnpm,target=/pnpm/store`
  - **bun**: `--mount=type=cache,id=bun,target=/root/.bun/install/cache`
  - **Next.js Turbopack**: `--mount=type=cache,id=nextjs,target=/app/.next/cache`

### Pillar 3: Dual Buildx Cache (GHA + Container Registry)
GitHub Actions cache (`type=gha`) is scoped to repository branches and frequently evicts large layers.
- **Rule**: Combine `type=gha,mode=max` with an external container registry cache tag (`:buildcache`) on GHCR or Docker Hub with `provenance: false`:
  ```yaml
  cache-from: |
    type=gha
    type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
  cache-to: |
    type=gha,mode=max
    type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max,image-manifest=true
  ```

### Pillar 4: Next.js Standalone Mode & Runtime Debloating
Next.js `output: "standalone"` automatically traces required node_modules, producing a self-contained server bundle that cuts image size from ~800MB to ~85MB.
- **Rule**: Enable `output: "standalone"` in `next.config.ts`.
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

## 4. Multi-Package Manager Docker Templates

### 4.1 `Dockerfile` (npm)
See [templates/Dockerfile](file:///Users/harsh/Desktop/gitRepos/nextjs-cicd-optimizer/templates/Dockerfile).

### 4.2 `Dockerfile.pnpm` (pnpm v10)
See [templates/Dockerfile.pnpm](file:///Users/harsh/Desktop/gitRepos/nextjs-cicd-optimizer/templates/Dockerfile.pnpm).

### 4.3 `Dockerfile.bun` (Bun 1.2+)
See [templates/Dockerfile.bun](file:///Users/harsh/Desktop/gitRepos/nextjs-cicd-optimizer/templates/Dockerfile.bun).
