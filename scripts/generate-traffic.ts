/**
 * Generates realistic traffic using headless browsers.
 * Real form submissions, real server actions, real AI requests, real Sentry telemetry.
 *
 * Usage:
 *   pnpm build && pnpm start                                   # terminal 1
 *   pnpm traffic                                                # baseline browsing/account/schedule telemetry
 *   pnpm traffic:ai                                             # baseline + AI dashboard telemetry
 *   pnpm traffic:ai https://aie-wf.sentry.dev --ai-rounds=24    # deployed target
 *   pnpm traffic https://aie-wf.sentry.dev --ai-only            # only AI/dashboard telemetry
 */

import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { type AiAccessTier, MODEL_OPTIONS } from "../lib/ai/models";
import { STOP_PROMPTING_TALK_ID } from "../lib/sentry-demo";

const args = process.argv.slice(2);

function flag(name: string) {
  return args.includes(name);
}

function flagValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

function intFlag(name: string, fallback: number) {
  const value = flagValue(name);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const VALUE_FLAGS = new Set(["--ai-rounds"]);
const positionalArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    if (!arg.includes("=") && VALUE_FLAGS.has(arg)) {
      i += 1;
    }
    continue;
  }
  positionalArgs.push(arg);
}

const BASE_URL = positionalArgs[0] || process.env.TRAFFIC_BASE_URL || "http://localhost:3000";
const RUN_AI_TRAFFIC = flag("--ai") || flag("--ai-only") || process.env.TRAFFIC_AI === "1";
const AI_ONLY = flag("--ai-only");
const AI_ROUNDS = intFlag(
  "--ai-rounds",
  Number.parseInt(process.env.TRAFFIC_AI_ROUNDS ?? "18", 10),
);
const RUN_RATE_LIMIT_DEMO = !flag("--no-rate-limit");
const EXTERNAL_USERS = [
  { name: "Priya Raman", email: "priya.raman@arize.com", password: "demo2026" },
  { name: "Ethan Lee", email: "ethan.lee@vercel.com", password: "demo2026" },
  { name: "Maya Chen", email: "maya.chen@anthropic.com", password: "demo2026" },
  { name: "Jordan Smith", email: "jordan.smith@modal.com", password: "demo2026" },
  { name: "Samir Patel", email: "samir.patel@langchain.com", password: "demo2026" },
  { name: "Olivia Hart", email: "olivia.hart@cohere.com", password: "demo2026" },
  { name: "Lucas Meyer", email: "lucas.meyer@huggingface.co", password: "demo2026" },
  { name: "Ava Brooks", email: "ava.brooks@replicate.com", password: "demo2026" },
];

const INTERNAL_USERS = [
  { name: "Nadia Roman", email: "nadia.roman@sentry.io", password: "demo2026" },
  { name: "Noemi Costa", email: "noemi.costa@sentry.io", password: "demo2026" },
];

const USERS = [...EXTERNAL_USERS, ...INTERNAL_USERS];

type TrafficUser = (typeof USERS)[number];

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

const EXAMPLE_PROMPTS = [
  "Are there any talks from Sentry",
  "Find sessions about agents in production",
  "Build me an evals + observability day",
  "Which beginner workshops are worth it?",
];

type AiScenario = {
  id: string;
  prompt: string;
  context?: {
    path: string;
    query?: string;
    title?: string;
  };
  authOnly?: boolean;
  internalOnly?: boolean;
};

const AI_SCENARIOS: AiScenario[] = [
  {
    id: "tracks-overview",
    prompt: "Use getTracks and give me a quick overview of the conference tracks.",
    context: { path: "/", title: "AI Engineer World's Fair Schedule" },
  },
  {
    id: "agent-production-search",
    prompt:
      "Find sessions about agents in production. Use searchTalks with about 8 results, then check conflicts for the strongest 3 recommendations.",
    context: { path: "/", query: "q=agents", title: "AI Engineer World's Fair Schedule" },
  },
  {
    id: "evals-observability",
    prompt:
      "Build an evals and observability day for me. Search broadly, recommend a few sessions, and check conflicts between them.",
    context: { path: "/", query: "q=evals", title: "AI Engineer World's Fair Schedule" },
  },
  {
    id: "specific-talk-details",
    prompt: `Use getTalkDetails for ${TALK_IDS[0]} and summarize who should attend it in one sentence.`,
    context: { path: `/talks/${TALK_IDS[0]}`, title: "Talk details" },
  },
  {
    id: "saved-schedule-audit",
    prompt:
      "What am I missing from my saved schedule? Use my schedule first, then search for complementary sessions.",
    context: { path: "/", query: "view=my-events", title: "My Events" },
    authOnly: true,
  },
  {
    id: "internal-sentry-demo-error",
    prompt: "Find Sentry talks and explain why they matter for observability demos.",
    context: { path: "/", query: "q=sentry", title: "AI Engineer World's Fair Schedule" },
    internalOnly: true,
  },
];

function pick<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function pickOne<T>(arr: T[], index: number): T {
  return arr[index % arr.length];
}

function modelIds(tier: AiAccessTier, ids: string[]) {
  const available = new Set(MODEL_OPTIONS[tier].map((model) => model.id));
  const selected = ids.filter((id) => available.has(id));
  return selected.length > 0 ? selected : MODEL_OPTIONS[tier].map((model) => model.id);
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

async function signup(page: Page, user: TrafficUser) {
  await page.goto(`${BASE_URL}/signup`, { waitUntil: "networkidle" });

  if (
    !(await page
      .locator('input[name="name"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false))
  ) {
    await logout(page);
    await page.goto(`${BASE_URL}/signup`, { waitUntil: "networkidle" });
  }

  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const onSignup = page.url().includes("/signup");
  log("[signup]", `${user.name} — ${onSignup ? "already exists" : "success"}`);
  await logout(page);
}

async function login(page: Page, user: TrafficUser) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

  const emailField = page.locator('input[name="email"]');
  if (!(await emailField.isVisible({ timeout: 5000 }).catch(() => false))) {
    log("[login]", `${user.name} — already signed in`);
    return true;
  }

  await emailField.fill(user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const success = !page.url().includes("/login");
  log("[login]", `${user.name} — ${success ? "success" : "failed"}`);
  return success;
}

async function ensureLoggedIn(page: Page, user: TrafficUser) {
  const success = await login(page, user);
  if (success) return true;

  await signup(page, user);
  return login(page, user);
}

async function mutateTalks(
  page: Page,
  user: TrafficUser,
  talkIds: string[],
  mutation: "add" | "remove",
) {
  if (!(await ensureLoggedIn(page, user))) {
    log("[skip]", `${user.name} — login failed, cannot mutate talks`);
    return;
  }

  const buttonNames =
    mutation === "add"
      ? ["Add to my events", "Add to my schedule"]
      : ["Remove from my events", "Remove from schedule"];
  for (const talkId of talkIds) {
    await page.goto(`${BASE_URL}/talks/${talkId}`, { waitUntil: "networkidle" });
    const button = page
      .getByRole("button")
      .filter({ hasText: new RegExp(buttonNames.join("|"), "i") })
      .first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(800);
      log("[schedule]", `${user.name} ${mutation === "add" ? "saved" : "removed"} ${talkId}`);
    } else {
      log("[schedule]", `${user.name} cannot ${mutation} ${talkId}`);
    }
  }

  await logout(page);
}

async function saveTalks(page: Page, user: TrafficUser, talkIds: string[]) {
  await mutateTalks(page, user, talkIds, "add");
}

async function removeTalks(page: Page, user: TrafficUser, talkIds: string[]) {
  await mutateTalks(page, user, talkIds, "remove");
}

async function clickAssistantPrompts(page: Page, userLabel: string) {
  await page.goto(`${BASE_URL}/?assistant=open`, { waitUntil: "networkidle" });

  for (const prompt of EXAMPLE_PROMPTS) {
    const promptButton = page.getByRole("button", { name: prompt });
    if (await promptButton.isVisible({ timeout: 4000 }).catch(() => false)) {
      await promptButton.click();
      log("[prompt]", `${userLabel} clicked “${prompt}”`);
      await page.waitForTimeout(350);
    }
  }
}

async function phase1PageViews(page: Page) {
  console.log("\n📊 Phase 1: Page views and navigation");

  for (let i = 0; i < 30; i++) {
    const path = i % 3 === 0 ? "/speakers" : i % 3 === 1 ? `/talks/${pickOne(TALK_IDS, i)}` : "/";
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500 + Math.random() * 1000);
    log("[view]", path);
  }
}

async function phase2Accounts(page: Page) {
  console.log("\n👥 Phase 2: Account signups and logins");

  for (const user of USERS) {
    await signup(page, user);
  }

  for (const user of pick(EXTERNAL_USERS, 5)) {
    await login(page, user);
    await logout(page);
  }
}

async function phase3ScheduleSaves(page: Page) {
  console.log("\n⭐ Phase 3: Schedule saves/removes");

  await saveTalks(page, EXTERNAL_USERS[0], TALK_IDS.slice(0, 4));
  await saveTalks(page, EXTERNAL_USERS[1], TALK_IDS.slice(3, 7));
  await saveTalks(page, EXTERNAL_USERS[2], pick(TALK_IDS, 4));
  await saveTalks(page, EXTERNAL_USERS[3], pick(TALK_IDS, 4));
  await removeTalks(page, EXTERNAL_USERS[0], TALK_IDS.slice(0, 2));

  // Intentional Sentry demo path: this talk throws for @sentry.io users.
  await saveTalks(page, INTERNAL_USERS[0], [STOP_PROMPTING_TALK_ID]);
}

async function phase4CacheTraffic(page: Page) {
  console.log("\n💾 Phase 4: Cache miss/refresh patterns");

  for (const path of ["/", "/speakers", "/", "/speakers"]) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    log("[cache]", path);
  }
}

type AiRuntimePersona = {
  label: string;
  page: Page;
  context: BrowserContext;
  tier: AiAccessTier;
  kind: "guest" | "user" | "internal";
  models: string[];
};

async function createAiPersona(
  browser: Browser,
  persona:
    | { kind: "guest"; label: string }
    | { kind: "user" | "internal"; label: string; user: TrafficUser },
): Promise<AiRuntimePersona> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  if (persona.kind === "guest") {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    return {
      label: persona.label,
      page,
      context,
      tier: "guest",
      kind: "guest",
      models: modelIds("guest", [
        "openai/gpt-oss-20b",
        "deepseek/deepseek-v3.2",
        "alibaba/qwen-3-235b",
        "meta/llama-4-maverick",
      ]),
    };
  }

  await ensureLoggedIn(page, persona.user);

  const models = modelIds("authenticated", [
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-opus-4.8",
    "openai/gpt-oss-120b",
    "mistral/devstral-2",
    "deepseek/deepseek-v3.2",
  ]);

  return {
    label: persona.label,
    page,
    context,
    tier: "authenticated",
    kind: persona.kind,
    models,
  };
}

function eligibleScenarios(persona: AiRuntimePersona) {
  return AI_SCENARIOS.filter((scenario) => {
    if (scenario.internalOnly) return persona.kind === "internal";
    if (scenario.authOnly) return persona.kind !== "guest";
    return true;
  });
}

async function postChat(
  persona: AiRuntimePersona,
  scenario: AiScenario,
  modelId: string,
  index: number,
) {
  const conversationId = `traffic-${persona.label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${index}-${randomUUID()}`;
  const started = Date.now();
  const response = await persona.page.request.post(`${BASE_URL}/api/ai/chat`, {
    headers: { "x-conversation-id": conversationId },
    data: {
      model: modelId,
      context: scenario.context ?? { path: "/", title: "AI Engineer World's Fair Schedule" },
      messages: [
        {
          id: randomUUID(),
          role: "user",
          parts: [{ type: "text", text: scenario.prompt }],
        },
      ],
    },
    timeout: 120_000,
  });

  const body = await response.text().catch(() => "");
  const duration = Date.now() - started;
  const shortBody = body.replace(/\s+/g, " ").slice(0, 100);
  log(
    "[ai]",
    `${persona.label} · ${scenario.id} · ${modelId} → ${response.status()} in ${duration}ms${
      response.ok() ? "" : ` · ${shortBody}`
    }`,
  );
}

async function phase5AiDashboardTraffic(browser: Browser) {
  console.log("\n🤖 Phase 5: AI dashboard traffic");

  const setupContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const setupPage = await setupContext.newPage();
  for (const user of [...EXTERNAL_USERS.slice(0, 3), ...INTERNAL_USERS]) {
    await signup(setupPage, user);
  }
  await saveTalks(setupPage, EXTERNAL_USERS[0], TALK_IDS.slice(0, 3));
  await saveTalks(setupPage, EXTERNAL_USERS[1], TALK_IDS.slice(3, 6));
  await saveTalks(setupPage, INTERNAL_USERS[1], TALK_IDS.slice(6, 9));
  await setupContext.close();

  const personas = await Promise.all([
    createAiPersona(browser, { kind: "guest", label: "guest-west-hall" }),
    createAiPersona(browser, { kind: "guest", label: "guest-workshop" }),
    createAiPersona(browser, { kind: "user", label: "alice", user: EXTERNAL_USERS[0] }),
    createAiPersona(browser, { kind: "user", label: "bob", user: EXTERNAL_USERS[1] }),
    createAiPersona(browser, { kind: "internal", label: "sentry-ivy", user: INTERNAL_USERS[0] }),
    createAiPersona(browser, { kind: "internal", label: "sentry-sergiy", user: INTERNAL_USERS[1] }),
  ]);

  try {
    await clickAssistantPrompts(personas[0].page, personas[0].label);
    await clickAssistantPrompts(personas[2].page, personas[2].label);

    for (let i = 0; i < AI_ROUNDS; i++) {
      const persona = pickOne(personas, i);
      const scenarios = eligibleScenarios(persona);
      const scenario = pickOne(scenarios, i + Math.floor(i / personas.length));
      const modelId = pickOne(persona.models, i);
      await postChat(persona, scenario, modelId, i);
      await persona.page.waitForTimeout(500 + Math.random() * 800);
    }

    if (RUN_RATE_LIMIT_DEMO) {
      const guest = personas.find((persona) => persona.kind === "guest");
      if (guest) {
        const quotaScenario: AiScenario = {
          id: "guest-quota-pressure",
          prompt: "Give me one short beginner-friendly recommendation.",
          context: { path: "/", title: "AI Engineer World's Fair Schedule" },
        };
        const cheapModel = guest.models[0];
        for (let i = 0; i < 12; i++) {
          await postChat(guest, quotaScenario, cheapModel, AI_ROUNDS + i);
          await guest.page.waitForTimeout(250);
        }
      }
    }
  } finally {
    await Promise.all(personas.map((persona) => persona.context.close()));
  }
}

async function main() {
  console.log(`🚀 Generating traffic for ${BASE_URL}`);
  console.log(`   AI traffic: ${RUN_AI_TRAFFIC ? `enabled (${AI_ROUNDS} rounds)` : "disabled"}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    if (!AI_ONLY) {
      await phase1PageViews(page);
      await phase2Accounts(page);
      await phase3ScheduleSaves(page);
      await phase4CacheTraffic(page);
    }

    if (RUN_AI_TRAFFIC) {
      await phase5AiDashboardTraffic(browser);
    }

    console.log("\n✅ Traffic generation complete!");
  } catch (error) {
    console.error("\n❌ Traffic generation failed:", error);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
