/**
 * Generates realistic traffic against the running app to populate Sentry
 * with traces, logs, and cache behavior from multiple users.
 *
 * Usage:
 *   1. Start the dev server: pnpm dev
 *   2. Run: npx tsx scripts/generate-traffic.ts
 *   3. Optionally pass the base URL: npx tsx scripts/generate-traffic.ts https://your-app.vercel.app
 */

import { hash } from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { SignJWT } from "jose";
import * as dotenv from "dotenv";
import { users, userSchedules } from "../lib/db/schema";
import { eq } from "drizzle-orm";

dotenv.config({ path: ".env.local" });

const BASE_URL = process.argv[2] || "http://localhost:3000";
const NUM_USERS = 8;
const JWT_SECRET = process.env.JWT_SECRET;

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const TALK_IDS = [
  "coding-future",
  "composition-caching",
  "nextjs-ai-agents",
  "clankers-content",
  "course-platform",
  "reactive-state",
  "ambient-agents",
  "integrated-ai",
  "dx-ai-age",
  "turbo-yet",
  "type-safe-url",
  "consent-banner",
  "bun-speed",
  "open-web",
  "closing-keynote",
  "aws-ai-workshop",
  "nextjs16-migration",
];

const SPEAKER_IDS = [
  "aryaman", "fouad", "swyx", "aurora", "jude", "simeon",
  "ankita", "rhys", "fred", "ryan", "bryce", "luke",
];

const PAGES = [
  "/",
  "/speakers",
  "/workshop",
  ...SPEAKER_IDS.slice(0, 6).map((id) => `/speakers/${id}`),
  ...TALK_IDS.slice(0, 8).map((id) => `/talks/${id}`),
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
  const testUsers = [];
  for (let i = 1; i <= NUM_USERS; i++) {
    const id = `test-user-${i}`;
    const email = `user${i}@workshop.test`;
    const password = await hash("workshop2025", 10);

    await db.delete(users).where(eq(users.id, id));
    await db.insert(users).values({
      id,
      email,
      name: `Workshop User ${i}`,
      password,
      createdAt: Date.now(),
    });

    const session = await mintSession(id);
    testUsers.push({ id, email, session });
  }
  return testUsers;
}

function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function fetchPage(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = `session=${cookie}`;

  const start = Date.now();
  const res = await fetch(`${BASE_URL}${url}`, { headers, redirect: "follow" });
  const ms = Date.now() - start;
  const status = res.status;
  // consume body
  await res.text();
  return { url, status, ms };
}

async function simulateUser(user: { id: string; session: string }, userNum: number) {
  console.log(`  [User ${userNum}] Browsing pages...`);

  // Browse random pages
  const pagesToVisit = pick(PAGES, 4 + Math.floor(Math.random() * 4));
  for (const page of pagesToVisit) {
    const { status, ms } = await fetchPage(page, user.session);
    console.log(`    ${status} ${page} (${ms}ms)`);
    // Small delay between requests
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 500));
  }

  // Visit protected pages (my-schedule, ai-builder)
  console.log(`  [User ${userNum}] Visiting protected pages...`);
  for (const page of ["/my-schedule", "/ai-builder"]) {
    const { status, ms } = await fetchPage(page, user.session);
    console.log(`    ${status} ${page} (${ms}ms)`);
  }

  // Bookmark some talks by inserting directly into DB
  // (server actions need Next.js runtime, but DB inserts trigger
  //  the same data that will appear in traces on next page load)
  const talksToBookmark = pick(TALK_IDS, 2 + Math.floor(Math.random() * 4));
  console.log(`  [User ${userNum}] Bookmarking ${talksToBookmark.length} talks...`);
  for (const talkId of talksToBookmark) {
    try {
      await db.insert(userSchedules).values({
        userId: user.id,
        talkId,
        addedAt: Math.floor(Date.now() / 1000),
      });
    } catch {
      // duplicate, ignore
    }
  }

  // Revisit my-schedule to trigger trace with schedule data
  await fetchPage("/my-schedule", user.session);

  // Visit talk detail pages for OG image generation traces
  const ogTalks = pick(TALK_IDS, 2);
  console.log(`  [User ${userNum}] Triggering OG images...`);
  for (const talkId of ogTalks) {
    const { status, ms } = await fetchPage(`/talks/${talkId}/opengraph-image`, user.session);
    console.log(`    ${status} /talks/${talkId}/opengraph-image (${ms}ms)`);
  }
}

async function simulateUnauthenticatedTraffic() {
  console.log("\n[Unauthenticated] Browsing public pages...");
  for (const page of ["/", "/speakers", "/workshop", "/talks/coding-future"]) {
    const { status, ms } = await fetchPage(page);
    console.log(`  ${status} ${page} (${ms}ms)`);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Try protected pages without auth (triggers proxy redirect logs)
  console.log("[Unauthenticated] Hitting protected pages (should redirect)...");
  for (const page of ["/my-schedule", "/ai-builder"]) {
    const { status, ms } = await fetchPage(page);
    console.log(`  ${status} ${page} (${ms}ms)`);
  }
}

async function main() {
  console.log(`Generating traffic against ${BASE_URL}\n`);

  // Verify the app is running
  try {
    await fetch(BASE_URL);
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Is the dev server running? (pnpm dev)`);
    process.exit(1);
  }

  // Create test users
  console.log(`Creating ${NUM_USERS} test users...`);
  const testUsers = await createTestUsers();
  console.log(`Created ${testUsers.length} users\n`);

  // Unauthenticated traffic first (cache miss on first hit)
  await simulateUnauthenticatedTraffic();

  // Simulate each user
  for (let i = 0; i < testUsers.length; i++) {
    console.log(`\n[User ${i + 1}] ${testUsers[i].email}`);
    await simulateUser(testUsers[i], i + 1);
  }

  // Final cache-hit verification: hit pages again
  console.log("\n[Cache check] Re-hitting cached pages...");
  for (const page of ["/", "/speakers"]) {
    const { status, ms } = await fetchPage(page);
    console.log(`  ${status} ${page} (${ms}ms) — should be faster (cache hit)`);
  }

  console.log("\n✓ Done! Check Sentry for traces, logs, and cache behavior.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
