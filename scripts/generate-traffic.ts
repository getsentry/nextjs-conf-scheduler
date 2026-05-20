/**
 * Generates realistic traffic against the running app to populate Sentry
 * with traces, logs, cache behavior, and metrics from multiple users.
 *
 * Usage:
 *   pnpm build && pnpm start   # terminal 1 (caching only works in prod mode)
 *   pnpm traffic               # terminal 2
 *   pnpm traffic https://your-app.vercel.app   # or against deployed app
 */

import { hash } from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import * as dotenv from "dotenv";
import { users, userSchedules } from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

const BASE_URL = process.argv[2] || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const TALK_IDS = [
  "coding-future", "composition-caching", "nextjs-ai-agents",
  "clankers-content", "course-platform", "reactive-state",
  "ambient-agents", "integrated-ai", "dx-ai-age",
  "turbo-yet", "type-safe-url", "consent-banner",
  "bun-speed", "open-web", "closing-keynote",
  "aws-ai-workshop", "nextjs16-migration",
];

const SPEAKER_IDS = [
  "aryaman", "fouad", "swyx", "aurora", "jude", "simeon",
  "ankita", "rhys", "fred", "ryan", "bryce", "luke",
];

const TEST_USERS = [
  { id: "user-alice", name: "Alice Chen", email: "alice@workshop.test" },
  { id: "user-bob", name: "Bob Martinez", email: "bob@workshop.test" },
  { id: "user-carol", name: "Carol Williams", email: "carol@workshop.test" },
  { id: "user-dave", name: "Dave Kim", email: "dave@workshop.test" },
  { id: "user-eve", name: "Eve Johnson", email: "eve@workshop.test" },
  { id: "user-frank", name: "Frank Liu", email: "frank@workshop.test" },
  { id: "user-grace", name: "Grace Park", email: "grace@workshop.test" },
  { id: "user-henry", name: "Henry Brown", email: "henry@workshop.test" },
];

async function mintSession(userId: string): Promise<string> {
  const encodedKey = new TextEncoder().encode(JWT_SECRET);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new SignJWT({ userId, expiresAt: expiresAt.toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

async function createTestUsers() {
  const password = await hash("workshop2025", 10);
  const result = [];

  for (const user of TEST_USERS) {
    await db.delete(users).where(eq(users.id, user.id));
    await db.insert(users).values({
      ...user,
      password,
      createdAt: Date.now(),
    });
    const session = await mintSession(user.id);
    result.push({ ...user, session });
  }

  return result;
}

function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function fetchPage(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = `session=${cookie}`;

  const start = Date.now();
  const res = await fetch(`${BASE_URL}${url}`, { headers, redirect: "follow" });
  const ms = Date.now() - start;
  await res.text();
  return { url, status: res.status, ms };
}

function log(prefix: string, msg: string) {
  console.log(`  ${prefix.padEnd(20)} ${msg}`);
}

// ─── Phase 1: Anonymous traffic ──────────────────────────────────────────────

async function phase1_anonymous() {
  console.log("\n── Phase 1: Anonymous traffic (no session) ──");
  console.log("   These requests hit cached data. First request = cache MISS, rest = cache HIT.\n");

  const pages = ["/", "/speakers", "/workshop", "/talks/coding-future", "/speakers/swyx"];

  for (const page of pages) {
    const { status, ms } = await fetchPage(page);
    log(`[anon]`, `${status} ${page} (${ms}ms)`);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n   Hitting cached pages again — should be faster (cache HIT):\n");

  for (const page of ["/", "/speakers"]) {
    const { status, ms } = await fetchPage(page);
    log(`[anon][cache-hit]`, `${status} ${page} (${ms}ms)`);
  }

  console.log("\n   Trying protected pages without auth (triggers proxy.redirect logs):\n");

  for (const page of ["/my-schedule", "/ai-builder"]) {
    const { status, ms } = await fetchPage(page);
    log(`[anon][redirect]`, `${status} ${page} (${ms}ms)`);
  }
}

// ─── Phase 2: Authenticated traffic ──────────────────────────────────────────

async function phase2_authenticated(testUsers: Awaited<ReturnType<typeof createTestUsers>>) {
  console.log("\n── Phase 2: Authenticated traffic (8 users) ──");
  console.log("   Each user browses pages, bookmarks talks, visits their schedule.\n");

  for (const user of testUsers) {
    console.log(`\n   ${user.name} (${user.email})`);

    // Browse public pages (cache HITs — data was cached in phase 1)
    const publicPages = pick(
      ["/", "/speakers", ...pick(SPEAKER_IDS, 2).map((id) => `/speakers/${id}`)],
      3,
    );
    for (const page of publicPages) {
      const { status, ms } = await fetchPage(page, user.session);
      log(`[${user.name}]`, `${status} ${page} (${ms}ms)`);
      await new Promise((r) => setTimeout(r, 200));
    }

    // Browse talk pages (dynamic — auth check + DB)
    const talkPages = pick(TALK_IDS, 3).map((id) => `/talks/${id}`);
    for (const page of talkPages) {
      const { status, ms } = await fetchPage(page, user.session);
      log(`[${user.name}]`, `${status} ${page} (${ms}ms)`);
      await new Promise((r) => setTimeout(r, 200));
    }

    // Bookmark talks (direct DB insert)
    const bookmarks = pick(TALK_IDS, 2 + Math.floor(Math.random() * 3));
    for (const talkId of bookmarks) {
      try {
        await db.insert(userSchedules).values({
          userId: user.id,
          talkId,
          addedAt: Math.floor(Date.now() / 1000),
        });
      } catch {
        // duplicate
      }
    }
    log(`[${user.name}]`, `bookmarked ${bookmarks.length} talks`);

    // Visit my-schedule (dynamic — always fresh, user-specific)
    const { status, ms } = await fetchPage("/my-schedule", user.session);
    log(`[${user.name}]`, `${status} /my-schedule (${ms}ms) — always dynamic`);
  }
}

// ─── Phase 3: OG image traffic ───────────────────────────────────────────────

async function phase3_ogImages() {
  console.log("\n── Phase 3: OG image generation ──");
  console.log("   Each request generates a dynamic image with Sentry tracing.\n");

  for (const talkId of pick(TALK_IDS, 4)) {
    const { status, ms } = await fetchPage(`/talks/${talkId}/opengraph-image`);
    log(`[og]`, `${status} /talks/${talkId}/opengraph-image (${ms}ms)`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ─── Phase 4: Cache comparison ───────────────────────────────────────────────

async function phase4_cacheComparison() {
  console.log("\n── Phase 4: Cache HIT vs MISS comparison ──");
  console.log("   Rapid-fire the same pages to show timing difference.\n");

  for (const page of ["/", "/speakers"]) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const { ms } = await fetchPage(page);
      times.push(ms);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const first = times[0];
    const rest = Math.round(times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1));
    log(`[cache]`, `${page}: first=${first}ms, avg_rest=${rest}ms (${times.join(", ")}ms)`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Generating traffic against ${BASE_URL}`);

  try {
    await fetch(BASE_URL);
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Start the server first: pnpm build && pnpm start`);
    process.exit(1);
  }

  console.log(`Creating ${TEST_USERS.length} test users...`);
  const testUsers = await createTestUsers();
  console.log(`Done.`);

  await phase1_anonymous();
  await phase2_authenticated(testUsers);
  await phase3_ogImages();
  await phase4_cacheComparison();

  console.log("\n✓ Done! Check Sentry for:");
  console.log("  - Logs: filter by message (auth.login, cache.miss, proxy.redirect, og.image)");
  console.log("  - Metrics: page.view counter grouped by path, browser, authenticated");
  console.log("  - Metrics: cache.miss counter — compare with page.view for hit rate");
  console.log("  - Traces: compare cached page traces (short) vs dynamic page traces (long)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
