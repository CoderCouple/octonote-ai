import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@octonote/shared", "@octonote/content", "@octonote/api-client", "@octonote/design-tokens", "@octonote/octodraw"],
  // Phone testing: Next blocks cross-origin dev requests unless the LAN host is listed.
  allowedDevOrigins: process.env.LAN_HOST ? [process.env.LAN_HOST] : [],
  // The link-preview cards read Inter from disk; bundle it with those routes.
  // Product analytics (PostHog, US) through our own domain, so the requests aren't blocked as third-party.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  outputFileTracingIncludes: {
    "/pub/**": ["./assets/fonts/**"],
    "/opengraph-image": ["./assets/fonts/**"],
    "/cli/opengraph-image": ["./assets/fonts/**"],
  },
};

export default nextConfig;
