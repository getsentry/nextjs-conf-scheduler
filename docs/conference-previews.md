# Conference preview deployments

This project can build isolated Vercel preview deployments backed by isolated Neon database branches.

## Safety guarantees in this repo

- `vercel.json` runs `pnpm vercel-build`.
- `scripts/vercel-build.ts` only runs database setup/seed/embed when `VERCEL_ENV=preview` and `CONFERENCE_SEED_FILE` is set.
- `scripts/seed-conference.ts` refuses production and refuses non-preview seeding unless explicitly overridden.
- The seed script also refuses to run if the active `DATABASE_URL` matches `PRIMARY_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, or `NEON_PRIMARY_DATABASE_URL`.

## Neon setup

Preferred: enable the Neon Vercel integration's preview branch behavior for this Vercel project. Each Vercel preview deployment should receive a `DATABASE_URL` pointing to its Neon preview branch.

Also add the primary/prod database URL as a protected guard env var:

```bash
PRIMARY_DATABASE_URL=postgresql://...
```

Do not set preview `DATABASE_URL` to the primary branch.

## Vercel deployment protection

To make preview URLs accessible without Vercel Firewall/auth:

1. Vercel Project Settings → Deployment Protection.
2. Disable Vercel Authentication/password protection for Preview deployments, or add explicit preview-domain exceptions.
3. Confirm no custom Firewall/WAF rule blocks anonymous traffic.

## RAISE Summit preview env

```bash
CONFERENCE_SEED_FILE=data/conference-seeds/raise-summit-2026.json
NEXT_PUBLIC_CONFERENCE_NAME=RAISE Summit 2026
NEXT_PUBLIC_CONFERENCE_SHORT_NAME=RAISE 2026
NEXT_PUBLIC_CONFERENCE_DATES=July 8–9, 2026
NEXT_PUBLIC_CONFERENCE_LOCATION=Paris, France
NEXT_PUBLIC_CONFERENCE_VENUE=Carrousel du Louvre
NEXT_PUBLIC_CONFERENCE_TIME_ZONE=Europe/Paris
DEMO_BLOCKED_TALK_ID=raise-4216951-fireside-chat-your-agent-cant-fix-what-it-cant-s
DEMO_SLOW_SPEAKER_ID=raise-spk-2320649-milin-desai
DEMO_SCHEDULE_ERROR_MESSAGE=You should be at the booth instead of watching the Sentry talk
```

## WeAreDevelopers preview env

```bash
CONFERENCE_SEED_FILE=data/conference-seeds/wearedevelopers-world-congress-2026.json
NEXT_PUBLIC_CONFERENCE_NAME=WeAreDevelopers World Congress 2026
NEXT_PUBLIC_CONFERENCE_SHORT_NAME=WAD 2026
NEXT_PUBLIC_CONFERENCE_DATES=July 8–10, 2026
NEXT_PUBLIC_CONFERENCE_LOCATION=Berlin, Germany
NEXT_PUBLIC_CONFERENCE_VENUE=CityCube Berlin
NEXT_PUBLIC_CONFERENCE_TIME_ZONE=Europe/Berlin
DEMO_BLOCKED_TALK_ID=wad-1265963-software-that-fixes-itself
DEMO_SLOW_SPEAKER_ID=wad-spk-milin-desai
DEMO_SCHEDULE_ERROR_MESSAGE=You should be at the booth instead of watching the Sentry talk
```

## Local dry-run guard

Do not run preview seeding against `.env.local` unless it points at a disposable branch. If you need to test locally:

```bash
DATABASE_URL=postgresql://preview-branch-url \
PRIMARY_DATABASE_URL=postgresql://primary-url \
ALLOW_CONFERENCE_SEED_OUTSIDE_PREVIEW=1 \
CONFERENCE_SEED_FILE=data/conference-seeds/raise-summit-2026.json \
pnpm db:seed:conference
```
