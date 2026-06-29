import { readFile } from "node:fs/promises";
import path from "node:path";
import * as dotenv from "dotenv";
import { db } from "../lib/db";
import {
  rooms,
  speakers,
  talkEmbeddings,
  talkSpeakers,
  talks,
  tracks,
  userSchedules,
} from "../lib/db/schema";

type ConferenceSeed = {
  metadata?: {
    id?: string;
    name?: string;
    timezone?: string;
  };
  source?: string;
  tracks: (typeof tracks.$inferInsert)[];
  rooms: (typeof rooms.$inferInsert)[];
  speakers: (typeof speakers.$inferInsert)[];
  talks: (typeof talks.$inferInsert)[];
  talkSpeakers: (typeof talkSpeakers.$inferInsert)[];
};

const args = process.argv.slice(2);

function flagValue(name: string, fallback?: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

function splitCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDbUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.password = "";
    url.username = "";
    return url.toString();
  } catch {
    return value;
  }
}

function assertSafeTarget() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL must be set");
  }

  if (process.env.CONFERENCE_SEED_LOAD_DOTENV === "1") {
    console.warn("Loaded .env.local because CONFERENCE_SEED_LOAD_DOTENV=1 was set.");
  }

  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_CONFERENCE_SEED !== "1"
  ) {
    throw new Error(
      "Refusing to seed a production Vercel deployment. Set ALLOW_PRODUCTION_CONFERENCE_SEED=1 to override.",
    );
  }

  if (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.ALLOW_CONFERENCE_SEED_OUTSIDE_PREVIEW !== "1"
  ) {
    throw new Error(
      "Refusing to seed outside a Vercel preview deployment. Set ALLOW_CONFERENCE_SEED_OUTSIDE_PREVIEW=1 only when targeting a disposable DB branch.",
    );
  }

  const current = normalizeDbUrl(databaseUrl);
  const protectedUrls = splitCsv(
    [
      process.env.PRIMARY_DATABASE_URL,
      process.env.PRODUCTION_DATABASE_URL,
      process.env.NEON_PRIMARY_DATABASE_URL,
    ]
      .filter(Boolean)
      .join(","),
  ).map(normalizeDbUrl);

  if (current && protectedUrls.includes(current)) {
    throw new Error(
      "Refusing to seed because DATABASE_URL matches a configured primary database URL.",
    );
  }
}

function requireUniqueIds(rows: { id: string }[], label: string) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`Duplicate ${label} id: ${row.id}`);
    seen.add(row.id);
  }
  return seen;
}

function validateSeed(seed: ConferenceSeed) {
  const trackIds = requireUniqueIds(seed.tracks, "track");
  const roomIds = requireUniqueIds(seed.rooms, "room");
  const speakerIds = requireUniqueIds(seed.speakers, "speaker");
  const talkIds = requireUniqueIds(seed.talks, "talk");

  for (const talk of seed.talks) {
    if (!speakerIds.has(talk.speakerId))
      throw new Error(`Talk ${talk.id} references missing speaker ${talk.speakerId}`);
    if (!trackIds.has(talk.trackId))
      throw new Error(`Talk ${talk.id} references missing track ${talk.trackId}`);
    if (!roomIds.has(talk.roomId))
      throw new Error(`Talk ${talk.id} references missing room ${talk.roomId}`);
  }

  for (const link of seed.talkSpeakers) {
    if (!talkIds.has(link.talkId))
      throw new Error(`Talk-speaker link references missing talk ${link.talkId}`);
    if (!speakerIds.has(link.speakerId)) {
      throw new Error(`Talk-speaker link references missing speaker ${link.speakerId}`);
    }
  }
}

function logInsert(label: string, count: number) {
  if (count > 0) console.log(`Inserted ${count} ${label}`);
}

async function main() {
  if (process.env.CONFERENCE_SEED_LOAD_DOTENV === "1") {
    dotenv.config({ path: ".env.local" });
  }

  assertSafeTarget();

  const seedFile = flagValue("--seed", process.env.CONFERENCE_SEED_FILE);
  if (!seedFile) {
    throw new Error("Set CONFERENCE_SEED_FILE or pass --seed=data/conference-seeds/<file>.json");
  }

  const seedPath = path.resolve(seedFile);
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as ConferenceSeed;
  validateSeed(seed);

  console.log(`Seeding ${seed.metadata?.name ?? seed.metadata?.id ?? seedPath}...`);
  console.log(
    `Rows: ${seed.tracks.length} tracks, ${seed.rooms.length} rooms, ${seed.speakers.length} speakers, ${seed.talks.length} talks, ${seed.talkSpeakers.length} talk-speaker links`,
  );

  await db.delete(talkEmbeddings);
  await db.delete(userSchedules);
  await db.delete(talkSpeakers);
  await db.delete(talks);
  await db.delete(speakers);
  await db.delete(rooms);
  await db.delete(tracks);

  if (seed.tracks.length > 0) await db.insert(tracks).values(seed.tracks);
  logInsert("tracks", seed.tracks.length);
  if (seed.rooms.length > 0) await db.insert(rooms).values(seed.rooms);
  logInsert("rooms", seed.rooms.length);
  if (seed.speakers.length > 0) await db.insert(speakers).values(seed.speakers);
  logInsert("speakers", seed.speakers.length);
  if (seed.talks.length > 0) await db.insert(talks).values(seed.talks);
  logInsert("talks", seed.talks.length);
  if (seed.talkSpeakers.length > 0) await db.insert(talkSpeakers).values(seed.talkSpeakers);
  logInsert("talk-speaker links", seed.talkSpeakers.length);

  console.log("Conference seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await globalThis.__postgres_client?.end({ timeout: 5 });
  });
