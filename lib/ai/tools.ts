import * as Sentry from "@sentry/nextjs";
import { tool } from "ai";
import { and, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { rooms, speakers, talkSpeakers, talks, tracks, userSchedules } from "@/lib/db/schema";
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

const QUERY_STOP_WORDS = new Set([
  "about",
  "any",
  "are",
  "at",
  "by",
  "do",
  "does",
  "find",
  "for",
  "from",
  "have",
  "in",
  "is",
  "me",
  "of",
  "on",
  "recommend",
  "session",
  "sessions",
  "show",
  "talk",
  "talks",
  "the",
  "there",
  "to",
  "with",
]);

function entitySearchTerms(query: string) {
  const terms =
    query
      .match(/[a-z0-9][a-z0-9+.#-]*/gi)
      ?.map((term) => term.toLowerCase())
      .filter((term) => term.length >= 3 && !QUERY_STOP_WORDS.has(term)) ?? [];

  return [...new Set(terms)].slice(0, 4);
}

function hasEntityIntent(query: string) {
  return /\b(by|company|from|presented by|presenter|speaker|speakers)\b/i.test(query);
}

function entityKeywordCondition(pattern: string) {
  const coSpeakerCondition = sql<boolean>`exists (
    select 1
    from talk_speakers all_talk_speakers
    join speakers all_speakers on all_speakers.id = all_talk_speakers.speaker_id
    where all_talk_speakers.talk_id = ${talks.id}
      and (all_speakers.name ilike ${pattern} or all_speakers.company ilike ${pattern})
  )`;

  return or(
    ilike(speakers.name, pattern),
    ilike(speakers.company, pattern),
    coSpeakerCondition,
    ilike(tracks.name, pattern),
  );
}

function fullKeywordCondition(pattern: string) {
  return or(
    ilike(talks.title, pattern),
    ilike(talks.description, pattern),
    entityKeywordCondition(pattern),
  );
}

async function keywordSearchTalks({
  format,
  keywordConditions,
  level,
  limit,
  trackId,
}: {
  keywordConditions: SQL[];
  trackId?: string;
  level?: "beginner" | "intermediate" | "advanced";
  format?: "talk" | "workshop" | "keynote" | "panel" | "sponsor" | "plenary";
  limit: number;
}) {
  const conditions: SQL[] = [...keywordConditions];

  if (trackId) {
    conditions.push(eq(talks.trackId, trackId));
  }
  if (level) {
    conditions.push(eq(talks.level, level));
  }
  if (format) {
    conditions.push(eq(talks.format, format));
  }

  if (conditions.length === 0) {
    return [];
  }

  return db
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
    .where(and(...conditions))
    .orderBy(talks.startTime)
    .limit(limit);
}

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

type ToolSpeaker = {
  id: string;
  name: string;
  bio: string;
  company: string;
  role: string;
  avatar: string;
};

async function getToolSpeakers(talkIds: string[]) {
  if (talkIds.length === 0) return new Map<string, ToolSpeaker[]>();

  const result = await db
    .select({
      talkId: talkSpeakers.talkId,
      speaker: {
        id: speakers.id,
        name: speakers.name,
        bio: speakers.bio,
        company: speakers.company,
        role: speakers.role,
        avatar: speakers.avatar,
      },
    })
    .from(talkSpeakers)
    .innerJoin(speakers, eq(talkSpeakers.speakerId, speakers.id))
    .where(inArray(talkSpeakers.talkId, talkIds))
    .orderBy(talkSpeakers.talkId, talkSpeakers.position);

  const speakersByTalkId = new Map<string, ToolSpeaker[]>();
  for (const row of result) {
    const speakerRows = speakersByTalkId.get(row.talkId) ?? [];
    speakerRows.push(row.speaker);
    speakersByTalkId.set(row.talkId, speakerRows);
  }

  return speakersByTalkId;
}

async function withSpeakerArrays<T extends { id: string; speaker?: unknown }>(talkRows: T[]) {
  const speakersByTalkId = await getToolSpeakers(talkRows.map((talk) => talk.id));
  return talkRows.map((talk) => ({
    ...talk,
    speakers: speakersByTalkId.get(talk.id) ?? [],
  }));
}

export const createSearchTalksTool = (context?: SearchToolContext) =>
  tool({
    description:
      "Search for conference sessions by topic, speaker name, company, schedule gap, or keywords. Uses semantic embeddings when available and falls back to keyword search. For broad recommendation or schedule-gap questions, request 8-12 results.",
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
      const limit = maxResults ?? 6;
      const normalizedQuery = query.trim();

      if (!normalizedQuery && !trackId && !level && !format) {
        return [];
      }

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
        const exactTerms = entitySearchTerms(normalizedQuery);
        const exactEntityResults = await keywordSearchTalks({
          keywordConditions: exactTerms
            .map((term) => entityKeywordCondition(`%${term}%`))
            .filter((condition): condition is SQL => !!condition),
          trackId,
          level,
          format,
          limit,
        });

        if (
          exactEntityResults.length > 0 &&
          (exactTerms.length === 1 ||
            hasEntityIntent(normalizedQuery) ||
            exactEntityResults.length <= 3)
        ) {
          const resultsWithSpeakers = await withSpeakerArrays(exactEntityResults);
          return (await withSavedState(resultsWithSpeakers, context)).map(formatTalkTimes);
        }

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
            const resultsWithSpeakers = await withSpeakerArrays(semanticResults);
            return (await withSavedState(resultsWithSpeakers, context)).map(formatTalkTimes);
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

      const keywordConditions = normalizedQuery
        ? [fullKeywordCondition(`%${normalizedQuery}%`)].filter(
            (condition): condition is SQL => !!condition,
          )
        : [];
      const result = await keywordSearchTalks({
        keywordConditions,
        trackId,
        level,
        format,
        limit,
      });

      const resultsWithSpeakers = await withSpeakerArrays(result);
      return (await withSavedState(resultsWithSpeakers, context)).map(formatTalkTimes);
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
  description:
    "Get complete details of one specific talk by ID. Do not use this to discover sessions or fill schedule gaps; use searchTalks for that.",
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

    const speakersByTalkId = await getToolSpeakers([talkId]);
    return formatTalkTimes({
      ...result[0],
      speakers: speakersByTalkId.get(talkId) ?? [],
    });
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
    description:
      "Get the user's currently saved schedule as session cards. Use this before answering questions about what is missing from their schedule.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await db
        .select({
          id: userSchedules.talkId,
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
          saved: userSchedules.talkId,
        })
        .from(userSchedules)
        .innerJoin(talks, eq(userSchedules.talkId, talks.id))
        .innerJoin(speakers, eq(talks.speakerId, speakers.id))
        .innerJoin(tracks, eq(talks.trackId, tracks.id))
        .innerJoin(rooms, eq(talks.roomId, rooms.id))
        .where(eq(userSchedules.userId, userId))
        .orderBy(talks.startTime);

      const resultsWithSpeakers = (await withSpeakerArrays(result)).map((talk) => ({
        ...talk,
        saved: Boolean(talk.saved),
      }));

      return resultsWithSpeakers.map(formatTalkTimes);
    },
  });
