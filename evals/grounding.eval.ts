/**
 * Offline eval: score exported production conversations for groundedness.
 *
 * Task    — passthrough: returns the production output captured in metadata
 *           (reference-free scoring of what the agent actually said).
 * Scorers — grounded: deterministic. Extracts session titles the assistant
 *           cited (markdown bold/italic) and asserts each exists in Postgres —
 *           the schedule DB is ground truth, no LLM judge needed.
 *           no_thrash: flags conversations that burned outsized tokens/tools.
 *
 * Usage: pnpm evals:run
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { Eval, initDataset } from "braintrust";
import { db } from "../lib/db";
import { talks } from "../lib/db/schema";

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

let talkTitlesPromise: Promise<Set<string>> | undefined;

/** All real session titles, lowercased — the ground truth. */
function getTalkTitles(): Promise<Set<string>> {
  talkTitlesPromise ??= db
    .select({ title: talks.title })
    .from(talks)
    .then((rows) => new Set(rows.map((row) => row.title.toLowerCase())));
  return talkTitlesPromise;
}

/**
 * Canonical comparison form: letters and digits separated by single spaces.
 * Survives real-world title mismatches: "Computer‑Use" (U+2011) vs
 * "Computer Use", and "Teams.The Rise" (missing space in the DB) vs "Teams. The Rise".
 */
function canon(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return canon(text).replace(/ /g, "-");
}

/** UI labels the assistant echoes that read as titles but aren't session citations. */
const UI_PHRASES = new Set(["add to my schedule"]);

/** Mostly Title-Cased multi-word strings read as session titles, not prose headers. */
function looksLikeTitle(candidate: string): boolean {
  const words = candidate.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length < 3) return false;
  const significant = words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length > 3);
  if (significant.length === 0) return false;
  const capitalized = significant.filter((w) => /^[^a-z]/.test(w));
  return capitalized.length / significant.length >= 0.6;
}

/** Session titles the assistant presented: **bold** and "quoted" segments. */
function extractCitedTitles(output: string): string[] {
  const cited = new Set<string>();
  const segments = [
    ...output.matchAll(/\*\*([^*\n]{12,120})\*\*/g),
    ...output.matchAll(/[“"]([^”"\n]{12,120})[”"]/g),
  ];
  for (const match of segments) {
    const candidate = (match[1] ?? "")
      .trim()
      .replace(/^[^\p{L}\p{N}"'“]+/u, "") // leading emoji/pictograph headers ("📅 Thursday…")
      .replace(/[.:;!?]$/, "")
      .replace(/^[“"']|[”"']$/g, "")
      .trim();
    // Speaker/time metadata lines, weekday headers, and prose don't count as citations.
    if (candidate.includes("·") || candidate.includes(" — ")) continue;
    if (
      /^(mon|tue|wed|thu|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|day \d|track \d|room )/i.test(
        candidate,
      )
    ) {
      continue;
    }
    if (!looksLikeTitle(candidate)) continue;
    if (UI_PHRASES.has(canon(candidate))) continue;
    cited.add(candidate);
  }
  return [...cited];
}

/** Structural scorer args: Eval()'s inferred case type may omit metadata, so it's optional. */
interface ScorerArgs {
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
}

async function grounded({ input, output, metadata }: ScorerArgs) {
  const conv = (metadata ?? {}) as ConversationMetadata;
  const titles = await getTalkTitles();
  const canonTitles = [...titles].map(canon);
  const retrievedIds = (conv.retrieved_talk_ids ?? []).map((id) => id.toLowerCase());
  const retrievedTitles = (conv.retrieved_talk_titles ?? []).map(canon);
  const canonInput = canon(input ?? "");
  const cited = extractCitedTitles(output).filter((title) => {
    // Headers that restate the user's ask ("Evals + Observability Day") aren't citations.
    const c = canon(title);
    return !(canonInput && (canonInput.includes(c) || c.includes(canonInput)));
  });
  if (cited.length === 0) {
    return { name: "grounded", score: null, metadata: { reason: "no sessions cited" } };
  }
  // Second universe: talks the agent's own tools returned at conversation time.
  // A citation found here but not in today's DB is data drift, not hallucination.
  const inToolResults = (title: string): boolean => {
    const c = canon(title);
    if (retrievedTitles.some((real) => real.includes(c) || c.includes(real))) return true;
    const slug = slugify(title).slice(0, 40);
    return retrievedIds.some((id) => slug.length >= 12 && id.includes(slug));
  };
  const drift: string[] = [];
  const hallucinated: string[] = [];
  for (const title of cited) {
    const c = canon(title);
    if (canonTitles.some((real) => real.includes(c) || c.includes(real))) continue;
    if (inToolResults(title)) drift.push(title);
    else hallucinated.push(title);
  }
  // Score model faithfulness: only true hallucinations count against the agent.
  return {
    name: "grounded",
    score: (cited.length - hallucinated.length) / cited.length,
    metadata: { cited_count: cited.length, hallucinated, data_drift: drift },
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
