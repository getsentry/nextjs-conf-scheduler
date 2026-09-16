# Conference seed snapshots

Standalone normalized seed snapshots for preview/demo deployments. They intentionally do **not** write to any database by themselves.

Each JSON file contains:

- `metadata` and `source`
- `tracks`
- `rooms`
- `speakers`
- `talks`
- `talkSpeakers`

The row shapes match the current Drizzle seed tables in `lib/db/schema.ts`.

## Files

| File | Tracks | Rooms | Speakers | Talks | Talk-speaker links |
| --- | ---: | ---: | ---: | ---: | ---: |
| `raise-summit-2026.json` | 7 | 7 | 359 | 193 | 407 |
| `wearedevelopers-world-congress-2026.json` | 22 | 30 | 605 | 488 | 636 |
| `wearedevelopers-world-congress-na-2026.json` | 8 | 10 | 318 | 222 | 271 |
| `the-ai-conference-2026.json` | 5 | 8 | 45 | 43 | 51 |
| `ai-engineer-paris-2026.json` | 8 | 4 | 40 | 37 | 41 |

`wearedevelopers-world-congress-na-2026.json`: speakers and sessions are real (scraped 2026-08-31); tracks, stages, and the time grid are synthesized because the final agenda is unpublished. Regenerate from the live agenda closer to the event (Sep 23–25, 2026).

`the-ai-conference-2026.json`: real speakers and Day ZERØ workshops; tracks, rooms, and the main-conference schedule are synthesized because the agenda is unpublished.

`ai-engineer-paris-2026.json`: sessions and speakers are real, scraped from the `ai.engineer/paris/2026` page bundle (the event has no public feed or Sessionize API endpoint). Bios come from public Sessionize profiles where a speaker has one, otherwise from `title, company`. Re-run `pnpm db:import:aie-paris --profiles` before the event because the agenda can change. Replace this importer with the Sessionize API once the organizers publish an endpoint.

## Sentry demo sessions

RAISE Summit 2026:

- `raise-4216951-fireside-chat-your-agent-cant-fix-what-it-cant-s` — **Fireside Chat: Your agent can't fix what it can't see**
- Slow-speaker candidate: `raise-spk-2320649-milin-desai` — Milin Desai, CEO, Sentry

WeAreDevelopers World Congress 2026:

- `wad-1265963-software-that-fixes-itself` — **Software That Fixes Itself**
- `wad-1094865-trust-issues-because-zero-trust-isnt-optional-an` — **Trust Issues: Because Zero-Trust Isn’t Optional Anymore**
- Slow-speaker candidates: `wad-spk-milin-desai`, `wad-spk-jan-peer-stocklmair`

WeAreDevelopers World Congress North America 2026:

- `wadna-1320525-running-ai-written-software-in-production` — **Running AI-Written Software in Production** (Milin Desai & Ivan Burazin, real session)
- Slow-speaker candidate: `wadna-spk-milin-desai` — Milin Desai, CEO, Sentry

The AI Conference 2026:

- `aiconf-debugging-ai-applications-in-production-with-sentry` — **Debugging AI Applications in Production with Sentry** (synthesized; Sentry is a real sponsor but has no published session)
- Slow-speaker candidate: `aiconf-spk-milin-desai`

AI Engineer Paris 2026:

- `aiep-1299136-do-you-love-wasting-money-then-you-should-not-ca` — **Do you love wasting money? Then you should not care about agent tracing** (Sergiy Dybskiy, Sep 24 11:30–12:00, Discovery Track 1)
- `aiep-1330235-debugging-agents-in-different-environments` — **Debugging Agents in different environments** (workshop, Sep 24 14:00–15:00, Workshop)
- Slow-speaker candidate: `aiep-spk-sergiy-dybskiy` — Sergiy Dybskiy, Sentry

## Safe preview seeding

The app build wrapper only seeds when both are true:

1. `VERCEL_ENV=preview`
2. `CONFERENCE_SEED_FILE` is set

The conference seed script refuses to run in production and refuses to run outside preview unless explicitly overridden. Set `PRIMARY_DATABASE_URL` / `PRODUCTION_DATABASE_URL` in Vercel as an extra guard so the script can abort if `DATABASE_URL` ever points at the primary DB.
