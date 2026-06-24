import { embedMany, gateway } from "ai";
import * as dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import {
  buildTalkEmbeddingText,
  embeddingContentHash,
  TALK_EMBEDDING_MODEL,
} from "../lib/ai/embeddings";
import { db, getClient } from "../lib/db";
import { rooms, speakers, talkEmbeddings, talkSpeakers, talks, tracks } from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

const BATCH_SIZE = 64;

type TalkRow = Awaited<ReturnType<typeof loadTalks>>[number];

async function ensureVectorExtension() {
  const sql = getClient();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
}

async function ensureVectorIndex() {
  const sql = getClient();
  await sql`
    CREATE INDEX IF NOT EXISTS talk_embeddings_embedding_hnsw_idx
    ON talk_embeddings
    USING hnsw (embedding vector_cosine_ops)
  `;
}

async function loadTalks() {
  const talkRows = await db
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
      speakerRole: speakers.role,
      track: tracks.name,
      trackDescription: tracks.description,
      room: rooms.name,
    })
    .from(talks)
    .innerJoin(speakers, eq(talks.speakerId, speakers.id))
    .innerJoin(tracks, eq(talks.trackId, tracks.id))
    .innerJoin(rooms, eq(talks.roomId, rooms.id))
    .orderBy(talks.startTime);

  if (talkRows.length === 0) {
    return [];
  }

  const speakerRows = await db
    .select({
      talkId: talkSpeakers.talkId,
      name: speakers.name,
      company: speakers.company,
      role: speakers.role,
    })
    .from(talkSpeakers)
    .innerJoin(speakers, eq(talkSpeakers.speakerId, speakers.id))
    .where(
      inArray(
        talkSpeakers.talkId,
        talkRows.map((talk) => talk.id),
      ),
    )
    .orderBy(talkSpeakers.talkId, talkSpeakers.position);

  const speakersByTalkId = new Map<string, string[]>();
  for (const speaker of speakerRows) {
    const speakersForTalk = speakersByTalkId.get(speaker.talkId) ?? [];
    speakersForTalk.push([speaker.name, speaker.role, speaker.company].filter(Boolean).join(" — "));
    speakersByTalkId.set(speaker.talkId, speakersForTalk);
  }

  return talkRows.map((talk) => ({
    ...talk,
    speakers: speakersByTalkId.get(talk.id)?.join("; ") ?? talk.speaker,
  }));
}

function toEmbeddingDocument(talk: TalkRow) {
  const content = buildTalkEmbeddingText(talk);
  return {
    talkId: talk.id,
    content,
    contentHash: embeddingContentHash(content),
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("AI_GATEWAY_API_KEY or Vercel OIDC credentials are required to embed talks");
  }

  await ensureVectorExtension();
  await ensureVectorIndex();

  const documents = (await loadTalks()).map(toEmbeddingDocument);
  const existing = await db
    .select({ talkId: talkEmbeddings.talkId, contentHash: talkEmbeddings.contentHash })
    .from(talkEmbeddings)
    .where(eq(talkEmbeddings.embeddingModel, TALK_EMBEDDING_MODEL));

  const existingHashes = new Map(existing.map((row) => [row.talkId, row.contentHash]));
  const staleDocuments = documents.filter(
    (doc) => existingHashes.get(doc.talkId) !== doc.contentHash,
  );

  if (staleDocuments.length === 0) {
    console.log(`All ${documents.length} talk embeddings are up to date.`);
    await getClient().end();
    return;
  }

  console.log(
    `Embedding ${staleDocuments.length}/${documents.length} talks with ${TALK_EMBEDDING_MODEL}...`,
  );

  let embeddedCount = 0;
  let tokenCount = 0;

  for (const batch of chunk(staleDocuments, BATCH_SIZE)) {
    const { embeddings, usage } = await embedMany({
      model: gateway.embeddingModel(TALK_EMBEDDING_MODEL),
      values: batch.map((doc) => doc.content),
      maxParallelCalls: 2,
      providerOptions: {
        gateway: {
          tags: ["nextjs-conf-scheduler", "embeddings", "index"],
        },
      },
      experimental_telemetry: {
        isEnabled: true,
        functionId: "conference-scheduler.embeddings.index",
        recordInputs: true,
        recordOutputs: false,
        metadata: {
          model_id: TALK_EMBEDDING_MODEL,
          operation: "index",
          batch_size: batch.length,
        },
      },
    });

    tokenCount += usage.tokens;

    // Use per-row upserts because each talk has distinct content, hash, and vector.
    for (let index = 0; index < batch.length; index++) {
      await db
        .insert(talkEmbeddings)
        .values({
          talkId: batch[index].talkId,
          embeddingModel: TALK_EMBEDDING_MODEL,
          contentHash: batch[index].contentHash,
          content: batch[index].content,
          embedding: embeddings[index],
          embeddedAt: Math.floor(Date.now() / 1000),
        })
        .onConflictDoUpdate({
          target: talkEmbeddings.talkId,
          set: {
            embeddingModel: TALK_EMBEDDING_MODEL,
            contentHash: batch[index].contentHash,
            content: batch[index].content,
            embedding: embeddings[index],
            embeddedAt: Math.floor(Date.now() / 1000),
          },
        });
    }

    embeddedCount += batch.length;
    console.log(`Embedded ${embeddedCount}/${staleDocuments.length} talks...`);
  }

  console.log(`Done. Embedded ${embeddedCount} talks using ${tokenCount} tokens.`);
  await getClient().end();
}

main().catch(async (error) => {
  console.error("Failed to embed talks:", error);
  await getClient()
    .end({ timeout: 1 })
    .catch(() => undefined);
  process.exit(1);
});
