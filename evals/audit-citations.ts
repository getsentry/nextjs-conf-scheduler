/**
 * Citation audit: dump every citation the grounding scorer extracted across
 * the exported dataset, with the scorer's verdict — as a sheet for a human
 * to label. Disagreements become calibration fixtures in the selftest.
 *
 * This is the anti-overfitting step: the scorer is validated against human
 * judgment, not against whether its number looks good.
 *
 * Usage: pnpm evals:audit [> audit.md]
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { initDataset } from "braintrust";
import { db } from "../lib/db";
import { rooms, talks, tracks } from "../lib/db/schema";
import { canon, classifyCitations } from "./lib/grounding";

const BRAINTRUST_PROJECT = process.env.BRAINTRUST_PROJECT ?? "nextjs-conf-scheduler";
const BRAINTRUST_DATASET = process.env.BRAINTRUST_DATASET ?? "prod-conversations";

async function main() {
  const tables = await Promise.all([
    db.select({ name: talks.title }).from(talks),
    db.select({ name: tracks.name }).from(tracks),
    db.select({ name: rooms.name }).from(rooms),
  ]);
  const canonTitles = [
    ...tables.flat().map((r) => canon(r.name)),
    canon("AI Engineer World's Fair 2026"),
  ];
  const dataset = initDataset(BRAINTRUST_PROJECT, { dataset: BRAINTRUST_DATASET });

  console.log("# Grounding scorer — citation audit\n");
  console.log("Label the **agree?** column; disagreements become selftest fixtures.\n");
  console.log("| Conversation | Citation | Scorer verdict | Agree? |");
  console.log("|---|---|---|---|");

  let cited = 0;
  const totals = { grounded: 0, drift: 0, hallucinated: 0 };
  for await (const row of dataset) {
    const md = row.metadata as Record<string, unknown>;
    const verdicts = classifyCitations(
      String(md.production_output ?? ""),
      String(row.input ?? ""),
      {
        canonTitles,
        retrievedIds: (md.retrieved_talk_ids as string[]) ?? [],
        retrievedTitles: (md.retrieved_talk_titles as string[]) ?? [],
      },
    );
    const shortId = String(row.id).slice(0, 13);
    for (const [verdict, list] of [
      ["grounded", verdicts.grounded],
      ["drift", verdicts.drift],
      ["HALLUCINATED", verdicts.hallucinated],
    ] as const) {
      for (const title of list) {
        console.log(`| ${shortId} | ${title.replace(/\|/g, "\\|")} | ${verdict} | |`);
        cited++;
        totals[verdict === "HALLUCINATED" ? "hallucinated" : verdict]++;
      }
    }
  }
  console.log(
    `\n**${cited} citations** — ${totals.grounded} grounded · ${totals.drift} drift · ${totals.hallucinated} hallucinated`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
