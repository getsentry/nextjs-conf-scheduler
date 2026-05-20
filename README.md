# Next.js Conf Schedule Builder

A demo app for the Sentry workshops on observing and debugging Next.js apps.

Built with Next.js 16, featuring real Next.js Conf 2025 session data.

## Features

- **Schedule Grid** - Browse all conference talks with filters (track, level, format)
- **Talk Details** - View full talk info, speaker bio, add to your schedule
- **Speaker Pages** - Browse speakers and their talks
- **My Schedule** - Manage your personalized conference schedule
- **AI Schedule Builder** - Get AI-powered talk recommendations based on your interests
- **Sentry Integration** - Structured logs, distributed tracing, metrics, cache observability

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, Cache Components)
- **Database**: Turso (hosted SQLite) + Drizzle ORM
- **Data Fetching**: Direct Drizzle queries + `"use cache"` for cached data
- **Auth**: JWT sessions (cookies)
- **AI**: Vercel AI SDK + OpenAI
- **UI**: shadcn/ui + Tailwind CSS
- **Monitoring**: Sentry (logs, traces, metrics)

## Quick Start

### Prerequisites

- Node.js 20+
- [Turso CLI](https://docs.turso.tech/cli/installation) (`brew install tursodatabase/tap/turso`)
- OpenAI API key
- Sentry account

### Setup

```bash
# Install dependencies
pnpm install

# Set up Turso database (creates DB + writes .env.local)
pnpm db:init

# Apply database schema
pnpm db:push

# Seed conference data
pnpm db:seed

# Add remaining env vars to .env.local
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.local
echo "OPENAI_API_KEY=sk-..." >> .env.local
echo "NEXT_PUBLIC_SENTRY_DSN=https://..." >> .env.local

# Start dev server (no caching)
pnpm dev

# Or production mode (caching works)
pnpm build && pnpm start
```

Open [http://localhost:3000](http://localhost:3000)

### Generate Sentry Data

```bash
# Against local prod server
pnpm build && pnpm start  # terminal 1
pnpm traffic              # terminal 2

# Against deployed app
pnpm traffic https://your-app.vercel.app
```

This creates 8 test users and generates ~100 requests across all pages — authenticated and anonymous, cached and dynamic, including OG image generation.

## Environment Variables

```bash
# .env.local
TURSO_DATABASE_URL=libsql://...    # Set by db:init
TURSO_AUTH_TOKEN=...               # Set by db:init
JWT_SECRET=...                     # Any 32+ char string
OPENAI_API_KEY=sk-...              # For AI Builder
NEXT_PUBLIC_SENTRY_DSN=https://... # Sentry DSN
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (no caching) |
| `pnpm build && pnpm start` | Production server (caching works) |
| `pnpm traffic` | Generate traffic from 8 test users |
| `pnpm db:init` | Create Turso DB & configure env |
| `pnpm db:push` | Apply Drizzle schema |
| `pnpm db:seed` | Seed conference data |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm lint` | Run Biome linter |

## Project Structure

```
app/
├── (auth)/           # Login/signup pages
├── ai-builder/       # AI schedule assistant
├── api/              # API routes (AI chat)
├── my-schedule/      # User's saved talks
├── speakers/         # Speaker list & details
├── talks/            # Talk details + OG images
├── workshop/         # 201 workshop landing page
└── page.tsx          # Schedule grid (home)

lib/
├── actions/          # Server Actions (auth, schedule)
├── ai/               # AI tools for schedule builder
├── auth/             # Session & DAL
└── db/               # Drizzle schema, client, queries
```

## Data Fetching

All data access goes through `lib/db/queries.ts` — plain Drizzle functions, no abstraction layer.

| Pattern | Usage | Caching |
|---------|-------|---------|
| `"use cache"` + `cacheTag` | Home page (talks, tracks), speakers list | Cached with `cacheLife` |
| Direct DB query | Talk detail, speaker detail | Dynamic (per-request) |
| Server Actions | Auth, schedule mutations | Invalidates via `revalidatePath` |

## Observability

| Signal | What | Example Query |
|--------|------|---------------|
| `page.view` metric | Every page request (proxy) | Group by `path`, `browser`, `authenticated` |
| `cache.miss` metric | Cache function executes | Compare with `page.view` for hit rate |
| `auth.login` log | Login attempts | Filter by `result:invalid_password` |
| `schedule.add` log | Bookmark events | Group by `talk_id` for popular talks |
| `og.image` log | OG image generation | Filter by `result:not_found` |
| `proxy.redirect` log | Auth redirects | Filter by `reason:no_session` |
| DB spans | Every SQL query | `db.system:sqlite`, `db.statement` |
| AI spans | LLM calls + tool use | Auto-instrumented via `vercelAIIntegration` |

## Workshops

- **101**: See `WORKSHOP.md` and `PRESENTER-GUIDE.md` — progressive module-branch workshop covering error capture, tracing, logs, DB tracing, and AI monitoring
- **201**: See `/workshop` route — logs, tracing, cache observability, metrics, alerts, and dashboards for production Next.js debugging

## License

MIT
