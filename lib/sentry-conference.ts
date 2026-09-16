import * as Sentry from "@sentry/nextjs";
import { conferenceConfig } from "./conference-config";

// Sentry.init spreads options over its vercel-* default, so an `environment: undefined` key would erase it.
export const sentryEnvironmentOption = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
  ? { environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT }
  : {};

// Tags reach errors and transactions; attributes reach logs and metrics.
export function tagConference() {
  Sentry.getGlobalScope()
    .setTags({ conference: conferenceConfig.id })
    .setAttributes({ conference: conferenceConfig.id });
}
