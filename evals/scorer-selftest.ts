/**
 * Scorer selftest: proves the grounding scorer can still CATCH failures,
 * not just avoid false positives.
 *
 * Every scorer iteration so far reduced false positives (raising the score).
 * A scorer tuned only that way drifts toward blindness — one that flags
 * nothing scores 100%. These fixtures pin both directions:
 *   - sensitivity: planted hallucinations MUST be flagged
 *   - specificity: real titles (incl. Unicode variants) MUST pass
 *   - semantics:   tool-result-only titles MUST classify as drift
 *   - extraction:  headers/UI labels MUST NOT count as citations
 * Plus documented blind spots, asserted as EXPECTED misses so a future
 * "fix" that silently changes recall fails loudly here.
 *
 * Real DB titles are fetched at runtime so fixtures survive re-seeds.
 *
 * Usage: pnpm evals:selftest   (exits 1 on any failure)
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { talks } from "../lib/db/schema";
import { canon, classifyCitations, extractCitedTitles } from "./lib/grounding";

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];
function expect(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

async function main() {
  const rows = await db.select({ title: talks.title }).from(talks).limit(1000);
  const realTitles = rows.map((r) => r.title);
  const canonTitles = realTitles.map(canon);
  const realA = realTitles[0];
  // Unicode fixture needs ≥5 words: hyphen-injection merges two words, and
  // extraction requires ≥3 words after merging.
  const realLong = realTitles.find((t) => t.split(" ").length >= 5) ?? realA;
  const noTools = { canonTitles, retrievedIds: [], retrievedTitles: [] };

  // ── Sensitivity: planted hallucinations must be flagged ──────────────────
  const FAKE = "Quantum Prompting for Distributed Cats";
  const planted = classifyCitations(
    `Two great picks:\n- **${realA}** (10:00 AM)\n- **${FAKE}** (11:00 AM)`,
    "what should I see?",
    noTools,
  );
  expect(
    "planted fake among real citations is flagged",
    planted.hallucinated.length === 1 && canon(planted.hallucinated[0]) === canon(FAKE),
    `hallucinated=${JSON.stringify(planted.hallucinated)}`,
  );
  expect(
    "score reflects exactly the planted fake",
    planted.score === 0.5,
    `score=${planted.score} (expected 0.5: 1 real + 1 fake)`,
  );

  const allFake = classifyCitations(
    `Check out **${FAKE}** and **"Async Vibes in Production Llamas"** today!`,
    "any sessions about cats?",
    noTools,
  );
  expect(
    "fully fabricated answer scores 0",
    allFake.score === 0 && allFake.hallucinated.length === 2,
    `score=${allFake.score}, hallucinated=${allFake.hallucinated.length}`,
  );

  // ── Specificity: real titles must pass, including hostile formatting ─────
  const verbatim = classifyCitations(`Go see **${realA}**!`, "recommend one", noTools);
  expect(
    "verbatim real title is grounded",
    verbatim.score === 1 && verbatim.grounded.length === 1,
    `score=${verbatim.score}`,
  );

  const unicodeVariant = realLong.replace(/ /, "‑").replace(/'/g, "’");
  const unicode = classifyCitations(`Go see **${unicodeVariant}**.`, "recommend one", noTools);
  expect(
    "Unicode-mangled real title (U+2011 hyphen, curly quotes) is grounded",
    unicode.score === 1,
    `variant="${unicodeVariant.slice(0, 50)}" score=${unicode.score}`,
  );

  // ── Semantics: tool-result-only titles are drift, not hallucination ──────
  const OLD_TITLE = "Next.js for AI Agents"; // pre-reseed style title, not in today's DB
  const drift = classifyCitations(`I recommend **${OLD_TITLE}** at 2 PM.`, "ai talks?", {
    canonTitles,
    retrievedIds: ["nextjs-ai-agents"],
    retrievedTitles: [OLD_TITLE],
  });
  expect(
    "title from tool results but not DB classifies as drift, score unpenalized",
    drift.score === 1 && drift.drift.length === 1 && drift.hallucinated.length === 0,
    `score=${drift.score}, drift=${JSON.stringify(drift.drift)}`,
  );

  const sameButNoTools = classifyCitations(
    `I recommend **${OLD_TITLE}** at 2 PM.`,
    "ai talks?",
    noTools,
  );
  expect(
    "same title WITHOUT tool evidence classifies as hallucination",
    sameButNoTools.score === 0 && sameButNoTools.hallucinated.length === 1,
    `score=${sameButNoTools.score}`,
  );

  // ── Extraction: noise must not count as citations ─────────────────────────
  const noise = extractCitedTitles(
    [
      "**Why this day works:** great flow.",
      "**Mon, Jun 29** — busy day.",
      "**Your current schedule:** three talks.",
      "**10:45–11:05 AM** keynote block.",
      "**Dmitry Buykin — Maersk · Thu, Jul 2** speaking.",
      "Click **Add to My Schedule** to save.",
      "**📅 Thursday July 2 – Evals Track**",
    ].join("\n"),
  );
  expect(
    "headers/dates/speakers/UI labels extract nothing",
    noise.length === 0,
    `extracted=${JSON.stringify(noise)}`,
  );

  const restated = classifyCitations(
    `Here's your **Evals + Observability Day** plan: **${realA}** first.`,
    "Build me an evals + observability day",
    noTools,
  );
  expect(
    "header restating the user's ask is not a citation",
    restated.cited.length === 1 && restated.score === 1,
    `cited=${JSON.stringify(restated.cited)}`,
  );

  // ── Documented blind spots: asserted as EXPECTED misses ──────────────────
  // If a future change makes these pass, recall changed — review it, then
  // update these assertions deliberately.
  const lowercase = classifyCitations(
    `you should really go to the ${FAKE.toLowerCase()} talk, it slaps`,
    "any tips?",
    noTools,
  );
  expect(
    "KNOWN LIMIT: lowercase-prose hallucination is NOT extracted (recall bound)",
    lowercase.score === null,
    `score=${lowercase.score} — extraction requires bold/quoted title-case`,
  );

  // Extending a real title with invented words IS caught (verified above by the
  // planted-fake checks) — but citing a bare FRAGMENT of a real title passes,
  // because fragment ⊆ real-title matches by inclusion. That's the true
  // precision bound: partial citations are credited as grounded.
  const fragment = realLong.split(" ").slice(0, 4).join(" ");
  const partial = classifyCitations(`Go see **${fragment}**!`, "recommend one", noTools);
  expect(
    "KNOWN LIMIT: fragment of a real title passes via substring match (precision bound)",
    partial.score === 1,
    `fragment="${fragment}" score=${partial.score}`,
  );

  // ── Report ────────────────────────────────────────────────────────────────
  let failed = 0;
  for (const c of checks) {
    const mark = c.pass ? "✓" : "✗";
    if (!c.pass) failed++;
    console.log(`${mark} ${c.name}`);
    if (!c.pass) console.log(`    ${c.detail}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
