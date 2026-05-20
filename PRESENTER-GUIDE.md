# Presenter Guide — Debugging Next.js Workshop

A complete run-of-show for delivering the 1-hour Sentry workshop. Pair this with `WORKSHOP.md` for learner-facing content.

---

## Pre-Workshop Checklist

Run through this **30 minutes before** go-live:

- [ ] `pnpm install` — deps are up to date
- [ ] `.env.local` contains `NEXT_PUBLIC_SENTRY_DSN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`
- [ ] `pnpm db:push && pnpm db:seed` — DB has fresh data
- [ ] `pnpm build` — no build errors on `main`
- [ ] All module branches exist locally: `git branch | grep module`
  - `module-1-start` through `module-5-start`
- [ ] Sentry dashboard is open — **clear any stale issues** so new ones are obvious
- [ ] Browser tabs ready:
  1. App at `localhost:3000`
  2. Sentry Issues view
  3. Sentry Performance view
  4. Sentry Logs view (for Module 3+)
  4b. Sentry Metrics view (for Module 3+)
  5. Sentry AI Insights view (for Module 5)
- [ ] Editor open with file tree visible
- [ ] Screen share set to **editor + browser** layout
- [ ] Font size bumped to 18-20px in editor and terminal

---

## Timing Table (60 min)

| Time | Duration | Section | Branch | Key Action |
|------|----------|---------|--------|------------|
| 0:00 | 5 min | Intro + Sentry Setup Walkthrough | `main` | Walk through existing Sentry config, explain the stack |
| 0:05 | 10 min | Module 1: Error Capture | `module-1-start` | Trigger hydration error, fix theme provider |
| 0:15 | 10 min | Module 2: Tracing | `module-2-start` | Wrap server actions, show named traces |
| 0:25 | 10 min | Module 3: Logs & Metrics | `module-3-start` | Enable logs, add wide events + metrics |
| 0:35 | 10 min | Module 4: DB Tracing | `module-4-start` | Add libsql integration, show query spans |
| 0:45 | 12 min | Module 5: AI Monitoring | `module-5-start` | Add vercelAI integration + experimental_telemetry |
| 0:57 | 3 min | Wrap-up | — | Recap, resources, Q&A |

**Buffer rule:** If a module runs long, steal from Module 5 (it's the most skippable). If you're ahead, add more Sentry dashboard exploration.

---

## Per-Module Script

### Intro + Sentry Setup Walkthrough (0:00 — 0:05)

**Branch:** `main`

**Demo flow:**
1. Show the running app — browse talks, view a speaker page
2. "This is a Next.js 16 app with Drizzle, Turso, and Vercel AI SDK"
3. "Sentry is already configured — let me show you how"
4. Open `next.config.ts` — show `withSentryConfig` wrapping the config (source maps, tunnel route)
5. Open `instrumentation.ts` — show `register()` loading server/edge configs + `onRequestError`
6. Open `sentry.server.config.ts` — show `Sentry.init()` with DSN, tracing, logs, integrations
7. "This is the fully wired-up version. Each module starts with a gap — one capability removed — and you'll add it back"

**Talking points:**
- Sentry was added with `npx @sentry/wizard@latest -i nextjs` — the wizard sets up all config files
- `withSentryConfig` handles source maps and the tunnel route (bypasses ad-blockers)
- `instrumentation.ts` is the Next.js hook for initializing server-side code
- `onRequestError` automatically captures server errors
- Each module branch strips out one capability so you can learn it hands-on

---

### Module 1: Error Capture — Hydration Errors (0:05 — 0:15)

**Branch:**
```bash
git checkout module-1-start
pnpm dev
```

**Demo flow:**
1. Open app → click the theme toggle to dark mode
2. **Refresh the page** → show the hydration error in the browser console
3. Switch to Sentry → find the hydration error in Issues
4. Walk through the error details — "Sentry caught this automatically — server rendered Sun, client rendered Moon"
5. Open `components/theme-provider.tsx` — show the broken code reading `localStorage` during SSR
6. Open `components/theme-toggle.tsx` — show the conditional rendering that causes the mismatch
7. **Write the fix:** Replace theme-provider with `next-themes`, update toggle to use CSS-based icon switching
8. Open `app/layout.tsx` — wrap children with `<ThemeProvider>`, add `suppressHydrationWarning`
9. Refresh → toggle theme → no error
10. Switch to Sentry → "The issue is resolved"

**Talking points:**
- Sentry captures React errors automatically — no manual try/catch needed
- Hydration errors are one of the most common Next.js bugs
- The error detail in Sentry shows exactly what mismatched (Sun vs Moon icon)
- The fix is two-part: use `next-themes` for SSR-safe theme state, and use CSS (not conditional rendering) to toggle icons

**Files touched:**
- `components/theme-provider.tsx`
- `components/theme-toggle.tsx`
- `app/layout.tsx`

---

### Module 2: Tracing Server Actions (0:15 — 0:25)

**Branch:**
```bash
git checkout module-2-start
pnpm dev
```

**Demo flow:**
1. Log in → add a talk to your schedule
2. Open Sentry Performance → "Where's the trace? It's anonymous."
3. Open `lib/actions/schedule.ts`
4. **Write the fix:** Wrap with `Sentry.withServerActionInstrumentation()`
   - Name: `"schedule.addToSchedule"`
   - Pass `headers: await headers()` for distributed tracing
5. Do the same for `lib/actions/auth.ts` (login/signup)
6. Add a talk again → check Sentry Performance
7. **Show the trace waterfall:** browser → server action → database

**Talking points:**
- Server actions are invisible by default — you must instrument them
- `headers()` connects the browser span to the server span (distributed tracing)
- Named actions make it easy to filter and alert on specific operations

**Files touched:**
- `lib/actions/schedule.ts`
- `lib/actions/auth.ts`

---

### Module 3: Structured Logs & Metrics (0:25 — 0:35)

**Branch:**
```bash
git checkout module-3-start
pnpm dev
```

**Demo flow:**
1. "We have errors and traces — but what about the context inside an operation?"
2. Open `sentry.server.config.ts` → add `enableLogs: true`
3. Do the same for `instrumentation-client.ts` and `sentry.edge.config.ts`
4. Open `lib/actions/schedule.ts` → add a `Sentry.logger.info()` call with structured attributes:
   - `talk_id`, `user_id`, `duration_ms`, `action`
5. **Then add metrics alongside the logs:**
   - `Sentry.metrics.increment("schedule_add_success")` — counter for the event
   - `Sentry.metrics.distribution("schedule_operation_duration", ...)` — duration distribution
6. Do the same for auth actions (counters for login/signup success/failure, distribution for duration)
7. Perform some actions → switch to Sentry Logs view
8. **Show filtering:** filter by `action: "add_to_schedule"`, filter by `user_id`
9. Switch to Sentry Metrics view → **show the counters and duration distribution**
10. "Logs tell you *what happened* to a specific request. Metrics tell you *how often* and *how fast* across all requests."

**Talking points:**
- **Logs vs Metrics vs Exceptions decision framework:**
  - Exception: something is broken → fix it
  - Log: you need context about a specific request (who, what, why)
  - Metric: you need to count or measure something over time (rate, p95)
- Wide events: pack all context into one log entry so you can query any dimension
- `Sentry.logger` gives you structured attributes, not just strings
- Logs are correlated with traces — click through from log to trace
- `Sentry.metrics.increment()` for countable events, `.distribution()` for durations
- Rule of thumb: if you'd alert on a *count* or *percentile*, use a metric; if you'd search for a *specific request*, use a log

**Files touched:**
- `sentry.server.config.ts`
- `instrumentation-client.ts`
- `sentry.edge.config.ts`
- `lib/actions/schedule.ts`
- `lib/actions/auth.ts`

---

### Module 4: Database Tracing with Turso (0:35 — 0:45)

**Branch:**
```bash
git checkout module-4-start
pnpm dev
```

**Demo flow:**
1. Navigate around — view talks, view a speaker page
2. Open Sentry Performance → open a trace → "No `db.query` spans — just `http.client` POST to Turso"
3. "Why? Two problems: the client is a module-level singleton, and Next.js bundles this file twice"
4. Open `lib/db/index.ts` → explain the `let _client` pattern
5. **Fix 1:** Change to `globalThis` singleton — "Now both bundles share the same client instance"
6. Open `next.config.ts` → **Fix 2:** Add `serverExternalPackages: ["@libsql/client"]` — "This tells Next.js not to bundle this module, so there's truly one copy"
7. Open `sentry.server.config.ts` → **Fix 3:** Add the inline `libsqlIntegration` function + `getClient` import
8. Walk through the integration: "It's just monkey-patching `client.execute` with `Sentry.startSpan` — we set `db.system`, `db.statement`, and use the SQL as the span name"
9. Navigate around again → open a trace
10. **Show the `db.query` spans** in the waterfall — SQL statement as name, `db.system: sqlite`, timing
11. "Now you can spot slow queries without adding any logging to your Drizzle code"

**Talking points:**
- **Why `globalThis`:** Next.js creates separate bundles for `instrumentation.ts` and page handlers. Module-level `let _client` creates TWO clients — the integration patches one, queries run on the other. `globalThis` ensures both bundles share the same instance.
- **Why `serverExternalPackages`:** Without it, the bundler inlines `@libsql/client` into each bundle, defeating the `globalThis` sharing. Externalizing it means Node.js loads one copy.
- **Writing a Sentry integration is simple:** Just `startSpan` with the right OTel attributes (`db.system`, `db.statement`). No complex SDK internals needed.
- The integration auto-instruments every query — zero changes to your ORM code
- `getClient()` lazily creates the client at runtime, avoiding build-time errors (env vars not available during `next build`)

**Files touched:**
- `lib/db/index.ts`
- `next.config.ts`
- `sentry.server.config.ts`

---

### Module 5: AI Agent Monitoring (0:45 — 0:57)

**Branch:**
```bash
git checkout module-5-start
pnpm dev
```

**Demo flow:**
1. Log in → open AI Builder
2. Ask: "What AI talks are available?"
3. Check Sentry → "No AI visibility"
4. Open `sentry.server.config.ts` → add `vercelAIIntegration()`
5. Open `lib/ai/agents.ts` → add `experimental_telemetry: { isEnabled: true }` to all 3 AI SDK calls:
   - `generateText` in `routeRequest()`
   - `streamText` in `executeSearchAgent()`
   - `streamText` in `executeInfoAgent()`
6. "That's it — no manual spans needed. The integration + telemetry flag auto-instruments everything."
7. Ask the AI another question → check Sentry
8. **Show AI Insights** — LLM call spans, tool execution spans, token usage
9. **Show the trace** — full path from HTTP request → LLM → tool → DB
10. "Notice the tool execution spans appeared automatically — no `Sentry.startSpan` wrappers in `tools.ts`"

**Talking points:**
- `vercelAIIntegration()` + `experimental_telemetry: { isEnabled: true }` = full auto-instrumentation
- LLM calls, tool executions, and streaming are all captured automatically
- No need to manually wrap every tool with `Sentry.startSpan` — the integration does it for you
- The pipeline-level `Sentry.startSpan` in `route.ts` is still useful for custom business context
- AI Insights dashboard gives you aggregate metrics across all AI usage

**Files touched:**
- `sentry.server.config.ts`
- `lib/ai/agents.ts`

---

### Wrap-up (0:57 — 1:00)

**Demo flow:**
1. Switch back to Sentry — show the full picture:
   - Issues: errors caught automatically
   - Performance: traces with named server actions + DB spans
   - Logs: structured wide events
   - Metrics: counters and duration distributions
   - AI Insights: auto-instrumented LLM and tool monitoring
2. "We started with the Sentry SDK configured, and in 50 minutes added error capture, tracing, logs, metrics, DB visibility, and AI monitoring"
3. Share resources (link to `WORKSHOP.md` and Sentry docs)

---

## Risk Mitigation

| Risk | Symptom | Fallback |
|------|---------|----------|
| Sentry event delay | Events don't appear in dashboard after action | Say "Sentry events can take 5-10 seconds." Move on, come back to show it later. Have a pre-captured screenshot ready. |
| Branch has conflicts | `git checkout module-X-start` fails | Run `git stash` first. If still broken, have the repo re-cloned in a backup directory. |
| Missing env vars | Build or runtime error about undefined vars | Keep a `.env.local.backup` file. Copy it in: `cp .env.local.backup .env.local` |
| OpenAI key missing/expired | Module 5 AI chat fails | Show the code changes and Sentry config without live AI. Use a pre-recorded clip of the AI trace. |
| DB not seeded | Empty talk list | Run `pnpm db:push && pnpm db:seed` live — it takes <10 seconds. |
| Running over time | Module 4 starts after 0:40 | Skip Module 4 live demo, show a pre-captured trace screenshot. Jump to Module 5 or wrap up early. |
| Dev server crashes | White screen or terminal error | Kill and restart: `pnpm dev`. If persistent, switch to backup directory. |
| Sentry rate limit | 429 errors in console | Lower `tracesSampleRate` to `0.5`. Events will still flow, just sampled. |

---

## Dry Run Practice Order

Practice the workshop in three passes:

### Pass 1: Silent Walkthrough (30 min)
- Go through every module branch checkout, code edit, and Sentry verification
- Focus on **muscle memory**: which files to open, what to type, where to look in Sentry
- Time each module — identify which ones run long
- Fix any issues (missing deps, broken branches, stale DB)

### Pass 2: Narrated Run (50 min)
- Do the full workshop talking out loud as if presenting
- Practice transitions between modules ("Now that we can see errors, let's trace where requests go")
- Practice the Sentry dashboard navigation — know exactly which tab, which filter
- Record your per-module times and adjust pacing

### Pass 3: Recorded Dress Rehearsal (60 min)
- Screen record the full session with OBS or QuickTime
- Watch it back — look for:
  - Dead air while waiting for Sentry events
  - Fumbling with file navigation
  - Unclear explanations
  - Pacing issues (too fast on easy parts, too slow on hard parts)
- Create backup screenshots from this recording for risk mitigation

**Between passes:** Reset the environment:
```bash
git checkout main
pnpm db:push && pnpm db:seed
# Clear Sentry issues if needed
```
