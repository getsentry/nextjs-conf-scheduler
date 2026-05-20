/**
 * Generates realistic traffic using headless browsers.
 * Real form submissions, real server actions, real Sentry telemetry.
 *
 * Usage:
 *   pnpm build && pnpm start                              # terminal 1
 *   pnpm traffic                                           # terminal 2
 *   pnpm traffic https://nextjs-conf-scheduler.sentry.dev  # or deployed
 */

import { chromium, type Page } from "playwright";

const BASE_URL = process.argv[2] || "http://localhost:3000";

const USERS = [
  { name: "Alice Chen", email: "alice@workshop.test", password: "workshop2025" },
  { name: "Bob Martinez", email: "bob@workshop.test", password: "workshop2025" },
  { name: "Carol Williams", email: "carol@workshop.test", password: "workshop2025" },
  { name: "Dave Kim", email: "dave@workshop.test", password: "workshop2025" },
  { name: "Eve Johnson", email: "eve@workshop.test", password: "workshop2025" },
  { name: "Frank Liu", email: "frank@workshop.test", password: "workshop2025" },
  { name: "Grace Park", email: "grace@workshop.test", password: "workshop2025" },
  { name: "Henry Brown", email: "henry@workshop.test", password: "workshop2025" },
];

const TALK_IDS = [
  "coding-future", "composition-caching", "nextjs-ai-agents",
  "clankers-content", "course-platform", "reactive-state",
  "ambient-agents", "integrated-ai", "dx-ai-age",
  "turbo-yet", "type-safe-url", "consent-banner",
  "bun-speed", "open-web", "closing-keynote",
];

function pick<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function log(prefix: string, msg: string) {
  console.log(`  ${prefix.padEnd(22)} ${msg}`);
}

async function logout(page: Page) {
  const logoutBtn = page.locator('button:has-text("Sign Out")');
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.context().clearCookies();
}

// ─── Phase 1: Anonymous browsing ─────────────────────────────────────────────

async function phase1(page: Page) {
  console.log("\n── Phase 1: Anonymous browsing ──\n");

  for (const path of ["/", "/speakers", "/workshop"]) {
    const start = Date.now();
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `${path} (${Date.now() - start}ms)`);
  }

  for (const id of pick(["swyx", "aurora", "rhys"], 2)) {
    const start = Date.now();
    await page.goto(`${BASE_URL}/speakers/${id}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `/speakers/${id} (${Date.now() - start}ms)`);
  }

  for (const id of pick(TALK_IDS, 3)) {
    const start = Date.now();
    await page.goto(`${BASE_URL}/talks/${id}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `/talks/${id} (${Date.now() - start}ms)`);
  }

  // Try protected pages — should redirect to login (proxy.redirect logs)
  console.log("");
  for (const path of ["/my-schedule", "/ai-builder"]) {
    const start = Date.now();
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    log("[anon][redirect]", `${path} → ${new URL(page.url()).pathname} (${Date.now() - start}ms)`);
  }
}

// ─── Phase 2: Signup + Login ─────────────────────────────────────────────────

async function phase2(page: Page) {
  console.log("\n── Phase 2: Signup & Login (auth telemetry) ──\n");

  for (const user of USERS) {
    // Try signup
    await page.goto(`${BASE_URL}/signup`, { waitUntil: "networkidle" });
    await page.fill('input[name="name"]', user.name);
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const onSignup = page.url().includes("/signup");
    log(`[signup]`, `${user.name} — ${onSignup ? "already exists" : "success"}`);
    await logout(page);

    // Log in
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    log(`[login]`, `${user.name} — ${page.url().includes("/login") ? "failed" : "success"}`);
    await logout(page);
  }

  // Generate some failed logins
  console.log("");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "nobody@workshop.test");
  await page.fill('input[name="password"]', "wrongpassword");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  log("[login][fail]", "nobody@workshop.test — user not found");

  await page.fill('input[name="email"]', USERS[0].email);
  await page.fill('input[name="password"]', "wrongpassword");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  log("[login][fail]", `${USERS[0].email} — invalid password`);
}

// ─── Phase 3: Authenticated browsing + bookmarks ─────────────────────────────

async function phase3(page: Page) {
  console.log("\n── Phase 3: Authenticated browsing + bookmarks ──\n");

  for (const user of USERS.slice(0, 4)) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    if (page.url().includes("/login")) {
      log("[skip]", `${user.name} — login failed, skipping`);
      continue;
    }

    console.log(`\n  ${user.name}:`);

    for (const path of pick(["/", "/speakers", "/speakers/swyx", "/speakers/aurora"], 2)) {
      const start = Date.now();
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      log("[browse]", `${path} (${Date.now() - start}ms)`);
    }

    for (const talkId of pick(TALK_IDS, 3)) {
      const start = Date.now();
      await page.goto(`${BASE_URL}/talks/${talkId}`, { waitUntil: "domcontentloaded" });
      log("[talk]", `/talks/${talkId} (${Date.now() - start}ms)`);

      const addBtn = page.locator('button:has-text("Add")').first();
      if (await addBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(1500);
        log("[bookmark]", `+ ${talkId}`);
      }
    }

    const start = Date.now();
    await page.goto(`${BASE_URL}/my-schedule`, { waitUntil: "domcontentloaded" });
    log("[schedule]", `/my-schedule (${Date.now() - start}ms)`);

    await logout(page);
  }
}

// ─── Phase 4: Cache comparison ───────────────────────────────────────────────

async function phase4(page: Page) {
  console.log("\n── Phase 4: Cache HIT vs MISS comparison ──\n");

  for (const path of ["/", "/speakers"]) {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      times.push(Date.now() - start);
    }
    const first = times[0];
    const rest = Math.round(times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1));
    log("[cache]", `${path}: first=${first}ms, avg_cached=${rest}ms`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Generating traffic against ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { timeout: 10000 });
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Is the server running?`);
    await browser.close();
    process.exit(1);
  }

  await phase1(page);
  await phase2(page);
  await phase3(page);
  await phase4(page);

  await browser.close();

  console.log("\n✓ Done! Check Sentry for:");
  console.log("  - Logs: auth.signup, auth.login, schedule.add, proxy.redirect, cache.miss");
  console.log("  - Metrics: page.view (by path/browser/auth), cache.miss (by cache_key)");
  console.log("  - Traces: compare cached vs dynamic page waterfalls");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
