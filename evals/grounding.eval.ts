/**
 * Offline eval: score exported production conversations for groundedness.
 *
 * Task    — passthrough: returns the production output captured in metadata
 *           (reference-free scoring of what the agent actually said).
 * Scorers — grounded: deterministic (evals/lib/grounding.ts). Cited session
 *           titles are checked against Postgres AND the conversation's own
 *           tool results; only citations found in neither count against the
 *           model (hallucination), the rest are recorded as data drift.
 *           no_thrash: flags conversations that burned outsized tokens/tools.
 *
 * Scorer trustworthiness: pnpm evals:selftest (planted hallucinations must be
 * caught) and pnpm evals:audit (per-citation sheet for human labeling).
 *
 * Usage: pnpm evals:run
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { Eval, initDataset } from "braintrust";
import { db } from "../lib/db";
import { rooms, talks, tracks } from "../lib/db/schema";
import { canon, classifyCitations } from "./lib/grounding";

const BRAINTRUST_PROJECT = process.env.BRAINTRUST_PROJECT ?? "nextjs-conf-scheduler";
const BRAINTRUST_DATASET = process.env.BRAINTRUST_DATASET ?? "prod-conversations";

interface LlmSpanSummary {
  type: "llm" | "tool";
  name: string;
  start: number;
  duration_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  status?: string;
}

interface ConversationMetadata {
  production_output?: string;
  retrieved_talk_ids?: string[];
  retrieved_talk_titles?: string[];
  total_tokens?: number;
  tool_calls?: number;
  tool_errors?: number;
  llm_spans?: LlmSpanSummary[];
  [key: string]: unknown;
}

let canonEntitiesPromise: Promise<string[]> | undefined;

/** Every real schedule entity (talks, tracks, rooms) in canonical form. */
function getCanonEntities(): Promise<string[]> {
  canonEntitiesPromise ??= Promise.all([
    db.select({ name: talks.title }).from(talks),
    db.select({ name: tracks.name }).from(tracks),
    db.select({ name: rooms.name }).from(rooms),
  ]).then((tables) => [
    ...tables.flat().map((row) => canon(row.name)),
    canon("AI Engineer World's Fair 2026"), // the conference itself
  ]);
  return canonEntitiesPromise;
}

/** Structural scorer args: Eval()'s inferred case type may omit metadata, so it's optional. */
interface ScorerArgs {
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
}

async function grounded({ input, output, metadata }: ScorerArgs) {
  const conv = (metadata ?? {}) as ConversationMetadata;
  const verdicts = classifyCitations(output, input, {
    canonTitles: await getCanonEntities(),
    retrievedIds: conv.retrieved_talk_ids ?? [],
    retrievedTitles: conv.retrieved_talk_titles ?? [],
  });
  if (verdicts.score === null) {
    return { name: "grounded", score: null, metadata: { reason: "no sessions cited" } };
  }
  return {
    name: "grounded",
    score: verdicts.score,
    metadata: {
      cited_count: verdicts.cited.length,
      hallucinated: verdicts.hallucinated,
      data_drift: verdicts.drift,
    },
  };
}

/**
 * Graded token efficiency. A tight answer (<=15K tokens for this app's
 * conversations) scores 1; the score decays linearly to 0 at 120K — the
 * silent-loop regime where an agent re-searches the same query repeatedly.
 */
function efficiency({ metadata }: ScorerArgs) {
  const conv = (metadata ?? {}) as ConversationMetadata;
  const tokens = conv.total_tokens ?? 0;
  const score = Math.max(0, Math.min(1, (120_000 - tokens) / (120_000 - 15_000)));
  return {
    name: "efficiency",
    score: Number(score.toFixed(2)),
    metadata: { total_tokens: tokens, tool_calls: conv.tool_calls ?? 0 },
  };
}

/** Fraction of tool calls that succeeded; null when the agent used no tools. */
function toolSuccess({ metadata }: ScorerArgs) {
  const conv = (metadata ?? {}) as ConversationMetadata;
  const calls = conv.tool_calls ?? 0;
  const errors = conv.tool_errors ?? 0;
  return {
    name: "tool_success",
    score: calls === 0 ? null : Number(((calls - errors) / calls).toFixed(2)),
    metadata: { tool_calls: calls, tool_errors: errors },
  };
}

Eval(BRAINTRUST_PROJECT, {
  experimentName: "prod-grounding",
  data: initDataset(BRAINTRUST_PROJECT, { dataset: BRAINTRUST_DATASET }),
  task: (_input: string, hooks) => {
    const conv = hooks.metadata as ConversationMetadata;
    // Replay the production trace (captured by Sentry) as child spans so the
    // experiment shows real LLM/tool counts, durations, and token metrics.
    for (const span of conv.llm_spans ?? []) {
      const failed = span.status && !["ok", "unknown"].includes(span.status);
      const child = hooks.span.startSpan({
        name: span.name,
        type: span.type,
        startTime: span.start,
        event:
          span.type === "llm"
            ? {
                metadata: { model: span.name },
                metrics: {
                  prompt_tokens: span.input_tokens,
                  completion_tokens: span.output_tokens,
                  tokens: span.total_tokens,
                },
              }
            : { error: failed ? `tool failed (span.status: ${span.status})` : undefined },
      });
      child.end({ endTime: span.start + span.duration_ms / 1000 });
    }
    return conv.production_output ?? "";
  },
  scores: [grounded, efficiency, toolSuccess],
}).then(() => {
  // The Postgres pool keeps the event loop alive; results are already flushed.
  process.exit(0);
});
