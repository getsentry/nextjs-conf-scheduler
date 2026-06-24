# AI Engineer World's Fair Schedule Builder

A Sentry-observable Next.js demo app for browsing the AI Engineer World's Fair 2026 schedule and getting AI-assisted recommendations.

Built with Next.js 16, Neon Postgres, pgvector, Vercel AI Gateway, AI SDK 6, and Sentry.

## Features

- **Schedule grid** — Browse AI Engineer World's Fair sessions with day, track, and search filters.
- **Talk details** — View full session details, speaker info, and save sessions.
- **Speaker pages** — Browse speakers and their sessions.
- **My events view** — Save sessions directly from the schedule grid and filter to saved events.
- **AI schedule assistant** — Right-side chat assistant with semantic schedule search and rendered session cards.
- **Tiered AI access** — Guests use open models; signed-in users get Claude plus open-model options.
- **Sentry observability** — Logs, traces, metrics, cache events, DB spans, AI spans, token usage, and quota telemetry.

## Tech Stack

- **Framework**: Next.js 16 App Router, Turbopack, Cache Components
- **Database**: Neon Postgres + pgvector + Drizzle ORM
- **Auth**: JWT sessions in cookies
- **AI**: AI SDK 6 + Vercel AI Gateway
- **Embeddings**: `alibaba/qwen3-embedding-0.6b` via Vercel AI Gateway
- **UI**: shadcn/ui + Tailwind CSS
- **Monitoring**: Sentry logs, traces, metrics, and AI span streaming

## Quick Start

```bash
pnpm install

# Configure env vars in .env.local
pnpm db:init
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.local
echo "AI_GATEWAY_API_KEY=..." >> .env.local
echo "NEXT_PUBLIC_SENTRY_DSN=https://..." >> .env.local

# Database + data
pnpm db:push
pnpm db:seed
pnpm db:embed

# Dev server
pnpm dev

# Production mode; required for cache behavior
pnpm build && pnpm start
```

Open [http://localhost:3000](http://localhost:3000).

> `pnpm build` prerenders cached pages and requires a valid `DATABASE_URL`.

## Environment Variables

```bash
DATABASE_URL=postgres://...        # Neon pooled connection string, sslmode=require
JWT_SECRET=...                     # Any 32+ char string
AI_GATEWAY_API_KEY=...             # Vercel AI Gateway key
NEXT_PUBLIC_SENTRY_DSN=https://... # Sentry DSN
```

Optional AI usage alert thresholds:

```bash
AI_USAGE_ALERT_GUEST_DAILY_REQUESTS=8
AI_USAGE_ALERT_AUTH_DAILY_REQUESTS=75
AI_USAGE_ALERT_DAILY_REQUESTS=100
AI_USAGE_ALERT_DAILY_TOKENS=100000
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server; cache behavior is disabled in dev |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm traffic` | Generate realistic demo traffic |
| `pnpm db:init` | Prompt for Neon/Postgres `DATABASE_URL` and write `.env.local` |
| `pnpm db:push` | Enable pgvector and apply Drizzle schema |
| `pnpm db:seed` | Seed AI Engineer World's Fair 2026 data |
| `pnpm db:embed` | Generate pgvector embeddings for schedule search |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm lint` | Run Biome checks |
| `pnpm format` | Format with Biome |

## AI Access Tiers

| Tier | Daily requests | Models |
|------|----------------|--------|
| Guest | 10 | GPT OSS, DeepSeek, Qwen, Mistral, Llama |
| Signed-in users | 100 | Claude Sonnet/Haiku/Opus plus guest open models |
| Internal Sentry users | Unlimited | Same as signed-in users |

Quota and token usage are persisted in Postgres (`ai_usage`) and emitted to Sentry as metrics/logs.

## Data Fetching

All database access goes through `lib/db/queries.ts` using plain Drizzle functions.

| Pattern | Usage | Caching |
|---------|-------|---------|
| `"use cache"` + `cacheTag` | Home page, speakers list | Cached with `cacheLife` |
| Direct DB query | Talk detail, speaker detail, my schedule | Dynamic |
| Server Actions | Auth and schedule mutations | Invalidates relevant paths |
| API Routes | AI chat, AI usage | Dynamic |

## Observability

| Signal | What |
|--------|------|
| `page.view` metric | Page requests from `proxy.ts` |
| `cache.miss` metric/log | Cached data function executed |
| `account.*` logs / `account.event` metric | Signup, login, logout |
| `schedule.*` logs | Saved schedule mutations |
| `ai.chat.requests` metric | AI requests by tier/outcome |
| `ai.quota.*` metrics | Daily quota usage |
| `ai.tokens.*` metrics | Input/output/total model token usage |
| `ai.embedding.*` metrics | Embedding requests, tokens, result counts |
| DB spans | Postgres queries via Sentry `postgresJsIntegration` |
| AI spans | AI SDK telemetry via Sentry's default Vercel AI instrumentation and `streamGenAiSpans` |

## License

MIT
