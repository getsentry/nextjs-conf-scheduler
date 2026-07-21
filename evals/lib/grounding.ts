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
  /**
   * Canonical names of every real schedule entity in today's DB — talks,
   * tracks, AND rooms. Models legitimately name all three ("AI in GTM" is a
   * track); a truth universe of talk titles alone flags real tracks as fake.
   */
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

/** Words that carry meaning in a title; drops "the", "for", "your", etc. */
const RESCUE_STOP_WORDS = new Set(["your", "with", "from", "this", "that", "into", "what", "when"]);

function significantWords(canonText: string): string[] {
  return canonText.split(" ").filter((w) => w.length >= 4 && !RESCUE_STOP_WORDS.has(w));
}

/** Consecutive significant-word pairs: "aws agent speedrun mon" → ["agent speedrun"]. */
function significantBigrams(canonText: string): string[] {
  const words = significantWords(canonText);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]} ${words[i + 1]}`);
  return bigrams;
}

/** Minimum canonical length for the formatting-independent title scan. */
const SCAN_MIN_LENGTH = 15;

/**
 * Classify every session-title mention against two universes:
 *  1. today's DB (source of truth for what exists now)
 *  2. the conversation's own tool results (source of truth for what the model saw)
 * Only mentions found in neither count against the model.
 *
 * Two passes, because models format differently (Sonnet bolds verbatim titles,
 * Haiku puts them in table cells, Opus italicizes or abbreviates):
 *  A. Title scan — search the whole output for every known title. Formatting-
 *     independent recall of real mentions; can never produce a hallucination.
 *  B. Markdown extraction — bold/quoted candidates, for catching invented
 *     titles. Shorthand of a real title ("AWS Agent Speedrun (Mon)") is
 *     rescued when it shares a consecutive significant-word pair with one.
 */
export function classifyCitations(
  output: string,
  input: string,
  truth: GroundTruth,
): CitationVerdicts {
  const canonInput = canon(input ?? "");
  const canonOut = ` ${canon(output)} `;
  const retrievedIds = truth.retrievedIds.map((id) => id.toLowerCase());
  const retrievedTitles = truth.retrievedTitles.map(canon);

  const grounded: string[] = [];
  const drift: string[] = [];
  const hallucinated: string[] = [];
  const matched = new Set<string>(); // canonical titles already credited

  // Pass A — formatting-independent scan for verbatim title mentions.
  for (const title of truth.canonTitles) {
    if (title.length >= SCAN_MIN_LENGTH && canonOut.includes(` ${title} `) && !matched.has(title)) {
      matched.add(title);
      grounded.push(title);
    }
  }
  for (const title of retrievedTitles) {
    if (title.length < SCAN_MIN_LENGTH || matched.has(title)) continue;
    if (!canonOut.includes(` ${title} `)) continue;
    // A retrieved title overlapping a DB title (same length guard as pass B)
    // is still a real entity today — grounded, not drift. Either way the
    // mention is credited; dropping it would deflate the score.
    const inDb = truth.canonTitles.some(
      (db) => db.includes(title) || (db.length >= SCAN_MIN_LENGTH && title.includes(db)),
    );
    matched.add(title);
    (inDb ? grounded : drift).push(title);
  }

  // Pass B — markdown candidates, for invented titles and shorthand.
  const candidates = extractCitedTitles(output).filter((title) => {
    // Headers that restate the user's ask ("Evals + Observability Day") aren't citations.
    const c = canon(title);
    return !(canonInput && (canonInput.includes(c) || c.includes(canonInput)));
  });
  for (const title of candidates) {
    const c = canon(title);
    if ([...matched].some((m) => m.includes(c) || c.includes(m))) continue; // counted in pass A
    // Inclusion in either direction, but a short entity name ("Evals" is a
    // 5-char track) must never vouch for a longer candidate containing it.
    if (
      truth.canonTitles.some(
        (real) => real.includes(c) || (real.length >= SCAN_MIN_LENGTH && c.includes(real)),
      )
    ) {
      matched.add(c);
      grounded.push(title);
      continue;
    }
    const slug = slugify(title).slice(0, 40);
    if (
      retrievedTitles.some(
        (real) => real.includes(c) || (real.length >= SCAN_MIN_LENGTH && c.includes(real)),
      ) ||
      retrievedIds.some((id) => slug.length >= 12 && id.includes(slug))
    ) {
      matched.add(c);
      drift.push(title);
      continue;
    }
    // Shorthand rescue: a significant-word pair from the candidate must appear
    // ADJACENT in a real title ("agent speedrun" ⊆ "agent speedrun idea code…").
    // Adjacency in the raw title is required — matching against stopword-
    // collapsed titles would rescue fakes ("vibes production" ⊄ "vibes to production").
    const bigrams = significantBigrams(c);
    if (bigrams.some((b) => truth.canonTitles.some((real) => real.includes(b)))) {
      matched.add(c);
      grounded.push(title);
      continue;
    }
    if (bigrams.some((b) => retrievedTitles.some((real) => real.includes(b)))) {
      matched.add(c);
      drift.push(title);
      continue;
    }
    hallucinated.push(title);
  }

  const cited = [...grounded, ...drift, ...hallucinated];
  return {
    cited,
    grounded,
    drift,
    hallucinated,
    score: cited.length === 0 ? null : (cited.length - hallucinated.length) / cited.length,
  };
}
