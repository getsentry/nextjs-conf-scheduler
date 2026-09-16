import * as Sentry from "@sentry/nextjs";
import { sentryEnvironmentOption, tagConference } from "./lib/sentry-conference";

Sentry.init({
  ...sentryEnvironmentOption,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enableLogs: true,
  sendDefaultPii: true,
  ignoreTransactions: [/^GET middleware GET$/],
});
tagConference();
