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

## Sentry demo sessions

RAISE Summit 2026:

- `raise-4216951-fireside-chat-your-agent-cant-fix-what-it-cant-s` — **Fireside Chat: Your agent can't fix what it can't see**
- Slow-speaker candidate: `raise-spk-2320649-milin-desai` — Milin Desai, CEO, Sentry

WeAreDevelopers World Congress 2026:

- `wad-1265963-software-that-fixes-itself` — **Software That Fixes Itself**
- `wad-1094865-trust-issues-because-zero-trust-isnt-optional-an` — **Trust Issues: Because Zero-Trust Isn’t Optional Anymore**
- Slow-speaker candidates: `wad-spk-milin-desai`, `wad-spk-jan-peer-stocklmair`

## Safe preview seeding

The app build wrapper only seeds when both are true:

1. `VERCEL_ENV=preview`
2. `CONFERENCE_SEED_FILE` is set

The conference seed script refuses to run in production and refuses to run outside preview unless explicitly overridden. Set `PRIMARY_DATABASE_URL` / `PRODUCTION_DATABASE_URL` in Vercel as an extra guard so the script can abort if `DATABASE_URL` ever points at the primary DB.
