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
import { rooms, talks, tracks } from "../lib/db/schema";
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
  const trackRows = await db.select({ name: tracks.name }).from(tracks);
  const roomRows = await db.select({ name: rooms.name }).from(rooms);
  // Truth universe = every schedule entity: talks, tracks, rooms.
  const canonTitles = [
    ...realTitles.map(canon),
    ...trackRows.map((r) => canon(r.name)),
    ...roomRows.map((r) => canon(r.name)),
  ];
  const realA = realTitles[0];
  // Unicode fixture needs ≥5 words: hyphen-injection merges two words, and
  // extraction requires ≥3 words after merging.
  const longTitles = realTitles.filter((t) => t.split(" ").length >= 5 && t.length >= 20);
  const realLong = longTitles[0] ?? realA;
  const realLong2 = longTitles[1] ?? realLong;
  // Shorthand fixture needs two ADJACENT significant words from a real title
  // (the rescue requires raw adjacency, so "Evals in Production" won't do).
  const stop = new Set(["your", "with", "from", "this", "that", "into", "what", "when"]);
  const isSig = (w: string) =>
    w.replace(/[^a-zA-Z]/g, "").length >= 4 && !stop.has(w.toLowerCase());
  let adjacentPair: string[] = [];
  let adjacentSource = "";
  for (const t of longTitles) {
    const words = t.split(" ");
    for (let i = 0; i < words.length - 1; i++) {
      if (isSig(words[i]) && isSig(words[i + 1])) {
        adjacentPair = [words[i], words[i + 1]].map((w) => w.replace(/[^a-zA-Z0-9]/g, ""));
        adjacentSource = t;
        break;
      }
    }
    if (adjacentPair.length) break;
  }
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

  // ── Format independence: every model has a house style ───────────────────
  // Haiku puts titles in table cells, Opus italicizes or abbreviates. A
  // grounding scorer must measure truthfulness, not markdown compliance.
  const table = classifyCitations(
    `| Time | Session |\n|---|---|\n| **10:45** | ${realLong} |\n| **11:10** | ${realLong2} |`,
    "plan my day",
    noTools,
  );
  expect(
    "Haiku-style: real titles in table cells (unbolded) are grounded",
    table.score === 1 && table.cited.length >= 2,
    `score=${table.score}, cited=${table.cited.length}`,
  );

  const italic = classifyCitations(`Go check out *${realLong}* today.`, "recommend one", noTools);
  expect(
    "Opus-style: real title in single-asterisk italics is grounded",
    italic.score === 1,
    `score=${italic.score}`,
  );

  // Opus-style shorthand: a real title compressed to a couple of its
  // distinctive words ("AWS Agent Speedrun (Mon)" for "Agent Speedrun: Idea →
  // Code → Deploy → Observe"). An adjacent pair of significant words shared
  // with a real title rescues it.
  const shorthandTitle = `${adjacentPair.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")} Session (Mon)`;
  const shorthand = classifyCitations(
    `Don't miss **${shorthandTitle}** in the morning!`,
    "what should I attend?",
    noTools,
  );
  expect(
    "Opus-style: shorthand of a real title is grounded, not flagged",
    shorthand.score === 1 && shorthand.hallucinated.length === 0,
    `shorthand="${shorthandTitle}" (from "${adjacentSource.slice(0, 40)}") score=${shorthand.score} hallucinated=${JSON.stringify(shorthand.hallucinated)}`,
  );

  // Models legitimately bold track names when asked about tracks. Those are
  // real schedule entities, not hallucinated sessions.
  const realTrack = trackRows
    .map((r) => r.name)
    .find((n) => extractCitedTitles(`- **${n}**: x`).length === 1);
  if (realTrack) {
    const trackList = classifyCitations(
      `Here are the tracks:\n- **${realTrack}**: sessions on this theme.\n- **Quantum Cats Track**: feline prompting.`,
      "give me an overview of the tracks",
      noTools,
    );
    expect(
      "real track name in a track listing is grounded; invented track is flagged",
      trackList.grounded.length === 1 && trackList.hallucinated.length === 1,
      `track="${realTrack}" grounded=${JSON.stringify(trackList.grounded)} hallucinated=${JSON.stringify(trackList.hallucinated)}`,
    );
  }

  // Short entity names ("Evals" is a real track, 5 chars) must not vouch for
  // any fake that merely contains the word.
  const shortEntityFake = classifyCitations(
    `Attend **Evals for Distributed Cats** at 3 PM.`,
    "afternoon plan?",
    noTools,
  );
  expect(
    "fake containing a short real entity word ('Evals') is STILL flagged",
    shortEntityFake.score === 0 && shortEntityFake.hallucinated.length === 1,
    `score=${shortEntityFake.score} grounded=${JSON.stringify(shortEntityFake.grounded)}`,
  );

  const fakeStillCaught = classifyCitations(
    `Check the table:\n| 9:00 | **${FAKE}** | Room 1 |`,
    "morning plan?",
    noTools,
  );
  expect(
    "planted fake in a table is STILL flagged (rescue must not save fakes)",
    fakeStillCaught.score === 0 && fakeStillCaught.hallucinated.length === 1,
    `score=${fakeStillCaught.score}`,
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
