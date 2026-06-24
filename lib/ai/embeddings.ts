import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { type EmbeddingModelUsage, embed, gateway } from "ai";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { aiTier } from "@/lib/ai/usage";
import { db } from "@/lib/db";
import { rooms, speakers, talkEmbeddings, talks, tracks } from "@/lib/db/schema";

export const TALK_EMBEDDING_MODEL = "alibaba/qwen3-embedding-0.6b";
export const TALK_EMBEDDING_DIMENSIONS = 1024;

type EmbeddingContext = {
  identity?: {
    id: string;
    type: "user" | "guest";
    accessTier: "guest" | "authenticated";
  };
  operation?: "query" | "index";
};

export type TalkEmbeddingSource = {
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  level: string;
  format: string;
  speaker: string;
  speakerCompany: string;
  speakerRole: string;
  track: string;
  trackDescription: string;
  room: string;
};

export type SemanticSearchFilters = {
  query: string;
  trackId?: string;
  level?: "beginner" | "intermediate" | "advanced";
  format?: "talk" | "workshop" | "keynote" | "panel" | "sponsor" | "plenary";
  limit?: number;
  context?: EmbeddingContext;
};

function formatConferenceTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

export function buildTalkEmbeddingText(talk: TalkEmbeddingSource) {
  return [
    `Title: ${talk.title}`,
    `Description: ${talk.description}`,
    `Speaker: ${talk.speaker}`,
    `Speaker role: ${talk.speakerRole}`,
    `Speaker company: ${talk.speakerCompany}`,
    `Track: ${talk.track}`,
    `Track description: ${talk.trackDescription}`,
    `Format: ${talk.format}`,
    `Level: ${talk.level}`,
    `Room: ${talk.room}`,
    `Starts: ${formatConferenceTime(talk.startTime)}`,
    `Ends: ${formatConferenceTime(talk.endTime)}`,
  ].join("\n");
}

export function embeddingContentHash(content: string) {
  return createHash("sha256").update(`${TALK_EMBEDDING_MODEL}\n${content}`).digest("hex");
}

function vectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

function metricAttributes(context: EmbeddingContext | undefined) {
  return {
    model_id: TALK_EMBEDDING_MODEL,
    operation: context?.operation ?? "query",
    ...(context?.identity
      ? {
          ai_tier: aiTier(context.identity),
          identity_type: context.identity.type,
          ...(context.identity.type === "user" ? { identity_id: context.identity.id } : {}),
        }
      : {}),
  };
}

function telemetry(context: EmbeddingContext | undefined) {
  const attributes = metricAttributes(context);
  return {
    isEnabled: true,
    functionId: `conference-scheduler.embeddings.${attributes.operation}`,
    recordInputs: true,
    // Embedding vectors are large and not useful to inspect in traces.
    recordOutputs: false,
    metadata: attributes,
  };
}

function gatewayProviderOptions(context: EmbeddingContext | undefined) {
  return {
    gateway: {
      ...(context?.identity ? { user: context.identity.id } : {}),
      tags: ["nextjs-conf-scheduler", "embeddings", context?.operation ?? "query"],
    },
  };
}

function recordEmbeddingUsage(usage: EmbeddingModelUsage, context: EmbeddingContext | undefined) {
  const attributes = metricAttributes(context);

  Sentry.metrics.count("ai.embedding.requests", 1, { attributes });
  Sentry.metrics.distribution("ai.embedding.tokens", usage.tokens, {
    unit: "token",
    attributes,
  });
}

export async function embedSearchQuery(query: string, context?: EmbeddingContext) {
  const result = await embed({
    model: gateway.embeddingModel(TALK_EMBEDDING_MODEL),
    value: query,
    providerOptions: gatewayProviderOptions(context),
    experimental_telemetry: telemetry(context),
  });

  recordEmbeddingUsage(result.usage, context);
  return result.embedding;
}

export async function semanticSearchTalks({
  query,
  trackId,
  level,
  format,
  limit = 12,
  context,
}: SemanticSearchFilters) {
  const queryEmbedding = await embedSearchQuery(query, context);
  const distance = sql<number>`${talkEmbeddings.embedding} <=> ${vectorLiteral(queryEmbedding)}::vector`;
  const similarity = sql<number>`1 - (${distance})`;

  const conditions: SQL[] = [eq(talkEmbeddings.embeddingModel, TALK_EMBEDDING_MODEL)];

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
      semanticScore: similarity,
    })
    .from(talkEmbeddings)
    .innerJoin(talks, eq(talkEmbeddings.talkId, talks.id))
    .innerJoin(speakers, eq(talks.speakerId, speakers.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .where(and(...conditions))
    .orderBy(distance)
    .limit(limit);

  Sentry.metrics.distribution("ai.embedding.search_results", result.length, {
    attributes: metricAttributes(context),
  });

  return result;
}
