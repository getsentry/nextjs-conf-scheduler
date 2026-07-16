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
import { talks } from "../lib/db/schema";
import { canon, classifyCitations } from "./lib/grounding";

const BRAINTRUST_PROJECT = process.env.BRAINTRUST_PROJECT ?? "conf-scheduler";
const BRAINTRUST_DATASET = process.env.BRAINTRUST_DATASET ?? "prod-conversations";

interface ConversationMetadata {
  production_output?: string;
  retrieved_talk_ids?: string[];
  retrieved_talk_titles?: string[];
  total_tokens?: number;
  tool_calls?: number;
  [key: string]: unknown;
}

let canonTitlesPromise: Promise<string[]> | undefined;

/** All real session titles in canonical form — today's ground truth. */
function getCanonTitles(): Promise<string[]> {
  canonTitlesPromise ??= db
    .select({ title: talks.title })
    .from(talks)
    .then((rows) => rows.map((row) => canon(row.title)));
  return canonTitlesPromise;
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
    canonTitles: await getCanonTitles(),
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

function noThrash({ metadata }: ScorerArgs) {
  const conv = (metadata ?? {}) as ConversationMetadata;
  const tokens = conv.total_tokens ?? 0;
  const tools = conv.tool_calls ?? 0;
  return {
    name: "no_thrash",
    score: tokens > 80_000 || tools > 10 ? 0 : 1,
    metadata: { total_tokens: tokens, tool_calls: tools },
  };
}

Eval(BRAINTRUST_PROJECT, {
  experimentName: "prod-grounding",
  data: initDataset(BRAINTRUST_PROJECT, { dataset: BRAINTRUST_DATASET }),
  task: (_input: string, hooks) => (hooks.metadata as ConversationMetadata).production_output ?? "",
  scores: [grounded, noThrash],
}).then(() => {
  // The Postgres pool keeps the event loop alive; results are already flushed.
  process.exit(0);
});
