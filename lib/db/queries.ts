import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { rooms, speakers, talkSpeakers, talks, tracks, userSchedules } from "./schema";

type SpeakerSummary = {
  id: string;
  name: string;
  avatar: string;
  company: string;
};

async function getTalkSpeakerSummaries(talkIds: string[]) {
  if (talkIds.length === 0) return new Map<string, SpeakerSummary[]>();

  const rows = await db
    .select({
      talkId: talkSpeakers.talkId,
      speaker: {
        id: speakers.id,
        name: speakers.name,
        avatar: speakers.avatar,
        company: speakers.company,
      },
    })
    .from(talkSpeakers)
    .innerJoin(speakers, eq(talkSpeakers.speakerId, speakers.id))
    .where(inArray(talkSpeakers.talkId, talkIds))
    .orderBy(talkSpeakers.talkId, talkSpeakers.position);

  const byTalkId = new Map<string, SpeakerSummary[]>();
  for (const row of rows) {
    const talkSpeakers = byTalkId.get(row.talkId) ?? [];
    talkSpeakers.push(row.speaker);
    byTalkId.set(row.talkId, talkSpeakers);
  }

  return byTalkId;
}

async function getTalkSpeakerDetails(talkId: string) {
  return db
    .select({
      id: speakers.id,
      name: speakers.name,
      bio: speakers.bio,
      avatar: speakers.avatar,
      company: speakers.company,
      role: speakers.role,
      twitter: speakers.twitter,
    })
    .from(talkSpeakers)
    .innerJoin(speakers, eq(talkSpeakers.speakerId, speakers.id))
    .where(eq(talkSpeakers.talkId, talkId))
    .orderBy(talkSpeakers.position);
}

function attachSpeakerSummaries<T extends { id: string; speaker: SpeakerSummary }>(
  talkRows: T[],
  speakersByTalkId: Map<string, SpeakerSummary[]>,
) {
  return talkRows.map((talk) => ({
    ...talk,
    speakers: speakersByTalkId.get(talk.id) ?? [talk.speaker],
  }));
}

export async function getAllTalks() {
  const result = await db
    .select({
      id: talks.id,
      title: talks.title,
      description: talks.description,
      startTime: talks.startTime,
      endTime: talks.endTime,
      level: talks.level,
      format: talks.format,
      speaker: {
        id: speakers.id,
        name: speakers.name,
        avatar: speakers.avatar,
        company: speakers.company,
      },
      track: {
        id: tracks.id,
        name: tracks.name,
        color: tracks.color,
      },
      room: {
        id: rooms.id,
        name: rooms.name,
      },
    })
    .from(talks)
    .innerJoin(speakers, eq(talks.speakerId, speakers.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .orderBy(talks.startTime);

  const speakersByTalkId = await getTalkSpeakerSummaries(result.map((talk) => talk.id));
  return attachSpeakerSummaries(result, speakersByTalkId);
}

export async function getTalkById(id: string) {
  const result = await db
    .select({
      id: talks.id,
      title: talks.title,
      description: talks.description,
      startTime: talks.startTime,
      endTime: talks.endTime,
      level: talks.level,
      format: talks.format,
      speaker: {
        id: speakers.id,
        name: speakers.name,
        bio: speakers.bio,
        avatar: speakers.avatar,
        company: speakers.company,
        role: speakers.role,
        twitter: speakers.twitter,
      },
      track: {
        id: tracks.id,
        name: tracks.name,
        color: tracks.color,
        description: tracks.description,
      },
      room: {
        id: rooms.id,
        name: rooms.name,
        capacity: rooms.capacity,
      },
    })
    .from(talks)
    .innerJoin(speakers, eq(talks.speakerId, speakers.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .where(eq(talks.id, id))
    .limit(1);

  const talk = result[0];
  if (!talk) return null;

  const talkSpeakerRows = await getTalkSpeakerDetails(talk.id);
  return { ...talk, speakers: talkSpeakerRows.length > 0 ? talkSpeakerRows : [talk.speaker] };
}

export async function getAllTracks() {
  return db.select().from(tracks);
}

export async function getAllSpeakers() {
  return db.select().from(speakers).orderBy(speakers.name);
}

export async function getSpeakerById(id: string) {
  const speaker = await db.select().from(speakers).where(eq(speakers.id, id)).limit(1);

  if (!speaker[0]) return null;

  const speakerTalks = await db
    .select({
      id: talks.id,
      title: talks.title,
      description: talks.description,
      startTime: talks.startTime,
      endTime: talks.endTime,
      level: talks.level,
      format: talks.format,
      track: {
        id: tracks.id,
        name: tracks.name,
        color: tracks.color,
      },
      room: {
        id: rooms.id,
        name: rooms.name,
      },
    })
    .from(talkSpeakers)
    .innerJoin(talks, eq(talkSpeakers.talkId, talks.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .where(eq(talkSpeakers.speakerId, id))
    .orderBy(talks.startTime);

  return { ...speaker[0], talks: speakerTalks };
}

export async function getUserScheduleTalkIds(userId: string) {
  const result = await db
    .select({ talkId: userSchedules.talkId })
    .from(userSchedules)
    .where(eq(userSchedules.userId, userId));

  return result.map((row) => row.talkId);
}

export async function getUserSchedule(userId: string) {
  const result = await db
    .select({
      talkId: userSchedules.talkId,
      addedAt: userSchedules.addedAt,
      talk: {
        id: talks.id,
        title: talks.title,
        description: talks.description,
        startTime: talks.startTime,
        endTime: talks.endTime,
        level: talks.level,
        format: talks.format,
      },
      speaker: {
        id: speakers.id,
        name: speakers.name,
        avatar: speakers.avatar,
        company: speakers.company,
      },
      track: {
        id: tracks.id,
        name: tracks.name,
        color: tracks.color,
      },
      room: {
        id: rooms.id,
        name: rooms.name,
      },
    })
    .from(userSchedules)
    .innerJoin(talks, eq(userSchedules.talkId, talks.id))
    .innerJoin(speakers, eq(talks.speakerId, speakers.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .where(eq(userSchedules.userId, userId))
    .orderBy(talks.startTime);

  const speakersByTalkId = await getTalkSpeakerSummaries(result.map((row) => row.talk.id));

  return result.map((row) => ({
    ...row,
    speakers: speakersByTalkId.get(row.talk.id) ?? [row.speaker],
  }));
}

export async function isInSchedule(userId: string, talkId: string) {
  const result = await db
    .select()
    .from(userSchedules)
    .where(and(eq(userSchedules.userId, userId), eq(userSchedules.talkId, talkId)))
    .limit(1);

  return result.length > 0;
}
