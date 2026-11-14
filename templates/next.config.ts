import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required: Generates minimal standalone server bundle
  output: "standalone",

  // Performance: Enables gzip & brotli compression
  compress: true,

  // Security: Removes x-powered-by header
  poweredByHeader: false,

  // React Strict Mode for predictable hydration
  reactStrictMode: true,

  // Optimize production image caching
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
};

export default nextConfig;
