import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize so Sentry instrumentation and route handlers share one postgres module instance.
  serverExternalPackages: ["postgres"],
  cacheComponents: true,
  images: {
    // Speaker avatar hosts used by the conference seed snapshots in data/conference-seeds/.
    remotePatterns: [
      "avatars.githubusercontent.com",
      "www.ai.engineer",
      "imagedelivery.net",
      "sessionize.com",
      "aiconference.com",
      "assets.swoogo.com",
      "cdn.prod.website-files.com",
      "api.dicebear.com",
    ].map((hostname) => ({ protocol: "https" as const, hostname })),
  },
};

export default withSentryConfig(nextConfig, {
  org: "demo",
  project: "ai-engineer-conf",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
});
