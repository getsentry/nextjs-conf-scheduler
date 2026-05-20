import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "201 Workshop: Debugging Next.js with Logs & Tracing | Sentry",
  description:
    "Hands-on workshop covering structured logging, distributed tracing, cache observability, and alerts for Next.js apps with Sentry.",
};

const modules = [
  {
    number: "01",
    title: "The App & What's Instrumented",
    duration: "10 min",
    description:
      "Tour the conference scheduler app, walk through the Sentry config, and see how structured logs, metrics, and tracing are baked into the codebase — not bolted on after something breaks.",
    topics: [
      "proxy.ts — page.view metric on every request",
      "lib/actions/auth.ts — wide event logs on auth flows",
      'app/page.tsx — "use cache" with cache.miss metric',
      "sentry.server.config.ts — DB + AI tracing integrations",
    ],
    demo: null,
  },
  {
    number: "02",
    title: "Structured Logs: Query Everything",
    duration: "15 min",
    description:
      "Run traffic, open Sentry Logs, and query high-cardinality wide events. Filter by user, result, talk — any attribute. Every log is a queryable event, not a string to grep.",
    topics: [
      "auth.login — filter by result:invalid_password",
      "schedule.add — group by talk_id for popular talks",
      "proxy.redirect — how much anonymous traffic hits protected pages",
      "cache.miss — which cache keys are thrashing",
    ],
    demo: null,
  },
  {
    number: "03",
    title: "Traces: Follow a Request End to End",
    duration: "15 min",
    description:
      "Click from a log entry to its full trace. Walk through the waterfall: browser → proxy → Server Component → DB query spans. Compare a cache HIT trace (short) vs cache MISS trace (long).",
    topics: [
      "Cache miss trace: RSC → getCachedScheduleData → db.query spans",
      "Cache hit trace: RSC → (no child spans, served from cache)",
      "OG image trace: og.image span → db.query child span",
      "libsqlIntegration: db.system, db.statement, db.rows_affected",
    ],
    demo: null,
  },
  {
    number: "04",
    title: "Metrics & Dashboards",
    duration: "10 min",
    description:
      "Use page.view and cache.miss metrics to calculate cache hit rates. Build a dashboard with the Sentry CLI — no product analytics tool needed.",
    topics: [
      "page.view metric grouped by path, browser, authenticated",
      "cache.miss metric — compare count to page.view for hit rate",
      "Sentry CLI: sentry dashboard create + widget add",
      "Sentry MCP server for natural language querying",
    ],
    demo: null,
  },
  {
    number: "05",
    title: "Alerts & Wrap Up",
    duration: "10 min",
    description:
      "Set up an alert that fires when login failures spike. Review what we covered: logs tell you what happened, traces tell you where, metrics tell you how often.",
    topics: [
      "Alert: auth.login with result:invalid_password > 5 in 5 min",
      "Cron monitors with automaticVercelMonitors",
      "Logs → traces → metrics: the full observability picture",
      "Q&A",
    ],
    demo: null,
  },
];

const prerequisites = [
  { label: "Completed 101 workshop", href: null },
  { label: "Sentry account with a Next.js project", href: "https://sentry.io/signup" },
  { label: "Sentry CLI installed", href: "https://cli.sentry.dev" },
  { label: "Node.js 20+", href: null },
];

export default function WorkshopPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        {/* Hero */}
        <div className="relative mb-16 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#362D59] via-[#1D1127] to-[#0E0717] p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(108,95,199,0.15),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(225,86,124,0.1),_transparent_60%)]" />
          <div className="relative">
            <Badge
              variant="outline"
              className="mb-4 border-[#6C5FC7]/40 bg-[#6C5FC7]/10 text-[#B4ADC6]"
            >
              201 Workshop
            </Badge>
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Debugging Next.js
              <br />
              <span className="bg-gradient-to-r from-[#6C5FC7] to-[#E1567C] bg-clip-text text-transparent">
                Logs & Tracing
              </span>
            </h1>
            <p className="mb-6 max-w-2xl text-lg text-[#B4ADC6]">
              Next.js apps can be challenging to debug in production. Hydration errors, server
              component failures, cache staleness, and performance bottlenecks don't come with clear
              answers. In this hands-on session, we'll fix that.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-[#B4ADC6]">
              <span className="flex items-center gap-2">
                <ClockIcon />
                ~1 hour hands-on
              </span>
              <span className="flex items-center gap-2">
                <CalendarIcon />
                Thursday, May 22, 2025
              </span>
              <span className="flex items-center gap-2">
                <StackIcon />
                Next.js 16 + Sentry SDK 10
              </span>
            </div>
          </div>
        </div>

        {/* What You'll Learn */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">What You'll Learn</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <LogIcon />,
                title: "Structured Logging",
                desc: "High-context logs that capture who, what, and why — not just stack traces",
              },
              {
                icon: <TraceIcon />,
                title: "Distributed Tracing",
                desc: "Follow requests across client, proxy, RSC, and database boundaries",
              },
              {
                icon: <CacheIcon />,
                title: "Cache Observability",
                desc: 'See "use cache" behavior, staleness, and revalidation in real-time',
              },
              {
                icon: <AlertIcon />,
                title: "Alerts & Dashboards",
                desc: "Alert on log patterns, build dashboards with the CLI, query with MCP",
              },
            ].map((item) => (
              <Card key={item.title} className="border-border/50 bg-card/50">
                <CardContent className="pt-4">
                  <div className="mb-3 text-primary">{item.icon}</div>
                  <h3 className="mb-1 font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Agenda */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Agenda</h2>
          <div className="space-y-4">
            {modules.map((mod) => (
              <Card
                key={mod.number}
                className="border-border/50 bg-card/50 transition-colors hover:border-primary/20"
              >
                <CardContent className="pt-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
                    {/* Module number */}
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-3xl font-bold text-primary/30">
                        {mod.number}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {mod.duration}
                      </Badge>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{mod.title}</h3>
                        {mod.demo && (
                          <Link href={mod.demo}>
                            <Badge
                              variant="outline"
                              className="border-[#E1567C]/30 bg-[#E1567C]/10 text-[#E1567C] hover:bg-[#E1567C]/20"
                            >
                              Live Demo
                            </Badge>
                          </Link>
                        )}
                      </div>
                      <p className="mb-3 text-sm text-muted-foreground">{mod.description}</p>
                      <ul className="grid grid-cols-1 gap-1.5 text-sm md:grid-cols-2">
                        {mod.topics.map((topic) => (
                          <li key={topic} className="flex items-start gap-2 text-muted-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Tools & Resources */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Tools We'll Use</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-4">
                <h3 className="mb-2 font-semibold">Sentry CLI</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Build dashboards and query data from the command line. No product analytics tool
                  needed.
                </p>
                <code className="block rounded bg-muted/50 p-3 text-xs text-muted-foreground">
                  <span className="text-primary">$</span> sentry dashboard widget add &quot;My
                  Dashboard&quot; &quot;Auth Failures&quot; --display line --dataset logs --query
                  count --where &quot;message:*login failed*&quot;
                </code>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-4">
                <h3 className="mb-2 font-semibold">Sentry MCP Server</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Query Sentry data with natural language through your AI editor. Search issues,
                  events, and logs without leaving your IDE.
                </p>
                <code className="block rounded bg-muted/50 p-3 text-xs text-muted-foreground">
                  <span className="text-primary">&gt;</span> &quot;Show me the slowest database
                  queries from the last hour with their trace IDs&quot;
                </code>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-4">
                <h3 className="mb-2 font-semibold">Alerts & Monitors</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Monitors detect issues automatically. Alerts notify your team through Slack,
                  PagerDuty, or webhooks when patterns match.
                </p>
                <code className="block rounded bg-muted/50 p-3 text-xs text-muted-foreground">
                  <span className="text-primary">Rule:</span> If
                  logger.error(&quot;login_failed&quot;) &gt; 5 in 1 min → Slack #oncall
                </code>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Prerequisites */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Prerequisites</h2>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <ul className="space-y-3">
                {prerequisites.map((prereq) => (
                  <li key={prereq.label} className="flex items-center gap-3 text-sm">
                    <CheckIcon />
                    {prereq.href ? (
                      <a
                        href={prereq.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {prereq.label}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{prereq.label}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">New to Sentry for Next.js?</strong> Start
                  with our{" "}
                  <span className="font-medium text-primary">
                    101: Observing and Debugging Next.js Apps with Sentry
                  </span>{" "}
                  workshop first. This 201 session builds directly on that foundation.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50 pt-8 text-center text-sm text-muted-foreground">
          <p>
            Built with{" "}
            <a
              href="https://nextjs.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary"
            >
              Next.js 16
            </a>{" "}
            +{" "}
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary"
            >
              Sentry
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="m12 2 10 6.5v7L12 22 2 15.5v-7L12 2zM12 22v-6.5" />
      <path d="m22 8.5-10 7-10-7" />
      <path d="m2 15.5 10-7 10 7" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function TraceIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function CacheIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-primary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
