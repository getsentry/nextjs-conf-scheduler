/**
 * Backfills realistic AI scheduler telemetry directly into Sentry.
 *
 * This uses Sentry's envelope ingest endpoint so dashboards can show a full 7-day history
 * without replaying thousands of browser sessions or paying for real model calls.
 *
 * Usage:
 *   SENTRY_BACKFILL_DSN=https://public@o123.ingest.us.sentry.io/456 pnpm sentry:backfill
 *   pnpm sentry:backfill -- --days=7 --events-per-day=24 --dsn=https://...
 */

import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);

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
  const parsed = Number.parseInt(flagValue(name) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DSN = flagValue(
  "--dsn",
  process.env.SENTRY_BACKFILL_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
);
const DAYS = intFlag("--days", 7);
const EVENTS_PER_DAY = intFlag("--events-per-day", 24);
const DRY_RUN = args.includes("--dry-run");
const ENVIRONMENT = flagValue("--environment", "production") ?? "production";

if (!DSN) {
  console.error("Set SENTRY_BACKFILL_DSN or pass --dsn=https://public@host/projectId");
  process.exit(1);
}

const SENTRY_DSN = DSN;

type Persona = {
  name: string;
  email: string;
  tier: "guest" | "member";
  internal: boolean;
  weight: number;
};

const PERSONAS: Persona[] = [
  {
    name: "Nadia Roman",
    email: "nadia.roman@sentry.io",
    tier: "member",
    internal: true,
    weight: 18,
  },
  {
    name: "Noemi Costa",
    email: "noemi.costa@sentry.io",
    tier: "member",
    internal: true,
    weight: 16,
  },
  {
    name: "Eli Nakamura",
    email: "eli.nakamura@sentry.io",
    tier: "member",
    internal: true,
    weight: 14,
  },
  {
    name: "Marina Sokolov",
    email: "marina.sokolov@sentry.io",
    tier: "member",
    internal: true,
    weight: 12,
  },
  {
    name: "Priya Raman",
    email: "priya.raman@arize.com",
    tier: "member",
    internal: false,
    weight: 5,
  },
  { name: "Ethan Lee", email: "ethan.lee@vercel.com", tier: "member", internal: false, weight: 4 },
  {
    name: "Maya Chen",
    email: "maya.chen@anthropic.com",
    tier: "member",
    internal: false,
    weight: 4,
  },
  {
    name: "Jordan Smith",
    email: "jordan.smith@modal.com",
    tier: "member",
    internal: false,
    weight: 4,
  },
  {
    name: "Samir Patel",
    email: "samir.patel@langchain.com",
    tier: "member",
    internal: false,
    weight: 3,
  },
  {
    name: "Olivia Hart",
    email: "olivia.hart@cohere.com",
    tier: "member",
    internal: false,
    weight: 3,
  },
  { name: "Guest West Hall", email: "guest-west-hall", tier: "guest", internal: false, weight: 5 },
  { name: "Guest Workshop", email: "guest-workshop", tier: "guest", internal: false, weight: 4 },
];

const MODELS = [
  {
    id: "anthropic/claude-sonnet-4.6",
    response: "claude-sonnet-4-6",
    provider: "anthropic",
    memberOnly: true,
    weight: 9,
    costPer1k: 0.015,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    response: "claude-haiku-4-5",
    provider: "anthropic",
    memberOnly: true,
    weight: 7,
    costPer1k: 0.004,
  },
  {
    id: "anthropic/claude-opus-4.8",
    response: "claude-opus-4-8",
    provider: "anthropic",
    memberOnly: true,
    weight: 3,
    costPer1k: 0.055,
  },
  {
    id: "openai/gpt-oss-120b",
    response: "accounts/fireworks/models/gpt-oss-120b",
    provider: "openai",
    memberOnly: false,
    weight: 6,
    costPer1k: 0.0007,
  },
  {
    id: "openai/gpt-oss-20b",
    response: "openai/gpt-oss-20b",
    provider: "openai",
    memberOnly: false,
    weight: 8,
    costPer1k: 0.0002,
  },
  {
    id: "deepseek/deepseek-v3.2",
    response: "deepseek-v4-flash",
    provider: "deepseek",
    memberOnly: false,
    weight: 5,
    costPer1k: 0.00035,
  },
  {
    id: "mistral/devstral-2",
    response: "devstral-2512",
    provider: "mistral",
    memberOnly: false,
    weight: 4,
    costPer1k: 0.00045,
  },
  {
    id: "alibaba/qwen-3-235b",
    response: "qwen3-235b-a22b",
    provider: "alibaba",
    memberOnly: false,
    weight: 4,
    costPer1k: 0.00055,
  },
];

const TOOLS = ["searchTalks", "getTalkDetails", "getTracks", "checkConflicts", "getUserSchedule"];
const PROMPT_IDS = [
  "sentry-talks",
  "agents-production",
  "evals-observability",
  "beginner-workshops",
];
const OUTCOMES = [
  "allowed",
  "allowed",
  "allowed",
  "allowed",
  "allowed",
  "rate_limited",
  "stream_error",
];

function weighted<T extends { weight: number }>(items: T[], seed: number) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = seed % total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return items[0];
}

function hex(bytes: number) {
  return randomBytes(bytes).toString("hex");
}

function stableId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function numericSeed(...parts: Array<string | number>) {
  return Number.parseInt(
    createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 8),
    16,
  );
}

function attr(value: string | number | boolean) {
  if (typeof value === "string") return { type: "string", value };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (Number.isInteger(value)) return { type: "integer", value };
  return { type: "double", value };
}

function attrs(values: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key, attr(value)]),
  );
}

function parseDsn(dsn: string) {
  const parsed = new URL(dsn);
  const publicKey = parsed.username;
  const projectId = parsed.pathname.replace(/^\//, "");
  if (!publicKey || !projectId) throw new Error("Invalid Sentry DSN");
  return {
    dsn,
    publicKey,
    projectId,
    envelopeUrl: `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7&sentry_client=worldfair-backfill/1.0`,
  };
}

function metric(
  timestamp: number,
  traceId: string,
  name: string,
  type: "counter" | "distribution",
  value: number,
  attributes: Record<string, string | number | boolean | undefined>,
  unit = "none",
) {
  return {
    timestamp,
    trace_id: traceId,
    name,
    type,
    unit,
    value,
    attributes: attrs({
      ...attributes,
      "sentry.environment": ENVIRONMENT,
      "sentry.sdk.name": "worldfair-backfill",
      "sentry.sdk.version": "1.0",
    }),
  };
}

function logItem(
  timestamp: number,
  traceId: string,
  message: string,
  attributes: Record<string, string | number | boolean | undefined>,
  level: "info" | "warn" | "error" = "info",
) {
  return {
    timestamp,
    level,
    body: message,
    trace_id: traceId,
    severity_number: level === "error" ? 17 : level === "warn" ? 13 : 9,
    attributes: attrs({
      ...attributes,
      "sentry.environment": ENVIRONMENT,
      "sentry.sdk.name": "worldfair-backfill",
      "sentry.sdk.version": "1.0",
    }),
  };
}

function span({
  data,
  description,
  duration,
  op,
  parentSpanId,
  start,
  status = "ok",
  traceId,
}: {
  traceId: string;
  parentSpanId: string;
  op: string;
  description: string;
  start: number;
  duration: number;
  status?: "ok" | "error" | "internal_error";
  data: Record<string, string | number | boolean | undefined>;
}) {
  return {
    trace_id: traceId,
    span_id: hex(8),
    parent_span_id: parentSpanId,
    op,
    description,
    start_timestamp: start,
    timestamp: start + duration,
    status,
    data: {
      ...data,
      "sentry.origin": "manual.worldfair.backfill",
    },
  };
}

function makeEvent(timestamp: number, sequence: number) {
  const seed = numericSeed(timestamp, sequence);
  const persona = weighted(PERSONAS, seed);
  const modelPool = MODELS.filter((model) => persona.tier === "member" || !model.memberOnly);
  const model = weighted(modelPool, seed >> 3);
  const outcome = OUTCOMES[seed % OUTCOMES.length];
  const isRateLimited = persona.tier === "guest" && outcome === "rate_limited";
  const isStreamError = outcome === "stream_error" && seed % 5 === 0;
  const inputTokens = 450 + (seed % 4200) + (persona.internal ? 3600 : 0);
  const outputTokens =
    180 +
    ((seed >> 4) % 1400) +
    (model.provider === "anthropic" ? 350 : 0) +
    (persona.internal ? 900 : 0);
  const totalTokens = inputTokens + outputTokens;
  const cost = Number(((totalTokens / 1000) * model.costPer1k).toFixed(8));
  const duration = 1.2 + ((seed >> 5) % 90) / 10;
  const traceId = hex(16);
  const rootSpanId = hex(8);
  const conversationId = `wf-${stableId(`${persona.email}:${timestamp}:${sequence}`)}`;
  const identityType = persona.tier === "guest" ? "guest" : "user";
  const userEmail = persona.tier === "guest" ? undefined : persona.email;
  const baseAttrs = {
    ai_tier: persona.tier,
    identity_type: identityType,
    is_internal_sentry: persona.internal,
    user_email: userEmail,
  };

  const spans = [
    span({
      traceId,
      parentSpanId: rootSpanId,
      op: "gen_ai.invoke_agent",
      description: "conference-scheduler.schedule",
      start: timestamp + 0.05,
      duration,
      status: isStreamError ? "internal_error" : "ok",
      data: {
        "gen_ai.operation.type": "agent",
        "gen_ai.agent.name": "conference-scheduler",
        "gen_ai.request.model": model.id,
        "gen_ai.response.model": model.response,
        "gen_ai.conversation.id": conversationId,
      },
    }),
    span({
      traceId,
      parentSpanId: rootSpanId,
      op: "gen_ai.generate_content",
      description: model.id,
      start: timestamp + 0.2,
      duration: Math.max(0.4, duration - 0.3),
      status: isStreamError ? "internal_error" : "ok",
      data: {
        "gen_ai.operation.type": "ai_client",
        "gen_ai.request.model": model.id,
        "gen_ai.response.model": model.response,
        "gen_ai.system": model.provider,
        "gen_ai.usage.input_tokens": inputTokens,
        "gen_ai.usage.output_tokens": outputTokens,
        "gen_ai.usage.total_tokens": totalTokens,
        "gen_ai.cost.total_tokens": cost,
        "gen_ai.conversation.id": conversationId,
        ai_tier: persona.tier,
        identity_type: identityType,
        user_email: userEmail,
      },
    }),
  ];

  if (seed % 3 !== 0) {
    const embeddingTokens = 18 + (seed % 60);
    spans.push(
      span({
        traceId,
        parentSpanId: rootSpanId,
        op: "gen_ai.embed",
        description: "alibaba/qwen3-embedding-0.6b",
        start: timestamp + 0.12,
        duration: 0.18 + (seed % 20) / 100,
        data: {
          "gen_ai.operation.type": "ai_client",
          "gen_ai.request.model": "alibaba/qwen3-embedding-0.6b",
          "gen_ai.response.model": "alibaba/qwen3-embedding-0.6b",
          "gen_ai.system": "alibaba",
          "gen_ai.usage.input_tokens": embeddingTokens,
          "gen_ai.usage.total_tokens": embeddingTokens,
          "gen_ai.cost.total_tokens": Number((embeddingTokens * 0.00000004).toFixed(8)),
          "embedding.operation": "query",
        },
      }),
    );
  }

  const toolCount = 1 + (seed % 4);
  for (let i = 0; i < toolCount; i++) {
    const toolName = TOOLS[(seed + i) % TOOLS.length];
    const toolError = persona.internal && toolName === "searchTalks" && seed % 11 === 0;
    spans.push(
      span({
        traceId,
        parentSpanId: rootSpanId,
        op: "gen_ai.execute_tool",
        description: toolName,
        start: timestamp + 0.35 + i * 0.18,
        duration: 0.08 + ((seed >> i) % 12) / 100,
        status: toolError ? "error" : "ok",
        data: {
          "gen_ai.operation.type": "tool",
          "gen_ai.tool.name": toolName,
          "gen_ai.conversation.id": conversationId,
        },
      }),
    );
  }

  const event = {
    event_id: hex(16),
    type: "transaction",
    transaction: "POST /api/ai/chat",
    start_timestamp: timestamp,
    timestamp: timestamp + duration + 0.4,
    platform: "javascript",
    environment: ENVIRONMENT,
    user:
      persona.tier === "guest"
        ? { id: `guest_${stableId(persona.email)}` }
        : { id: stableId(persona.email), email: persona.email, username: persona.name },
    tags: {
      "ai.tier": persona.tier,
      "ai.identity_type": identityType,
      "ai.internal_sentry": String(persona.internal),
    },
    contexts: {
      trace: {
        trace_id: traceId,
        span_id: rootSpanId,
        op: "http.server",
        status: isStreamError ? "internal_error" : "ok",
      },
    },
    spans,
  };

  const metrics = [
    metric(timestamp, traceId, "ai.chat.requests", "counter", 1, {
      ...baseAttrs,
      outcome: isRateLimited ? "rate_limited" : isStreamError ? "stream_error" : "allowed",
    }),
    metric(
      timestamp,
      traceId,
      "ai.tokens.total",
      "distribution",
      totalTokens,
      { ...baseAttrs, model_id: model.id },
      "token",
    ),
    metric(
      timestamp,
      traceId,
      "ai.tokens.input",
      "distribution",
      inputTokens,
      { ...baseAttrs, model_id: model.id },
      "token",
    ),
    metric(
      timestamp,
      traceId,
      "ai.tokens.output",
      "distribution",
      outputTokens,
      { ...baseAttrs, model_id: model.id },
      "token",
    ),
    metric(timestamp, traceId, "ai.prompt.selected", "counter", 1, {
      prompt_id: PROMPT_IDS[seed % PROMPT_IDS.length],
      page_path:
        seed % 2 === 0 ? "/" : "/talks/aiewf-543-from-vibes-to-production-evaluating-and-shipping",
    }),
  ];

  if (isRateLimited) {
    metrics.push(metric(timestamp, traceId, "ai.rate_limited", "counter", 1, baseAttrs));
  }

  if (seed % 3 !== 0) {
    metrics.push(
      metric(timestamp, traceId, "ai.embedding.requests", "counter", 1, {
        ...baseAttrs,
        operation: "query",
      }),
      metric(
        timestamp,
        traceId,
        "ai.embedding.tokens",
        "distribution",
        40 + (seed % 80),
        { ...baseAttrs, operation: "query" },
        "token",
      ),
    );
  }

  const logs = [
    logItem(timestamp, traceId, "AI model usage recorded", {
      action: "ai.usage",
      result: "success",
      model_id: model.id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      ...baseAttrs,
    }),
    logItem(
      timestamp,
      traceId,
      "AI chat request completed",
      {
        action: "ai.chat",
        result: isRateLimited ? "rate_limited" : isStreamError ? "stream_error" : "success",
        model_id: model.id,
        duration_ms: Math.round(duration * 1000),
        ...baseAttrs,
      },
      isStreamError ? "error" : isRateLimited ? "warn" : "info",
    ),
  ];

  return { event, logs, metrics };
}

function envelope({ event, logs, metrics }: ReturnType<typeof makeEvent>) {
  const dsn = parseDsn(SENTRY_DSN);
  return [
    JSON.stringify({ dsn: dsn.dsn, sdk: { name: "worldfair-backfill", version: "1.0" } }),
    JSON.stringify({ type: "transaction" }),
    JSON.stringify(event),
    JSON.stringify({
      type: "trace_metric",
      item_count: metrics.length,
      content_type: "application/vnd.sentry.items.trace-metric+json",
    }),
    JSON.stringify({ version: 2, items: metrics }),
    JSON.stringify({
      type: "log",
      item_count: logs.length,
      content_type: "application/vnd.sentry.items.log+json",
    }),
    JSON.stringify({ version: 2, items: logs }),
  ].join("\n");
}

async function send(event: ReturnType<typeof makeEvent>) {
  const dsn = parseDsn(SENTRY_DSN);
  const response = await fetch(dsn.envelopeUrl, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body: envelope(event),
  });

  if (!response.ok) {
    throw new Error(`Sentry ingest failed: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const now = Date.now() / 1000;
  const start = now - DAYS * 24 * 60 * 60;
  const events = [];

  for (let day = 0; day < DAYS; day++) {
    for (let i = 0; i < EVENTS_PER_DAY; i++) {
      const dayStart = start + day * 24 * 60 * 60;
      const jitter = (numericSeed(day, i) % 1800) - 900;
      const timestamp = dayStart + ((i + 0.7) / EVENTS_PER_DAY) * 24 * 60 * 60 + jitter;
      events.push(makeEvent(timestamp, day * EVENTS_PER_DAY + i));
    }
  }

  console.log(
    `${DRY_RUN ? "Would send" : "Sending"} ${events.length} historical AI events over ${DAYS} days`,
  );

  if (DRY_RUN) {
    const sample = events[0];
    console.log(
      JSON.stringify(
        { event: sample.event, metrics: sample.metrics.slice(0, 2), logs: sample.logs },
        null,
        2,
      ),
    );
    return;
  }

  for (let i = 0; i < events.length; i += 5) {
    await Promise.all(events.slice(i, i + 5).map(send));
    console.log(`  sent ${Math.min(i + 5, events.length)}/${events.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
