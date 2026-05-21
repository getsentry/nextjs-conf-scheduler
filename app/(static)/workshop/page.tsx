import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "201 Workshop: Debugging Next.js with Logs & Tracing | Sentry",
  description:
    "Structured logging, distributed tracing, cache observability, and alerts for Next.js apps with Sentry.",
};

const modules = [
  {
    number: "01",
    title: "The App & Decision Framework",
    description:
      "Tour the app and its four route types: static, cached, dynamic, and user-specific. Learn when to reach for a metric, a log, or a span.",
    topics: [
      "Metric → counting and alerting (page.view by route type)",
      "Log → investigating a specific event (auth.login with context)",
      "Span → timing within a request (db.query, cache lookup)",
      "What Sentry and Vercel already capture for you",
    ],
  },
  {
    number: "02",
    title: "Structured Logs",
    description:
      "Query wide events in Sentry Logs. Each log packs one operation's full context — user, result, duration — so you can filter by any dimension and click through to its trace.",
    topics: [
      "auth.login — filter by result, group by user",
      "schedule.add — find the most popular talks",
      "cache.miss — which cache key, which path",
      "Log → trace: click any log to see the full request",
    ],
  },
  {
    number: "03",
    title: "Traces Across Route Types",
    description:
      "Compare trace waterfalls across the four rendering strategies. See what server work each generates — from zero spans on a static page to full DB queries on a dynamic one.",
    topics: [
      "Static (/workshop): render only, no DB, no cache",
      "Cached hit (/): suspense-cache lookup, no DB",
      "Cached miss (/): db.query spans + cache write-back",
      "Dynamic (/my-schedule): auth + DB every request",
    ],
  },
  {
    number: "04",
    title: "Metrics & Dashboards",
    description:
      "Build a dashboard from the command line with the Sentry CLI. Group page views by route type, track cache miss rates, and visualize auth patterns.",
    topics: [
      "sentry dashboard create + widget add",
      "page.view grouped by route_type and path",
      "cache.miss rate vs total page views",
      "Sentry MCP server for natural language queries",
    ],
  },
  {
    number: "05",
    title: "Alerts",
    description:
      "Create a monitor on login failures from the Sentry UI. Review the framework: metrics for counting, logs for context, traces for timing.",
    topics: [
      "Log-based monitor: auth failures > threshold",
      "Metric-based monitor: cache miss rate spike",
      "Each signal has one job — don't make one do another's",
    ],
  },
];

const prerequisites = [
  { label: "Completed 101 workshop", href: "https://sentry.io/resources/debugging-nextjs-apps-workshop/" },
  { label: "Sentry account with a Next.js project", href: "https://sentry.io/signup" },
  { label: "Sentry CLI installed", href: "https://cli.sentry.dev" },
];

export default function WorkshopPage() {
  return (
    <>
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
              Logs, Traces & Metrics
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-[#B4ADC6]">
            Next.js gives you static pages, cached components, and dynamic renders — each shows up
            differently in your observability tooling. This session teaches you what to expect from
            each, how to query it, and when to alert on it.
          </p>
        </div>
      </div>

      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">What You'll Learn</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              title: "Logs = Investigation",
              desc: "Wide events with context — who, what, why — queryable by any attribute",
            },
            {
              title: "Traces = Timing",
              desc: "Follow requests across route types: static, cached, dynamic. See where time goes.",
            },
            {
              title: "Metrics = Counting",
              desc: "Page views by route type, cache hit rates, auth failure rates. Dashboard and alert.",
            },
          ].map((item) => (
            <Card key={item.title} className="border-border/50 bg-card/50">
              <CardContent className="pt-4">
                <h3 className="mb-1 font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">Modules</h2>
        <div className="space-y-4">
          {modules.map((mod) => (
            <Card
              key={mod.number}
              className="border-border/50 bg-card/50 transition-colors hover:border-primary/20"
            >
              <CardContent className="pt-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
                  <span className="font-mono text-3xl font-bold text-primary/30 shrink-0">
                    {mod.number}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">{mod.title}</h3>
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

      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">Tools</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <h3 className="mb-2 font-semibold">Sentry CLI</h3>
              <p className="text-sm text-muted-foreground">
                Create dashboards, query logs, and view traces from the terminal.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <h3 className="mb-2 font-semibold">Sentry MCP Server</h3>
              <p className="text-sm text-muted-foreground">
                Query Sentry data with natural language through your AI editor.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <h3 className="mb-2 font-semibold">Monitors & Alerts</h3>
              <p className="text-sm text-muted-foreground">
                Threshold-based monitors on logs and metrics with Slack/PagerDuty/email actions.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">Prerequisites</h2>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4">
            <ul className="space-y-3">
              {prerequisites.map((prereq) => (
                <li key={prereq.label} className="flex items-center gap-3 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
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
          </CardContent>
        </Card>
      </section>

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
    </>
  );
}
