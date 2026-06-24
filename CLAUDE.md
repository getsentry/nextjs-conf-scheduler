# CLAUDE.md

Guidance for coding agents working in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack) — no cache behavior
pnpm build        # Production build
pnpm start        # Start production server — cache behavior works here
pnpm lint         # Run Biome checks
pnpm format       # Format with Biome
pnpm db:init      # Prompt for Neon/Postgres DATABASE_URL and write .env.local
pnpm db:push      # Enable pgvector and apply Drizzle schema
pnpm db:seed      # Seed AI Engineer World's Fair 2026 data
pnpm db:embed     # Generate pgvector embeddings for semantic AI search
pnpm db:studio    # Open Drizzle Studio
pnpm traffic      # Generate demo traffic against dev or prod server
```

## Architecture

This is a Next.js 16 demo app for the AI Engineer World's Fair 2026 schedule. It showcases cached and dynamic data fetching, signed-in schedule mutations, a sidebar AI assistant, and Sentry-first observability.

### Data Flow Patterns

| Pattern | Usage | Example |
|---------|-------|---------|
| RSC + direct DB queries | Page data loading | `app/(main)/page.tsx`, `app/(main)/talks/[id]/page.tsx` |
| `"use cache"` + `cacheTag` | Cached data functions | `getCachedScheduleData()`, `getCachedSpeakers()` |
| Server Actions | Mutations | `lib/actions/auth.ts`, `lib/actions/schedule.ts` |
| API Routes | AI streaming and usage | `app/api/ai/chat/route.ts`, `app/api/ai/usage/route.ts` |

### Key Layers

- **`lib/db/queries.ts`** — Data access functions using direct Drizzle queries.
- **`lib/auth/`** — JWT cookie sessions; protected pages call `requireAuth()`.
- **`lib/db/`** — Drizzle ORM with Neon Postgres, pgvector embeddings, and lazy DB initialization.
- **`lib/ai/models.ts`** — Selectable AI Gateway model configuration.
- **`lib/ai/agents.ts`** — Single `ToolLoopAgent` schedule assistant.
- **`lib/ai/tools.ts`** — AI SDK tools using `inputSchema`.
- **`lib/ai/usage.ts`** — Daily quota and token usage tracking.
- **`components/ai-assistant-*`** — Header trigger, sidebar shell, and AI chat UI.
- **`proxy.ts`** — Next.js 16 proxy for optimistic auth redirects and `page.view` metrics.

### Auth Pattern

Protected pages call `requireAuth()` from `lib/auth/dal.ts`. The proxy gives early redirects, but the DAL is the security boundary.

### Caching

`cacheComponents: true` is enabled in `next.config.ts`. Cache behavior only works in production (`pnpm build && pnpm start`).

- **Cached**: Home schedule data — `cacheTag("talks", "tracks")`, `cacheLife("hours")`
- **Cached**: Speakers list — `cacheTag("speakers")`, `cacheLife("days")`
- **Dynamic**: saved-event state on `/`, talk detail, speaker detail, AI API routes
- Pages use Suspense boundaries for partial prerendering.

### AI Assistant

- Guests can chat with open models through Vercel AI Gateway.
- Authenticated users can choose Claude models plus the open-model list.
- Authenticated `@sentry.io` users bypass quota but are still tracked.
- Keep `experimental_telemetry` enabled on AI SDK calls so Sentry can emit AI spans.
- Do not wrap AI SDK calls in manual `Sentry.startSpan`; avoid duplicate `gen_ai` spans.

### Observability (Sentry)

**Use metrics for counting, logs for investigation details, and spans for timing.** Avoid duplicating fields Sentry/Vercel already add automatically.

What we emit:

- **Metrics**: `page.view`, `cache.miss`, `ai.message.sent`, `ai.chat.requests`, `ai.quota.*`, `ai.tokens.*`, `ai.embedding.*`, `ai.usage.threshold_exceeded`
- **Logs**: `account.signup`, `account.login`, `account.logout`, `schedule.add`, `schedule.remove`, `proxy.redirect`, `cache.miss`, `og.image`, `ai.chat`, `ai.usage`
- **Spans**: DB spans via `postgresJsIntegration`; AI spans via Sentry's default Vercel AI integration and AI SDK telemetry
- **Config**: `sentry.server.config.ts` should stay minimal: `postgresJsIntegration()`, `streamGenAiSpans: true`, no explicit `vercelAIIntegration`, no custom AI span wrappers

### Database

Neon Postgres with Drizzle and pgvector. Schema is in `lib/db/schema.ts`. `pnpm db:push` creates the `vector` extension before applying schema. `pnpm db:embed` generates schedule embeddings used by semantic AI search.
