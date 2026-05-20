# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack) — NO caching
pnpm build        # Production build
pnpm start        # Start production server — caching works here
pnpm lint         # Run Biome linter + formatter check
pnpm format       # Auto-format with Biome
pnpm db:init      # Create Turso DB & write credentials to .env.local
pnpm db:push      # Apply Drizzle schema to database
pnpm db:seed      # Seed conference data
pnpm db:studio    # Open Drizzle Studio
pnpm traffic      # Generate traffic from 8 test users (run against dev or prod server)
```

## Architecture

This is a Next.js 16 demo app for a Sentry workshop, showcasing multiple data fetching patterns.

### Data Flow Patterns

| Pattern | Usage | Example |
|---------|-------|---------|
| RSC + direct DB queries | Page data loading | `app/page.tsx`, `app/talks/[id]/page.tsx` |
| `"use cache"` + `cacheTag` | Cached data functions | `getCachedScheduleData()`, `getCachedSpeakers()` |
| Server Actions | Mutations | `lib/actions/auth.ts`, `lib/actions/schedule.ts` |
| API Routes | AI streaming | `app/api/ai/chat/route.ts` |

### Key Layers

- **`lib/db/queries.ts`** - All data access functions (direct Drizzle queries, no abstraction layer)
- **`lib/auth/`** - JWT session in cookies, DAL pattern with `requireAuth()` for protected routes
- **`lib/db/`** - Drizzle ORM with Turso, lazy initialization via Proxy to avoid build-time errors
- **`lib/ai/tools.ts`** - AI SDK tools using `inputSchema` (not `parameters`) for v4+ compatibility
- **`proxy.ts`** - Next.js 16 proxy (replaces middleware) for optimistic auth redirects

### Auth Pattern

Protected pages call `requireAuth()` from `lib/auth/dal.ts` which redirects if no session. The proxy layer (`proxy.ts`) provides optimistic redirects but actual security is in the DAL.

### Caching

`cacheComponents: true` is enabled in `next.config.ts`. Caching only works in production (`pnpm build && pnpm start`).

- **Cached function**: `getCachedScheduleData()` in `app/page.tsx` — `cacheTag("talks","tracks")`, `cacheLife("hours")`
- **Cached function**: `getCachedSpeakers()` in `app/speakers/page.tsx` — `cacheTag("speakers")`, `cacheLife("days")`
- **Dynamic**: `/my-schedule` — user-specific, always fresh
- All pages use Suspense boundaries for PPR (Partial Prerender)

### Observability (Sentry)

**When to use what:**
- **Metric** — counting and alerting: "how many", "how often", "what rate". Low cardinality attributes.
- **Log** — investigating a specific event: "what happened, who was affected, why". High cardinality attributes.
- **Span** — timing within a request: "where was time spent". Auto-instrumented where possible.
- **Don't duplicate** — Sentry auto-adds `browser.name`, `release`, `environment`, `sdk.*`. Vercel auto-adds `vercel.proxy.path`, `vercel.proxy.referer`, `vercel.execution_region`, `vercel.proxy.vercel_cache`.

**What we emit:**
- **Metrics**: `page.view` counter (proxy), `cache.miss` counter (cached functions)
- **Logs**: `auth.signup`, `auth.login`, `auth.logout`, `schedule.add`, `schedule.remove`, `proxy.redirect`, `cache.miss`, `og.image`
- **Spans**: `libsqlIntegration` for DB, `vercelAIIntegration` for AI, custom `og.image` span
- **Config**: `sentry.server.config.ts` has DB + AI integrations, `tracePropagationTargets` includes Turso

### Database

Turso (hosted SQLite) with Drizzle. Schema in `lib/db/schema.ts`. The `db` export uses a Proxy for lazy initialization to prevent build-time errors when env vars aren't available.
