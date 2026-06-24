import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
      blockAllMedia: false,
      mask: [
        "[data-replay-private]",
        "[data-replay-private] *",
        "[data-sentry-mask]",
        "[data-sentry-mask] *",
        "input[type='password']",
        "input[name='password']",
      ],
      block: ["[data-replay-block]", "[data-sentry-block]"],
      ignore: [
        "[data-replay-ignore]",
        "[data-replay-private] input",
        "[data-replay-private] textarea",
        "[data-replay-private] select",
        "input[type='password']",
        "input[name='password']",
      ],
    }),
    Sentry.browserTracingIntegration({
      ignoreResourceSpans: ["resource.script", "resource.css", "resource.link"],
    }),
  ],
  tracesSampleRate: 1,
  enableLogs: true,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
