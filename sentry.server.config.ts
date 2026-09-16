import * as Sentry from "@sentry/nextjs";
import { postgresJsIntegration } from "@sentry/node";
import { sentryEnvironmentOption, tagConference } from "./lib/sentry-conference";

Sentry.init({
  ...sentryEnvironmentOption,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ignoreTransactions: [/^GET middleware GET$/],
  streamGenAiSpans: true,
  enableLogs: true,
  sendDefaultPii: true,
  tracePropagationTargets: [/^\//, /\.neon\.tech/, /ai-gateway\.vercel\.sh/],
  integrations: [postgresJsIntegration()],
});
tagConference();
