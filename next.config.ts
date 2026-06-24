import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize so Sentry instrumentation and route handlers share one postgres module instance.
  serverExternalPackages: ["postgres"],
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "www.ai.engineer",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "demo",
  project: "ai-engineer-conf",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
});
