/**
 * Pure grounding-scorer logic, shared by the Braintrust eval
 * (evals/grounding.eval.ts), the scorer selftest (evals/scorer-selftest.ts),
 * and the citation audit (evals/audit-citations.ts).
 *
 * Deliberately dependency-free: ground truth (DB titles, tool results) is
 * passed in, never fetched, so every branch is unit-testable.
 */

/**
 * Canonical comparison form: letters and digits separated by single spaces.
 * Survives real-world title mismatches: "Computer‑Use" (U+2011) vs
 * "Computer Use", and "Teams.The Rise" (missing space in the DB) vs "Teams. The Rise".
 */
export function canon(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(text: string): string {
  return canon(text).replace(/ /g, "-");
}

/** UI labels the assistant echoes that read as titles but aren't session citations. */
const UI_PHRASES = new Set(["add to my schedule"]);

/** Mostly Title-Cased multi-word strings read as session titles, not prose headers. */
export function looksLikeTitle(candidate: string): boolean {
  const words = candidate.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length < 3) return false;
  const significant = words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length > 3);
  if (significant.length === 0) return false;
  const capitalized = significant.filter((w) => /^[^a-z]/.test(w));
  return capitalized.length / significant.length >= 0.6;
}

/**
 * Session titles the assistant presented: **bold** and "quoted" segments.
 *
 * KNOWN LIMITATION (documented, verified by the selftest): citations written
 * in plain lowercase prose are not extracted, so hallucinations phrased that
 * way are invisible to this scorer. Recall is bounded by how the assistant
 * formats citations — acceptable here because the schedule assistant is
 * prompted toward markdown, but a paraphrasing model would need an
 * entity-linking extractor instead.
 */
export function extractCitedTitles(output: string): string[] {
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

export interface GroundTruth {
  /** Canonical titles of every real session (today's DB). */
  canonTitles: string[];
  /** Talk ids the agent's tools returned at conversation time. */
  retrievedIds: string[];
  /** Talk titles the agent's tools returned at conversation time. */
  retrievedTitles: string[];
}

export interface CitationVerdicts {
  cited: string[];
  grounded: string[];
  /** In the conversation's tool results but not today's DB — data changed, model faithful. */
  drift: string[];
  /** In neither universe — the model invented it. */
  hallucinated: string[];
  /** null when nothing was cited (not applicable), else 1 - hallucinated/cited. */
  score: number | null;
}

/**
 * Classify every citation against two universes:
 *  1. today's DB (source of truth for what exists now)
 *  2. the conversation's own tool results (source of truth for what the model saw)
 * Only citations found in neither count against the model.
 */
export function classifyCitations(
  output: string,
  input: string,
  truth: GroundTruth,
): CitationVerdicts {
  const canonInput = canon(input ?? "");
  const cited = extractCitedTitles(output).filter((title) => {
    // Headers that restate the user's ask ("Evals + Observability Day") aren't citations.
    const c = canon(title);
    return !(canonInput && (canonInput.includes(c) || c.includes(canonInput)));
  });

  const retrievedIds = truth.retrievedIds.map((id) => id.toLowerCase());
  const retrievedTitles = truth.retrievedTitles.map(canon);
  const inToolResults = (title: string): boolean => {
    const c = canon(title);
    if (retrievedTitles.some((real) => real.includes(c) || c.includes(real))) return true;
    const slug = slugify(title).slice(0, 40);
    return retrievedIds.some((id) => slug.length >= 12 && id.includes(slug));
  };

  const grounded: string[] = [];
  const drift: string[] = [];
  const hallucinated: string[] = [];
  for (const title of cited) {
    const c = canon(title);
    if (truth.canonTitles.some((real) => real.includes(c) || c.includes(real))) {
      grounded.push(title);
    } else if (inToolResults(title)) {
      drift.push(title);
    } else {
      hallucinated.push(title);
    }
  }

  return {
    cited,
    grounded,
    drift,
    hallucinated,
    score: cited.length === 0 ? null : (cited.length - hallucinated.length) / cited.length,
  };
}
