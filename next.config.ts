import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize so instrumentation and page handlers share the same module instance
  serverExternalPackages: ["@libsql/client"],
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "sergtech",
  project: "nextjs-conf-scheduler",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
});
