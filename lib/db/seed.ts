import * as dotenv from "dotenv";
import seedData from "./aiewf2026-seed.json";
import { db } from "./index";
import {
  rooms,
  speakers,
  talkEmbeddings,
  talkSpeakers,
  talks,
  tracks,
  userSchedules,
} from "./schema";

dotenv.config({ path: ".env.local" });

type SeedData = {
  tracks: (typeof tracks.$inferInsert)[];
  rooms: (typeof rooms.$inferInsert)[];
  speakers: (typeof speakers.$inferInsert)[];
  talks: (typeof talks.$inferInsert)[];
};

const {
  tracks: seedTracks,
  rooms: seedRooms,
  speakers: seedSpeakers,
  talks: seedTalks,
} = seedData as SeedData;

async function seed() {
  console.log("Seeding AI Engineer World's Fair 2026 data...");
  console.log(`Source: ${seedData.source}`);

  // Clear existing schedule data. User accounts stay intact, but saved schedules are invalidated.
  await db.delete(userSchedules);
  await db.delete(talkEmbeddings);
  await db.delete(talkSpeakers);
  await db.delete(talks);
  await db.delete(speakers);
  await db.delete(tracks);
  await db.delete(rooms);

  await db.insert(tracks).values(seedTracks);
  console.log(`Inserted ${seedTracks.length} tracks`);

  await db.insert(rooms).values(seedRooms);
  console.log(`Inserted ${seedRooms.length} rooms`);

  await db.insert(speakers).values(seedSpeakers);
  console.log(`Inserted ${seedSpeakers.length} speakers`);

  await db.insert(talks).values(seedTalks);
  console.log(`Inserted ${seedTalks.length} sessions`);

  await db.insert(talkSpeakers).values(
    seedTalks.map((talk) => ({
      talkId: talk.id,
      speakerId: talk.speakerId,
      position: 0,
    })),
  );
  console.log(`Inserted ${seedTalks.length} talk-speaker assignments`);

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
