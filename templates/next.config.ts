import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required: Generates minimal standalone server bundle for Docker
  output: "standalone",

  // Performance: Enables gzip & brotli compression
  compress: true,

  // Security: Removes x-powered-by header
  poweredByHeader: false,

  // Predictable React 19 hydration
  reactStrictMode: true,

  // Next.js 16 + React 19 Cutting-Edge Compilation
  experimental: {
    // Stable automatic React memoization without manual useMemo/useCallback
    reactCompiler: true,
    // Partial Pre-Rendering (PPR) & Cache Components
    ppr: "incremental",
  },

  // Modern next-gen image formats
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
};

export default nextConfig;
