import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { rooms, speakers, talks, tracks, userSchedules } from "./schema";

export async function getAllTalks() {
  return db
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

  return result[0] ?? null;
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
    .from(talks)
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .where(eq(talks.speakerId, id))
    .orderBy(talks.startTime);

  return { ...speaker[0], talks: speakerTalks };
}

export async function getUserSchedule(userId: string) {
  return db
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
}

export async function isInSchedule(userId: string, talkId: string) {
  const result = await db
    .select()
    .from(userSchedules)
    .where(and(eq(userSchedules.userId, userId), eq(userSchedules.talkId, talkId)))
    .limit(1);

  return result.length > 0;
}
