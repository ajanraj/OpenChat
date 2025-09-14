import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

// Extract hostname from CONVEX_URL for image configuration
const getConvexHostname = (): string | null => {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    try {
      return new URL(convexUrl).hostname;
    } catch {
      // Silent fail - return null if URL parsing fails
    }
  }
  return null;
};

const nextConfig: NextConfig = {
  // Disable React Strict Mode to prevent double-invoking effects
  reactStrictMode: false,
  experimental: {
    useCache: true,
    optimizePackageImports: [
      "@phosphor-icons/react",
      "@ridemountainpig/svgl-react",
      "@lobehub/icons",
    ],
    reactCompiler: true,
  },
  eslint: {
    // @todo: remove before going live
    // ignoreDuringBuilds: true,
  },
  images: {
    domains: [],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.oschat.ai",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
      },
      {
        protocol: "https",
        hostname: "api.microlink.io",
      },
      // Add Convex hostname dynamically
      ...(() => {
        const convexHostname = getConvexHostname();
        return convexHostname
          ? [
              {
                protocol: "https" as const,
                hostname: convexHostname,
              },
            ]
          : [];
      })(),
    ],
  },
  // biome-ignore lint/suspicious/useAwait: Next.js API requires async rewrites function
  async rewrites() {
    return [
      {
        source: "/p/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/p/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
      {
        source: "/p/decide",
        destination: "https://eu.i.posthog.com/decide",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);
