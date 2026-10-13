import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@octonote/shared", "@octonote/content", "@octonote/api-client", "@octonote/design-tokens"],
  // Phone testing: Next blocks cross-origin dev requests unless the LAN host is listed.
  allowedDevOrigins: process.env.LAN_HOST ? [process.env.LAN_HOST] : [],
  // The link-preview cards read Inter from disk; bundle it with those routes.
  outputFileTracingIncludes: {
    "/pub/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
