import { db } from "../../lib/db";
import { rooms, talks, tracks } from "../../lib/db/schema";
import { canon } from "./grounding";

/**
 * Every real schedule entity (talks, tracks, rooms, and the conference name)
 * in canonical form — the single ground-truth loader shared by the exporter,
 * the eval, and the audit so their verdicts can never disagree.
 */
export async function loadCanonEntities(): Promise<string[]> {
  const tables = await Promise.all([
    db.select({ name: talks.title }).from(talks),
    db.select({ name: tracks.name }).from(tracks),
    db.select({ name: rooms.name }).from(rooms),
  ]);
  return [...tables.flat().map((row) => canon(row.name)), canon("AI Engineer World's Fair 2026")];
}
