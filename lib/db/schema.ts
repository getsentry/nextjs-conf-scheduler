import { index, integer, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";

export const speakers = pgTable("speakers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  avatar: text("avatar").notNull().default(""),
  company: text("company").notNull().default(""),
  role: text("role").notNull().default(""),
  twitter: text("twitter"),
});

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  description: text("description").notNull().default(""),
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(0),
});

export const talks = pgTable(
  "talks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // Primary speaker — every talk has one (a "tbd" placeholder for talks with no announced speaker)
    // so existing single-speaker joins keep working. Co-speakers live in `talkSpeakers`.
    speakerId: text("speaker_id")
      .notNull()
      .references(() => speakers.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    startTime: integer("start_time").notNull(),
    endTime: integer("end_time").notNull(),
    level: text("level", { enum: ["beginner", "intermediate", "advanced"] }).notNull(),
    format: text("format", {
      enum: ["talk", "workshop", "keynote", "panel", "sponsor", "plenary"],
    }).notNull(),
    status: text("status", { enum: ["confirmed", "tentative", "hold"] })
      .notNull()
      .default("confirmed"),
  },
  (table) => ({
    startTimeIdx: index("talks_start_time_idx").on(table.startTime),
    trackIdx: index("talks_track_idx").on(table.trackId),
  }),
);

export const talkSpeakers = pgTable(
  "talk_speakers",
  {
    talkId: text("talk_id")
      .notNull()
      .references(() => talks.id),
    speakerId: text("speaker_id")
      .notNull()
      .references(() => speakers.id),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.talkId, table.speakerId] }),
  }),
);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const userSchedules = pgTable(
  "user_schedules",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    talkId: text("talk_id")
      .notNull()
      .references(() => talks.id),
    addedAt: integer("added_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.talkId] }),
  }),
);

export const talkEmbeddings = pgTable(
  "talk_embeddings",
  {
    talkId: text("talk_id")
      .primaryKey()
      .references(() => talks.id, { onDelete: "cascade" }),
    embeddingModel: text("embedding_model").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    embeddedAt: integer("embedded_at").notNull(),
  },
  (table) => ({
    embeddingModelIdx: index("talk_embeddings_model_idx").on(table.embeddingModel),
    contentHashIdx: index("talk_embeddings_content_hash_idx").on(table.contentHash),
  }),
);

// Legacy/simple fixed-window rate limiting table retained for compatibility with existing DBs.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    identityType: text("identity_type", { enum: ["user", "guest"] }).notNull(),
    identityId: text("identity_id").notNull(),
    windowStart: integer("window_start").notNull(),
    windowEnd: integer("window_end").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    identityWindowIdx: index("ai_usage_identity_window_idx").on(
      table.identityType,
      table.identityId,
      table.windowStart,
    ),
  }),
);
