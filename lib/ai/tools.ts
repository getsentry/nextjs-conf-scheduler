import * as Sentry from "@sentry/nextjs";
import { tool } from "ai";
import { and, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { rooms, speakers, talks, tracks, userSchedules } from "@/lib/db/schema";
import { isSentryTalkSearchQuery, SENTRY_SEARCH_ERROR_MESSAGE } from "@/lib/sentry-demo";
import { semanticSearchTalks } from "./embeddings";

type SearchToolContext = {
  identity?: {
    id: string;
    type: "user" | "guest";
    accessTier: "guest" | "authenticated";
    isInternalSentry?: boolean;
  };
};

async function withSavedState<T extends { id: string }>(
  talksToMark: T[],
  context: SearchToolContext | undefined,
) {
  if (context?.identity?.type !== "user" || talksToMark.length === 0) {
    return talksToMark;
  }

  const savedRows = await db
    .select({ talkId: userSchedules.talkId })
    .from(userSchedules)
    .where(
      and(
        eq(userSchedules.userId, context.identity.id),
        inArray(
          userSchedules.talkId,
          talksToMark.map((talk) => talk.id),
        ),
      ),
    );
  const savedTalkIds = new Set(savedRows.map((row) => row.talkId));

  return talksToMark.map((talk) => ({ ...talk, saved: savedTalkIds.has(talk.id) }));
}

function formatTalkTimes<T extends { startTime: number; endTime: number }>(talk: T) {
  return {
    ...talk,
    date: new Date(talk.startTime * 1000).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/Los_Angeles",
    }),
    startTime: new Date(talk.startTime * 1000).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    }),
    endTime: new Date(talk.endTime * 1000).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    }),
  };
}

export const createSearchTalksTool = (context?: SearchToolContext) =>
  tool({
    description:
      "Search for conference sessions by topic, speaker name, company, or keywords. Uses semantic embeddings when available and falls back to keyword search.",
    inputSchema: z.object({
      query: z.string().describe("Search query (topic, keyword, company, or speaker name)"),
      trackId: z.string().optional().describe("Filter by track ID from getTracks"),
      level: z
        .enum(["beginner", "intermediate", "advanced"])
        .optional()
        .describe("Filter by difficulty level"),
      format: z
        .enum(["talk", "workshop", "keynote", "panel", "sponsor", "plenary"])
        .optional()
        .describe("Filter by talk format"),
      maxResults: z.number().int().min(1).max(20).optional().describe("Maximum results to return"),
    }),
    execute: async ({ query, trackId, level, format, maxResults }) => {
      const limit = maxResults ?? 12;
      const normalizedQuery = query.trim();

      if (
        context?.identity?.isInternalSentry === true &&
        normalizedQuery &&
        isSentryTalkSearchQuery(normalizedQuery)
      ) {
        const error = new Error(SENTRY_SEARCH_ERROR_MESSAGE);

        Sentry.withScope((scope) => {
          scope.setUser({ id: context.identity?.id });
          scope.setTag("demo.scenario", "sentry_search_tool_error");
          scope.setContext("tool", {
            name: "searchTalks",
            query: normalizedQuery.slice(0, 120),
          });
          Sentry.captureException(error);
        });

        throw error;
      }

      if (normalizedQuery) {
        try {
          const semanticResults = await semanticSearchTalks({
            query: normalizedQuery,
            trackId,
            level,
            format,
            limit,
            context: {
              identity: context?.identity,
              operation: "query",
            },
          });

          if (semanticResults.length > 0) {
            return (await withSavedState(semanticResults, context)).map(formatTalkTimes);
          }
        } catch (error) {
          Sentry.logger.warn("Semantic talk search failed; falling back to keyword search", {
            action: "ai.embedding.search",
            result: "fallback",
            query: normalizedQuery.slice(0, 120),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const conditions: SQL[] = [];

      if (normalizedQuery) {
        const keywordCondition = or(
          ilike(talks.title, `%${normalizedQuery}%`),
          ilike(talks.description, `%${normalizedQuery}%`),
          ilike(speakers.name, `%${normalizedQuery}%`),
          ilike(speakers.company, `%${normalizedQuery}%`),
          ilike(tracks.name, `%${normalizedQuery}%`),
        );

        if (keywordCondition) {
          conditions.push(keywordCondition);
        }
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
          speakerAvatar: speakers.avatar,
          track: tracks.name,
          trackId: tracks.id,
          trackColor: tracks.color,
          room: rooms.name,
        })
        .from(talks)
        .innerJoin(speakers, eq(talks.speakerId, speakers.id))
        .innerJoin(tracks, eq(talks.trackId, tracks.id))
        .innerJoin(rooms, eq(talks.roomId, rooms.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(talks.startTime)
        .limit(limit);

      return (await withSavedState(result, context)).map(formatTalkTimes);
    },
  });

export const searchTalks = createSearchTalksTool();

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
          avatar: speakers.avatar,
        },
        track: {
          name: tracks.name,
          description: tracks.description,
          color: tracks.color,
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

    return formatTalkTimes(result[0]);
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

      return result.map(formatTalkTimes);
    },
  });
