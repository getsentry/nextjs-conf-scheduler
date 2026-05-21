import { tool } from "ai";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { rooms, speakers, talks, tracks, userSchedules } from "@/lib/db/schema";

export const searchTalks = tool({
  description:
    "Search for conference talks by topic, speaker name, or keywords. Returns matching talks with details.",
  inputSchema: z.object({
    query: z.string().describe("Search query (topic, keyword, or speaker name)"),
    trackId: z
      .string()
      .optional()
      .describe("Filter by track ID (ai, perf, fullstack, dx, platform)"),
    level: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional()
      .describe("Filter by difficulty level"),
    format: z
      .enum(["talk", "workshop", "keynote", "panel"])
      .optional()
      .describe("Filter by talk format"),
  }),
  execute: async ({ query, trackId, level, format }) => {
    const conditions = [];

    if (query) {
      conditions.push(or(like(talks.title, `%${query}%`), like(talks.description, `%${query}%`)));
    }
    if (trackId) {
      conditions.push(eq(talks.trackId, trackId));
    }
    if (level) {
      conditions.push(eq(talks.level, level));
    }
    if (format) {
      conditions.push(eq(talks.format, format));
    }

    const result = await db
      .select({
        id: talks.id,
        title: talks.title,
        description: talks.description,
        startTime: talks.startTime,
        endTime: talks.endTime,
        level: talks.level,
        format: talks.format,
        speaker: speakers.name,
        speakerCompany: speakers.company,
        track: tracks.name,
        trackId: tracks.id,
        room: rooms.name,
      })
      .from(talks)
      .innerJoin(speakers, eq(talks.speakerId, speakers.id))
      .innerJoin(tracks, eq(talks.trackId, tracks.id))
      .innerJoin(rooms, eq(talks.roomId, rooms.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(talks.startTime);

    return result.map((talk) => ({
      ...talk,
      startTime: new Date(talk.startTime * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      endTime: new Date(talk.endTime * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    }));
  },
});

export const getTracks = tool({
  description: "Get all available conference tracks with their descriptions.",
  inputSchema: z.object({}),
  execute: async () => {
    return db.select().from(tracks);
  },
});

export const getTalkDetails = tool({
  description: "Get complete details of a specific talk including speaker bio and track info.",
  inputSchema: z.object({
    talkId: z.string().describe("The ID of the talk to get details for"),
  }),
  execute: async ({ talkId }) => {
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
          name: speakers.name,
          bio: speakers.bio,
          company: speakers.company,
          role: speakers.role,
        },
        track: {
          name: tracks.name,
          description: tracks.description,
        },
        room: rooms.name,
      })
      .from(talks)
      .innerJoin(speakers, eq(talks.speakerId, speakers.id))
      .innerJoin(tracks, eq(talks.trackId, tracks.id))
      .innerJoin(rooms, eq(talks.roomId, rooms.id))
      .where(eq(talks.id, talkId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    return {
      ...result[0],
      startTime: new Date(result[0].startTime * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      endTime: new Date(result[0].endTime * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  },
});

export const checkConflicts = tool({
  description: "Check if a list of talks have any time conflicts (overlapping schedules).",
  inputSchema: z.object({
    talkIds: z.array(z.string()).describe("Array of talk IDs to check for conflicts"),
  }),
  execute: async ({ talkIds }) => {
    if (talkIds.length === 0) {
      return { conflicts: [], hasConflicts: false };
    }

    const talkTimes = await db
      .select({
        id: talks.id,
        title: talks.title,
        startTime: talks.startTime,
        endTime: talks.endTime,
      })
      .from(talks)
      .where(inArray(talks.id, talkIds));

    const conflicts: Array<{
      talk1: { id: string; title: string };
      talk2: { id: string; title: string };
    }> = [];

    for (let i = 0; i < talkTimes.length; i++) {
      for (let j = i + 1; j < talkTimes.length; j++) {
        const a = talkTimes[i];
        const b = talkTimes[j];

        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          conflicts.push({
            talk1: { id: a.id, title: a.title },
            talk2: { id: b.id, title: b.title },
          });
        }
      }
    }

    return {
      conflicts,
      hasConflicts: conflicts.length > 0,
      message:
        conflicts.length > 0
          ? `Found ${conflicts.length} conflict(s) between talks.`
          : "No conflicts found - all talks can be attended.",
    };
  },
});

export const getUserSchedule = (userId: string) =>
  tool({
    description: "Get the user's currently saved schedule.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await db
        .select({
          talkId: userSchedules.talkId,
          title: talks.title,
          startTime: talks.startTime,
          endTime: talks.endTime,
          track: tracks.name,
          room: rooms.name,
        })
        .from(userSchedules)
        .innerJoin(talks, eq(userSchedules.talkId, talks.id))
        .innerJoin(tracks, eq(talks.trackId, tracks.id))
        .innerJoin(rooms, eq(talks.roomId, rooms.id))
        .where(eq(userSchedules.userId, userId))
        .orderBy(talks.startTime);

      return result.map((item) => ({
        ...item,
        startTime: new Date(item.startTime * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
        endTime: new Date(item.endTime * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      }));
    },
  });
