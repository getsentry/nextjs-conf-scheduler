# 201 Workshop Cheat Sheet

App: https://nextjs-conf-scheduler.sentry.dev
Sentry: sentry-developer-experience / nextjs-conf-scheduler

---

## Module 01: The App & Decision Framework

**Show in browser:** Browse /, /speakers, /talks/coding-future, /workshop

**Talking point:** Four route types, three signals:
- `/workshop` → Static (○) — zero server spans
- `/` → Cached (◐) — suspense-cache lookup or DB on miss
- `/talks/[id]` → Dynamic (◐) — DB every request
- `/my-schedule` → Dynamic + auth (◐) — auth check + user-specific DB

| Signal | Job | Example |
|--------|-----|---------|
| Metric | How many, how often | `page.view` by route_type |
| Log | What happened, who, why | `auth.login` with result + user |
| Span | Where time was spent | `db.query` with SQL |

**Expected in Sentry:** Project overview shows data flowing.

---

## Module 02: Structured Logs

**Show in Sentry UI → Explore → Logs:**
1. Query `message:auth.login` → show entries with trace IDs
2. Filter `result:invalid_password` → "who's failing?"
3. Query `message:cache.miss` → "which paths, how often?"
4. **Click any log → opens the trace waterfall**

**Show in terminal:**
```bash
sentry log list sentry-developer-experience/nextjs-conf-scheduler --limit 10
```

**Show client vs server:** `ai.message.sent` (browser) vs `ai.chat` (server) — same trace

**Expected:** Logs have structured attributes, filterable by any dimension, linked to traces.

---

## Module 03: Traces Across Route Types

**Show in Sentry UI → Performance → Traces**, compare four shapes:

**1. Static — /workshop** (render only, ~18ms)
```
render route → build component tree → start response
```
No DB, no cache. Pure render.

**2. Cached HIT — /** (~30ms)
```
render route → GET suspense-cache (5ms) → start response
```
Data from Vercel remote cache. No DB.

**3. Cached MISS — /** (~1s)
```
render route → GET suspense-cache → start response
            → db.query (talks) → POST Turso
            → db.query (tracks) → POST Turso
            → POST suspense-cache (write back)
```
Cache cold. Two DB queries, writes fresh data back.

**4. Dynamic — /talks/[id]** (~20ms)
```
render route → db.query (talk + speaker + track + room) → start response
```
DB every request. No caching.

**Show in terminal:**
```bash
sentry trace list sentry-developer-experience/nextjs-conf-scheduler --limit 5
sentry trace view sentry-developer-experience/nextjs-conf-scheduler/<trace-id>
```

**Expected:** Each route type has a visually distinct trace shape.

---

## Module 04: Metrics & Dashboards

**Live in terminal:**
```bash
# Create dashboard
sentry dashboard create sentry-developer-experience/nextjs-conf-scheduler "Workshop Demo"

# Note the dashboard ID from output, then:
sentry dashboard widget add sentry-developer-experience <ID> "Page Views" -d bar --dataset spans -q count
sentry dashboard widget add sentry-developer-experience <ID> "Auth Events" -d line --dataset logs -q count -w "message:auth*"
sentry dashboard widget add sentry-developer-experience <ID> "Cache Misses" -d line --dataset logs -q count -w "message:cache.miss"

# View in terminal
sentry dashboard view sentry-developer-experience <ID>
```

**Then open the dashboard URL in browser** — same data, web UI.

**Expected:** Dashboard created in 30 seconds from CLI with live charts.

---

## Module 05: Alerts

**Show in Sentry UI → Monitors & Alerts → Create Monitor:**
1. Dataset: Logs
2. Query: `message:auth.login` (filter for failure results)
3. Threshold: count > 5 in 5 minutes
4. Action: email

**Talking point:** "The metric told you how often. The alert fires on threshold. The log tells you who and why. The trace tells you where. Each signal, one job."

**Bonus:** Mention `ai.message.sent` with `message_count > 10` as an alert for stuck AI conversations — client-side log linked to server-side trace via conversation ID.

**Expected:** Monitor created, attendees understand the full flow: alert → logs → trace → root cause.

---

## Key CLI commands (keep a terminal tab open)

```bash
# Logs
sentry log list sentry-developer-experience/nextjs-conf-scheduler --limit 10
sentry log list sentry-developer-experience/nextjs-conf-scheduler -f  # live tail

# Traces
sentry trace list sentry-developer-experience/nextjs-conf-scheduler --limit 5
sentry trace view sentry-developer-experience/nextjs-conf-scheduler/<trace-id>
sentry trace logs sentry-developer-experience/nextjs-conf-scheduler/<trace-id>

# Dashboard
sentry dashboard list sentry-developer-experience
sentry dashboard view sentry-developer-experience <dashboard-id>
```

---

## Pre-show checklist

- [ ] App running at https://nextjs-conf-scheduler.sentry.dev
- [ ] Run `pnpm traffic https://nextjs-conf-scheduler.sentry.dev` for fresh data
- [ ] `sentry auth status` — authenticated
- [ ] Browser tabs: App, Sentry Logs, Sentry Performance, Sentry Metrics
- [ ] Terminal: sentry CLI ready
- [ ] Font size 18-20px in editor and terminal
