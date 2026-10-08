import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@octonote/shared", "@octonote/api-client", "@octonote/design-tokens"],
  // Phone testing: Next blocks cross-origin dev requests unless the LAN host is listed.
  allowedDevOrigins: process.env.LAN_HOST ? [process.env.LAN_HOST] : [],
};

export default nextConfig;
