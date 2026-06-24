import * as dotenv from "dotenv";
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

const SCHEDULE_URL = "https://www.ai.engineer/api/worldsfair/embed-schedule";
const SESSIONS_URL = "https://www.ai.engineer/worldsfair/2026/sessions.json";
const SPEAKERS_URL = "https://www.ai.engineer/worldsfair/2026/speakers.json";
const ASSET_BASE_URL = "https://www.ai.engineer";

const DAY_DATES: Record<string, string> = {
  "Day 1": "2026-06-29",
  "Day 2": "2026-06-30",
  "Day 3": "2026-07-01",
  "Day 4": "2026-07-02",
};

const TRACK_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#0ea5e9",
  "#a855f7",
  "#10b981",
];

type SourceSpeaker = {
  name: string;
  role?: string;
  company?: string;
  photoUrl?: string;
  twitter?: string;
  bio?: string;
};

type SourceSession = {
  id: number;
  title: string;
  day: string;
  time: string;
  type: string;
  room: string;
  track?: string;
  tentative?: boolean;
  speakers?: SourceSpeaker[];
};

type SessionDetails = {
  title: string;
  description?: string;
  day: string;
  time: string;
  room: string;
  type: string;
  track?: string;
  status?: "confirmed" | "tentative" | "hold";
  speakers?: string[];
};

type SpeakerDetails = SourceSpeaker & {
  linkedin?: string;
  photoUrl?: string;
  sessions?: SessionDetails[];
};

type SchedulePayload = {
  scheduleVersion: number;
  roomNumbers: Record<string, string>;
  sessions: SourceSession[];
};

type SessionsPayload = {
  sessions: SessionDetails[];
};

type SpeakersPayload = {
  speakers: SpeakerDetails[];
};

type NormalizedSeed = {
  tracks: (typeof tracks.$inferInsert)[];
  rooms: (typeof rooms.$inferInsert)[];
  speakers: (typeof speakers.$inferInsert)[];
  talks: (typeof talks.$inferInsert)[];
  talkSpeakers: (typeof talkSpeakers.$inferInsert)[];
  source: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
}

function speakerIdFromPhoto(photoUrl: string | undefined, name: string) {
  const match = photoUrl?.match(/\/by-id\/(spk_[^/.]+)\.jpg$/);
  return match?.[1] ?? `spk_${slugify(name).replaceAll("-", "_")}`;
}

function absoluteAssetUrl(path: string | undefined) {
  if (!path) return "https://www.ai.engineer/favicon.ico";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${ASSET_BASE_URL}${path}`;
}

function twitterHandle(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, "").replace(/^@/, "") || null;
}

function sessionKey(session: Pick<SessionDetails, "day" | "room" | "time" | "title">) {
  return [session.title, session.day, session.time, session.room]
    .map((part) => part.trim().toLowerCase())
    .join("|||");
}

function parseTimeRange(day: string, range: string) {
  const dayPrefix = day.match(/^Day \d/)?.[0];
  const date = dayPrefix ? DAY_DATES[dayPrefix] : undefined;
  if (!date) {
    throw new Error(`Unknown conference day: ${day}`);
  }

  const [start, end] = range.split("-").map((part) => part.trim());
  return {
    startTime: parseConferenceTime(date, start),
    endTime: parseConferenceTime(date, end),
  };
}

function parseConferenceTime(date: string, time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) {
    throw new Error(`Invalid conference time: ${time}`);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toLowerCase();

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return Math.floor(
    new Date(
      `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-07:00`,
    ).getTime() / 1000,
  );
}

function formatFromType(type: string): (typeof talks.$inferInsert)["format"] {
  if (type === "session") return "talk";
  if (["workshop", "keynote", "panel", "sponsor", "plenary"].includes(type)) {
    return type as (typeof talks.$inferInsert)["format"];
  }
  return "talk";
}

function levelFromSession(session: SourceSession): (typeof talks.$inferInsert)["level"] {
  if (session.type === "workshop") return "advanced";
  if (session.type === "keynote" || session.type === "plenary") return "beginner";
  return "intermediate";
}

function legacyTalkSlug(title: string) {
  // Existing demo URLs used a 48-character title slug. Keep that shape so links like
  // /talks/aiewf-561-the-model-swap-workshop continue to resolve after reseeding.
  return slugify(title).slice(0, 48);
}

function stableTalkId(session: SourceSession) {
  // Current demo links were generated from the public numeric session ids, with Day 1 ids
  // offset by 2. Preserve that shape so existing local/demo links keep working.
  const numericId = session.day.startsWith("Day 1") ? session.id + 2 : session.id;
  return `aiewf-${numericId}-${legacyTalkSlug(session.title)}`;
}

function roomId(room: string) {
  return slugify(room);
}

function roomName(room: string, roomNumbers: Record<string, string>) {
  const number = roomNumbers[room];
  return number ? `${room} · ${number}` : room;
}

function trackName(session: SourceSession) {
  return session.track || session.room || "General";
}

function buildDescription(session: SourceSession, details: SessionDetails | undefined) {
  const description = details?.description?.trim() ?? "";
  const sessionSpeakers = session.speakers ?? [];

  if (sessionSpeakers.length <= 1) return description;

  const speakerSummary = sessionSpeakers
    .map((speaker) => [speaker.name, speaker.company].filter(Boolean).join(" — "))
    .join("; ");
  const suffix = `Speakers: ${speakerSummary}.`;

  return description ? `${description}\n\n${suffix}` : suffix;
}

function normalizeSeed(
  schedule: SchedulePayload,
  sessionsPayload: SessionsPayload,
  speakersPayload: SpeakersPayload,
): NormalizedSeed {
  const detailsByKey = new Map<string, SessionDetails>();
  for (const session of sessionsPayload.sessions) {
    detailsByKey.set(sessionKey(session), session);
  }
  for (const speaker of speakersPayload.speakers) {
    for (const session of speaker.sessions ?? []) {
      detailsByKey.set(sessionKey(session), session);
    }
  }

  const speakerDetailsByName = new Map(
    speakersPayload.speakers.map((speaker) => [speaker.name.toLowerCase(), speaker]),
  );

  const speakerRows = new Map<string, typeof speakers.$inferInsert>();
  speakerRows.set("tbd", {
    id: "tbd",
    name: "TBA",
    bio: "Speaker to be announced.",
    avatar: "https://www.ai.engineer/favicon.ico",
    company: "",
    role: "Speaker",
    twitter: null,
  });

  const trackRows = new Map<string, typeof tracks.$inferInsert>();
  const roomRows = new Map<string, typeof rooms.$inferInsert>();
  const talkRows: (typeof talks.$inferInsert)[] = [];
  const talkSpeakerRows: (typeof talkSpeakers.$inferInsert)[] = [];

  for (const session of schedule.sessions) {
    const details = detailsByKey.get(sessionKey(session));
    const sourceSpeakers = session.speakers ?? [];
    const normalizedSpeakers = sourceSpeakers.map((speaker) => {
      const details = speakerDetailsByName.get(speaker.name.toLowerCase());
      const photoUrl = speaker.photoUrl || details?.photoUrl;
      const id = speakerIdFromPhoto(photoUrl, speaker.name);
      const row = {
        id,
        name: speaker.name,
        bio:
          details?.bio ??
          speaker.bio ??
          `${speaker.name} is speaking at AI Engineer World's Fair 2026.`,
        avatar: absoluteAssetUrl(photoUrl),
        company: speaker.company ?? details?.company ?? "",
        role: speaker.role ?? details?.role ?? "Speaker",
        twitter: twitterHandle(speaker.twitter || details?.twitter),
      };
      speakerRows.set(id, row);
      return row;
    });

    const primarySpeaker = normalizedSpeakers[0] ?? speakerRows.get("tbd");
    if (!primarySpeaker) {
      throw new Error("TBA speaker row missing");
    }

    const track = trackName(session);
    const trackId = slugify(track);
    if (!trackRows.has(trackId)) {
      trackRows.set(trackId, {
        id: trackId,
        name: track,
        color: TRACK_COLORS[trackRows.size % TRACK_COLORS.length],
        description: `${track} sessions at AI Engineer World's Fair 2026 in San Francisco.`,
      });
    }

    const normalizedRoomId = roomId(session.room);
    if (!roomRows.has(normalizedRoomId)) {
      roomRows.set(normalizedRoomId, {
        id: normalizedRoomId,
        name: roomName(session.room, schedule.roomNumbers),
        capacity:
          session.room === "Main Stage" ? 4000 : session.room.startsWith("Leadership") ? 550 : 250,
      });
    }

    const { startTime, endTime } = parseTimeRange(session.day, session.time);
    const talkId = stableTalkId(session);

    talkRows.push({
      id: talkId,
      title: session.title,
      description: buildDescription(session, details),
      speakerId: primarySpeaker.id,
      trackId,
      roomId: normalizedRoomId,
      startTime,
      endTime,
      level: levelFromSession(session),
      format: formatFromType(session.type),
      status: session.tentative ? "tentative" : (details?.status ?? "confirmed"),
    });

    const speakersForTalk = normalizedSpeakers.length > 0 ? normalizedSpeakers : [primarySpeaker];
    for (const [position, speaker] of speakersForTalk.entries()) {
      talkSpeakerRows.push({ talkId, speakerId: speaker.id, position });
    }
  }

  return {
    tracks: Array.from(trackRows.values()),
    rooms: Array.from(roomRows.values()),
    speakers: Array.from(speakerRows.values()),
    talks: talkRows,
    talkSpeakers: talkSpeakerRows,
    source: `${SCHEDULE_URL}, ${SESSIONS_URL}, ${SPEAKERS_URL}`,
  };
}

async function loadSeedData() {
  const [schedule, sessionsPayload, speakersPayload] = await Promise.all([
    fetchJson<SchedulePayload>(SCHEDULE_URL),
    fetchJson<SessionsPayload>(SESSIONS_URL),
    fetchJson<SpeakersPayload>(SPEAKERS_URL),
  ]);

  return normalizeSeed(schedule, sessionsPayload, speakersPayload);
}

async function seed() {
  console.log("Seeding AI Engineer World's Fair 2026 data...");
  const seedData = await loadSeedData();
  console.log(`Source: ${seedData.source}`);

  // Clear existing schedule data. User accounts stay intact, but saved schedules are invalidated.
  await db.delete(userSchedules);
  await db.delete(talkEmbeddings);
  await db.delete(talkSpeakers);
  await db.delete(talks);
  await db.delete(speakers);
  await db.delete(tracks);
  await db.delete(rooms);

  await db.insert(tracks).values(seedData.tracks);
  console.log(`Inserted ${seedData.tracks.length} tracks`);

  await db.insert(rooms).values(seedData.rooms);
  console.log(`Inserted ${seedData.rooms.length} rooms`);

  await db.insert(speakers).values(seedData.speakers);
  console.log(`Inserted ${seedData.speakers.length} speakers`);

  await db.insert(talks).values(seedData.talks);
  console.log(`Inserted ${seedData.talks.length} sessions`);

  await db.insert(talkSpeakers).values(seedData.talkSpeakers);
  console.log(`Inserted ${seedData.talkSpeakers.length} talk-speaker assignments`);

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
