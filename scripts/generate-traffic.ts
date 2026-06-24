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
  { name: "Alice Chen", email: "alice@demo.test", password: "demo2026" },
  { name: "Bob Martinez", email: "bob@demo.test", password: "demo2026" },
  { name: "Carol Williams", email: "carol@demo.test", password: "demo2026" },
  { name: "Dave Kim", email: "dave@demo.test", password: "demo2026" },
  { name: "Eve Johnson", email: "eve@demo.test", password: "demo2026" },
  { name: "Frank Liu", email: "frank@demo.test", password: "demo2026" },
  { name: "Grace Park", email: "grace@demo.test", password: "demo2026" },
  { name: "Henry Brown", email: "henry@demo.test", password: "demo2026" },
];

const TALK_IDS = [
  "aiewf-543-from-vibes-to-production-evaluating-and-shipping",
  "aiewf-549-intro-to-graphrag",
  "aiewf-555-cooking-with-codex",
  "aiewf-571-total-recall-agent-memory-and-harness-engineerin",
  "aiewf-577-agents-that-own-their-inference-building-product",
  "aiewf-588-advanced-workshop-mastering-ai-observability",
  "aiewf-545-evals-in-ai-a-deep-dive",
  "aiewf-568-from-zero-to-leaderboard-building-an-end-to-end-",
  "aiewf-579-beyond-rag-build-a-relational-context-engine-fro",
  "aiewf-585-building-ai-agents-with-real-time-web-data",
  "aiewf-589-agent-speedrun-idea-code-deploy-observe-fix-ship",
  "aiewf-546-the-cheat-sheet-get-evals-up-and-running-in-minu",
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

  for (const path of ["/", "/speakers"]) {
    const start = Date.now();
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `${path} (${Date.now() - start}ms)`);
  }

  for (const id of pick(["spk_addy_osmani", "spk_aaron_francis", "spk_abdul_dakkak"], 2)) {
    const start = Date.now();
    await page.goto(`${BASE_URL}/speakers/${id}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `/speakers/${id} (${Date.now() - start}ms)`);
  }

  for (const id of pick(TALK_IDS, 3)) {
    const start = Date.now();
    await page.goto(`${BASE_URL}/talks/${id}`, { waitUntil: "domcontentloaded" });
    log("[anon]", `/talks/${id} (${Date.now() - start}ms)`);
  }

  const aiStart = Date.now();
  await page.goto(`${BASE_URL}/?assistant=open`, { waitUntil: "domcontentloaded" });
  log("[anon][ai]", `/?assistant=open (${Date.now() - aiStart}ms)`);

  // Try saved-events view — should redirect to login.
  console.log("");
  const start = Date.now();
  await page.goto(`${BASE_URL}/?view=my-events`, { waitUntil: "domcontentloaded" });
  log(
    "[anon][redirect]",
    `/?view=my-events → ${new URL(page.url()).pathname} (${Date.now() - start}ms)`,
  );
}

// ─── Phase 2: Signup + Login ─────────────────────────────────────────────────

async function phase2(page: Page) {
  console.log("\n── Phase 2: Signup & Login (account telemetry) ──\n");

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
  await page.fill('input[name="email"]', "nobody@demo.test");
  await page.fill('input[name="password"]', "wrongpassword");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  log("[login][fail]", "nobody@demo.test — user not found");

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

    for (const path of pick(
      ["/", "/speakers", "/speakers/spk_addy_osmani", "/speakers/spk_aaron_francis"],
      2,
    )) {
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
    await page.goto(`${BASE_URL}/?view=my-events`, { waitUntil: "domcontentloaded" });
    log("[schedule]", `/?view=my-events (${Date.now() - start}ms)`);

    await logout(page);
  }
}

// ─── Phase 4: Route type comparison ─────────────────────────────────────────

async function phase4(page: Page) {
  console.log("\n── Phase 4: Cached vs Dynamic comparison ──\n");

  console.log("  Cached (remote cache hit/miss):");
  for (const path of ["/", "/speakers"]) {
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      log("[cached]", `${path} (${Date.now() - start}ms)`);
    }
  }

  console.log("\n  Dynamic (DB every request):");
  for (const id of pick(TALK_IDS, 3)) {
    const start = Date.now();
    await page.goto(`${BASE_URL}/talks/${id}`, { waitUntil: "domcontentloaded" });
    log("[dynamic]", `/talks/${id} (${Date.now() - start}ms)`);
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
  console.log("  - Logs: account.signup, account.login, schedule.add, proxy.redirect, cache.miss");
  console.log("  - Metrics: page.view (by path/browser/signed_in), cache.miss (by cache_key)");
  console.log("  - Traces: compare cached vs dynamic page waterfalls");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
