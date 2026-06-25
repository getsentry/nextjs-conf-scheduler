import * as Sentry from "@sentry/nextjs";
import { postgresJsIntegration } from "@sentry/node";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ignoreTransactions: [/^GET middleware GET$/],
  streamGenAiSpans: true,
  enableLogs: true,
  sendDefaultPii: true,
  tracePropagationTargets: [/^\//, /\.neon\.tech/, /ai-gateway\.vercel\.sh/],
  integrations: [postgresJsIntegration()],
});
