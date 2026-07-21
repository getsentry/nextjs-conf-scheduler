/**
 * Export AI assistant conversations from Sentry into Braintrust.
 *
 * Extract  — Sentry Events API (via the `sentry` CLI, which handles auth),
 *            reading raw gen_ai spans grouped by gen_ai.conversation.id.
 *            Raw spans are untruncated, unlike the Sentry MCP's 4000-char view.
 * Assemble — stitch spans into conversations: first user input, final answer,
 *            tool results (retrieved talk ids), token/cost/thrash telemetry.
 * Load     — Braintrust logs (one trace per conversation, so Topics can
 *            cluster them) + a dataset for offline evals. Dataset rows upsert
 *            on conversation id, so re-runs never duplicate.
 *
 * Usage: pnpm evals:export [--period 30d] [--limit 25] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { flush, initDataset, initLogger } from "braintrust";
import * as dotenv from "dotenv";
import { loadCanonEntities } from "../evals/lib/entities";
import { classifyCitations } from "../evals/lib/grounding";

dotenv.config({ path: ".env.local" });

const SENTRY_ORG = process.env.SENTRY_ORG ?? "sentry-developer-experience";
const SENTRY_PROJECT_ID = process.env.SENTRY_PROJECT_ID ?? "4511423001919488";
const BRAINTRUST_PROJECT = process.env.BRAINTRUST_PROJECT ?? "nextjs-conf-scheduler";
const BRAINTRUST_DATASET = process.env.BRAINTRUST_DATASET ?? "prod-conversations";

const SPAN_FIELDS = [
  "id",
  "span.op",
  "span.status",
  "span.duration",
  "timestamp",
  "trace",
  "gen_ai.conversation.id",
  "gen_ai.request.model",
  "gen_ai.usage.total_tokens",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.cost.total_tokens",
  "gen_ai.tool.name",
  "gen_ai.tool.call.arguments",
  "gen_ai.request.messages",
  "gen_ai.response.text",
];

interface SentrySpan {
  id: string;
  "span.op": string;
  "span.status"?: string;
  "span.duration"?: number;
  timestamp: string;
  trace: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.request.model"?: string;
  "gen_ai.usage.total_tokens"?: number;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.cost.total_tokens"?: number;
  "gen_ai.tool.name"?: string;
  "gen_ai.tool.call.arguments"?: string;
  "gen_ai.request.messages"?: string;
  "gen_ai.response.text"?: string;
}

interface Conversation {
  id: string;
  input: string;
  output: string;
  model: string;
  totalTokens: number;
  totalCostUsd: number;
  aiCallCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  retrievedTalkIds: string[];
  retrievedTalkTitles: string[];
  toolNames: string[];
  traceIds: string[];
  startTime: number;
  endTime: number;
  tags: string[];
  spans: SentrySpan[];
}

function sentryApi<T>(path: string): T {
  const raw = execFileSync("sentry", ["api", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw) as T;
}

function eventsQuery(params: Record<string, string | string[]>): string {
  const search = new URLSearchParams();
  search.set("dataset", "spans");
  search.set("project", SENTRY_PROJECT_ID);
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      search.append(key, v);
    }
  }
  return `/api/0/organizations/${SENTRY_ORG}/events/?${search.toString()}`;
}

function listConversationIds(period: string, limit: number): string[] {
  const ids: string[] = [];
  let offset = 0;
  // Pages are capped at 100 rows; follow offset cursors so --limit > 100 works.
  while (ids.length < limit) {
    const perPage = Math.min(limit - ids.length, 100);
    const path = eventsQuery({
      statsPeriod: period,
      query: "has:gen_ai.conversation.id",
      field: ["gen_ai.conversation.id", "sum(gen_ai.usage.total_tokens)"],
      sort: "-sum(gen_ai.usage.total_tokens)",
      per_page: String(perPage),
      cursor: `0:${offset}:0`,
    });
    const page = sentryApi<{ data: Array<Record<string, unknown>> }>(path).data;
    ids.push(...page.map((row) => String(row["gen_ai.conversation.id"] ?? "")).filter(Boolean));
    offset += page.length;
    if (page.length < perPage) break;
  }
  return ids.slice(0, limit);
}

function fetchConversationSpans(conversationId: string, period: string): SentrySpan[] {
  const spans: SentrySpan[] = [];
  // Follow offset cursors: long conversations exceed one page, and dropping
  // the tail loses tool results and the real final answer.
  for (let offset = 0; ; offset += 100) {
    const path = eventsQuery({
      statsPeriod: period,
      query: `gen_ai.conversation.id:${conversationId}`,
      field: SPAN_FIELDS,
      sort: "timestamp",
      per_page: "100",
      cursor: `0:${offset}:0`,
    });
    const page = sentryApi<{ data: SentrySpan[] }>(path).data;
    spans.push(...page);
    if (page.length < 100) return spans;
  }
}

/**
 * Smoke tests and seeded dashboard data are noise. Real app conversations use
 * conv_* ids; simulated-user traffic (scripts/generate-traffic.ts) uses
 * traffic-<persona>-* ids and is worth evaluating like real usage.
 */
function isNoise(conversationId: string): boolean {
  const real = conversationId.startsWith("conv_") || conversationId.startsWith("traffic-");
  return !real || conversationId.startsWith("conv_seed_") || conversationId.includes("smoketest");
}

/** Extract plain text from gen_ai.response.text, which may be a UIMessage-style JSON array. */
function responseToText(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .flatMap((m) => (Array.isArray(m.parts) ? m.parts : []))
        .filter((p) => p.type === "text")
        .map((p) => p.content ?? p.text ?? "")
        .join("\n");
    }
  } catch {
    // Not JSON — already plain text.
  }
  return raw;
}

interface ParsedMessages {
  firstUserInput: string;
  retrievedTalkIds: string[];
  retrievedTalkTitles: string[];
}

/**
 * Parse request.messages payloads for the user input and tool-result talks.
 *
 * Captures both ids and titles: titles are what the assistant cites, and they
 * let scorers separate hallucination (cited nowhere) from data drift (cited
 * from tool results that no longer match the re-seeded DB).
 *
 * Tries every payload (fullest first) and merges results: very large payloads
 * can be clipped mid-JSON at ingest, so a single-payload parse would silently
 * drop the whole conversation.
 */
function parseMessages(spans: SentrySpan[]): ParsedMessages {
  const payloads = spans
    .map((s) => s["gen_ai.request.messages"])
    .filter((raw): raw is string => Boolean(raw))
    .sort((a, b) => b.length - a.length);
  const result: ParsedMessages = {
    firstUserInput: "",
    retrievedTalkIds: [],
    retrievedTalkTitles: [],
  };

  for (const raw of payloads) {
    let messages: Array<{ role: string; content: unknown }>;
    try {
      messages = JSON.parse(raw);
    } catch {
      continue; // Clipped at ingest — try the next payload.
    }
    if (!Array.isArray(messages)) continue; // Clipped to valid-but-wrong JSON.
    for (const message of messages) {
      // Anthropic-style messages use content parts; open models log plain strings.
      const content = Array.isArray(message.content) ? message.content : [];
      if (message.role === "user" && !result.firstUserInput) {
        result.firstUserInput =
          typeof message.content === "string"
            ? message.content
            : content
                .filter((c: { type?: string }) => c.type === "text")
                .map((c: { text?: string }) => c.text ?? "")
                .join("\n");
      }
      if (message.role === "tool") {
        for (const part of content) {
          if (part.type !== "tool-result") continue;
          const output = part.output?.value;
          // getTalkDetails returns a single object; search/list tools return arrays.
          const values = Array.isArray(output) ? output : output ? [output] : [];
          for (const value of values) {
            if (value && typeof value === "object" && typeof value.id === "string") {
              result.retrievedTalkIds.push(value.id);
              // Talks carry `title`; tracks and rooms carry `name`.
              const label = typeof value.title === "string" ? value.title : value.name;
              if (typeof label === "string") result.retrievedTalkTitles.push(label);
            }
          }
        }
      }
    }
  }
  result.retrievedTalkIds = [...new Set(result.retrievedTalkIds)];
  result.retrievedTalkTitles = [...new Set(result.retrievedTalkTitles)];
  return result;
}

/** Label-free classification from telemetry alone. */
function classify(conv: Conversation): string[] {
  const tags: string[] = [];
  if (conv.totalTokens > 80_000 || conv.toolCallCount > 10) tags.push("thrash");
  if (conv.toolErrorCount > 0) tags.push("tool-error");
  if (conv.retrievedTalkIds.length > 0) tags.push("grounding-candidate");
  const toolArgs = conv.spans
    .filter((s) => s["span.op"] === "gen_ai.execute_tool")
    .map((s) => `${s["gen_ai.tool.name"]}:${s["gen_ai.tool.call.arguments"] ?? ""}`);
  if (new Set(toolArgs).size < toolArgs.length) tags.push("repeated-tool-call");
  if (tags.length === 0) tags.push("clean");
  return tags;
}

function assemble(conversationId: string, spans: SentrySpan[]): Conversation | null {
  // invoke_agent spans still carry request/response payloads worth parsing,
  // but metrics come from client-call spans only (see CLIENT_OPS).
  const chatSpans = spans.filter((s) =>
    ["gen_ai.generate_content", "gen_ai.chat", "gen_ai.invoke_agent"].includes(s["span.op"]),
  );
  const clientSpans = spans.filter((s) => CLIENT_OPS.has(s["span.op"]));
  const toolSpans = spans.filter((s) => s["span.op"] === "gen_ai.execute_tool");
  if (chatSpans.length === 0) return null;

  const { firstUserInput, retrievedTalkIds, retrievedTalkTitles } = parseMessages(chatSpans);
  const lastChat = [...chatSpans]
    .filter((s) => s["gen_ai.response.text"])
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .at(-1);
  const output = responseToText(lastChat?.["gen_ai.response.text"]);
  if (!firstUserInput || !output) return null;

  const timestamps = spans.map((s) => Date.parse(s.timestamp) / 1000);
  const conv: Conversation = {
    id: conversationId,
    input: firstUserInput,
    output,
    model: lastChat?.["gen_ai.request.model"] ?? "unknown",
    totalTokens: clientSpans.reduce((sum, s) => sum + (s["gen_ai.usage.total_tokens"] ?? 0), 0),
    totalCostUsd: clientSpans.reduce((sum, s) => sum + (s["gen_ai.cost.total_tokens"] ?? 0), 0),
    aiCallCount: clientSpans.length,
    toolCallCount: toolSpans.length,
    toolErrorCount: toolSpans.filter(
      (s) => s["span.status"] && s["span.status"] !== "ok" && s["span.status"] !== "unknown",
    ).length,
    retrievedTalkIds,
    retrievedTalkTitles,
    toolNames: [
      ...new Set(toolSpans.map((s) => s["gen_ai.tool.name"]).filter(Boolean)),
    ] as string[],
    traceIds: [...new Set(spans.map((s) => s.trace))],
    startTime: Math.min(...timestamps),
    endTime: Math.max(...timestamps),
    tags: [],
    spans,
  };
  conv.tags = classify(conv);
  return conv;
}

function sentryConversationUrl(conversationId: string): string {
  return `https://${SENTRY_ORG}.sentry.io/explore/conversations/${conversationId}/`;
}

/** Actual model-call spans. invoke_agent/ai.pipeline aggregate their children —
 * counting them double-counts every token and dollar. */
const CLIENT_OPS = new Set(["gen_ai.generate_content", "gen_ai.chat"]);

/** Compact per-LLM-call telemetry, replayed as spans in Braintrust evals. */
function llmSpanSummaries(conv: Conversation) {
  return conv.spans
    .filter((s) => CLIENT_OPS.has(s["span.op"]) || s["span.op"] === "gen_ai.execute_tool")
    .map((s) => ({
      type: s["span.op"] === "gen_ai.execute_tool" ? ("tool" as const) : ("llm" as const),
      name:
        s["span.op"] === "gen_ai.execute_tool"
          ? (s["gen_ai.tool.name"] ?? "tool")
          : (s["gen_ai.request.model"] ?? "llm"),
      start: Date.parse(s.timestamp) / 1000,
      duration_ms: s["span.duration"] ?? 0,
      input_tokens: s["gen_ai.usage.input_tokens"],
      output_tokens: s["gen_ai.usage.output_tokens"],
      total_tokens: s["gen_ai.usage.total_tokens"],
      cost_usd: s["gen_ai.cost.total_tokens"],
      status: s["span.status"],
    }));
}

function conversationMetadata(conv: Conversation): Record<string, unknown> {
  return {
    conversation_id: conv.id,
    model: conv.model,
    total_tokens: conv.totalTokens,
    cost_usd: Number(conv.totalCostUsd.toFixed(6)),
    ai_calls: conv.aiCallCount,
    tool_calls: conv.toolCallCount,
    tool_errors: conv.toolErrorCount,
    tools: conv.toolNames,
    retrieved_talk_ids: conv.retrievedTalkIds,
    retrieved_talk_titles: conv.retrievedTalkTitles,
    trace_ids: conv.traceIds,
    sentry_url: sentryConversationUrl(conv.id),
  };
}

/** One Braintrust log trace per conversation, with llm/tool child spans, so Topics can cluster. */
function logConversation(logger: ReturnType<typeof initLogger>, conv: Conversation): void {
  const root = logger.startSpan({
    name: conv.input.slice(0, 80),
    type: "task",
    startTime: conv.startTime,
    event: {
      id: conv.id,
      input: conv.input,
      output: conv.output,
      metadata: conversationMetadata(conv),
      tags: conv.tags,
    },
  });
  for (const span of conv.spans) {
    const startTime = Date.parse(span.timestamp) / 1000;
    if (span["span.op"] === "gen_ai.execute_tool") {
      const failed = span["span.status"] && !["ok", "unknown"].includes(span["span.status"]);
      const child = root.startSpan({
        name: span["gen_ai.tool.name"] ?? "tool",
        type: "tool",
        startTime,
        event: {
          input: span["gen_ai.tool.call.arguments"],
          error: failed ? `tool failed (span.status: ${span["span.status"]})` : undefined,
        },
      });
      child.end({ endTime: startTime + (span["span.duration"] ?? 0) / 1000 });
    } else if (span["gen_ai.response.text"]) {
      const child = root.startSpan({
        name: span["gen_ai.request.model"] ?? "llm",
        type: "llm",
        startTime,
        event: {
          output: responseToText(span["gen_ai.response.text"]),
          metadata: { model: span["gen_ai.request.model"] },
          metrics: {
            prompt_tokens: span["gen_ai.usage.input_tokens"],
            completion_tokens: span["gen_ai.usage.output_tokens"],
            tokens: span["gen_ai.usage.total_tokens"],
          },
        },
      });
      child.end({ endTime: startTime + (span["span.duration"] ?? 0) / 1000 });
    }
  }
  root.end({ endTime: conv.endTime });
}

/** Resolve the Braintrust project id so dataset rows can reference their source logs. */
async function fetchBraintrustProjectId(): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://api.braintrust.dev/v1/project?project_name=${encodeURIComponent(BRAINTRUST_PROJECT)}`,
      { headers: { Authorization: `Bearer ${process.env.BRAINTRUST_API_KEY}` } },
    );
    const body = (await res.json()) as { objects?: Array<{ id: string }> };
    return body.objects?.[0]?.id;
  } catch {
    return undefined; // origin is a nice-to-have; never fail the export over it
  }
}

async function main() {
  const args = process.argv.slice(2);
  // A flag's value is the next token, unless it's missing or another flag.
  const flagValue = (flag: string): string | undefined => {
    const next = args.indexOf(flag) === -1 ? undefined : args[args.indexOf(flag) + 1];
    return next && !next.startsWith("--") ? next : undefined;
  };
  const period = flagValue("--period") ?? "30d";
  const limit = Number(flagValue("--limit") ?? 50);
  const dryRun = args.includes("--dry-run");

  console.log(`Scanning Sentry (${SENTRY_ORG}, project ${SENTRY_PROJECT_ID}, last ${period})…`);
  const ids = listConversationIds(period, limit);
  const realIds = ids.filter((id) => !isNoise(id));
  console.log(`Found ${ids.length} conversations; ${realIds.length} after noise filter.`);

  const conversations: Conversation[] = [];
  for (const id of realIds) {
    const spans = fetchConversationSpans(id, period);
    const conv = assemble(id, spans);
    if (conv) conversations.push(conv);
    else console.log(`  skipped ${id} (could not assemble input/output)`);
  }

  console.log(`Assembled ${conversations.length} conversations:`);
  for (const conv of conversations) {
    console.log(
      `  ${conv.id}  [${conv.tags.join(", ")}]  ${conv.totalTokens.toLocaleString()} tok, ` +
        `${conv.toolCallCount} tools, ${conv.retrievedTalkIds.length} talk ids — "${conv.input.slice(0, 60)}"`,
    );
  }
  if (dryRun) {
    console.log("Dry run — nothing sent to Braintrust.");
    return;
  }

  const logger = initLogger({ projectName: BRAINTRUST_PROJECT });
  const dataset = initDataset(BRAINTRUST_PROJECT, { dataset: BRAINTRUST_DATASET });
  const projectId = await fetchBraintrustProjectId();
  const canonTitles = await loadCanonEntities();

  for (const conv of conversations) {
    logConversation(logger, conv);

    // Verified-clean conversations become golden rows: the production answer
    // is promoted to `expected` after passing the deterministic grounding check.
    const verdicts = classifyCitations(conv.output, conv.input, {
      canonTitles,
      retrievedIds: conv.retrievedTalkIds,
      retrievedTitles: conv.retrievedTalkTitles,
    });
    const golden = verdicts.score === 1 && verdicts.drift.length === 0 && verdicts.cited.length > 0;

    dataset.insert({
      id: conv.id, // upsert key — re-runs overwrite, never duplicate
      input: conv.input,
      expected: golden ? conv.output : undefined,
      metadata: {
        ...conversationMetadata(conv),
        production_output: conv.output,
        llm_spans: llmSpanSummaries(conv),
        golden,
      },
      tags: golden ? [...conv.tags, "golden"] : conv.tags,
      // Link each dataset row back to its source conversation in the logs.
      origin: projectId
        ? { id: conv.id, object_type: "project_logs" as const, object_id: projectId }
        : undefined,
    });
  }
  await flush();
  console.log(
    `Exported ${conversations.length} conversations → Braintrust project "${BRAINTRUST_PROJECT}" ` +
      `(logs + dataset "${BRAINTRUST_DATASET}").`,
  );
  // The Postgres pool (golden-verdict check) keeps the event loop alive.
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
