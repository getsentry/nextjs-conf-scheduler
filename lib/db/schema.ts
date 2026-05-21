import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const speakers = sqliteTable("speakers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bio: text("bio").notNull(),
  avatar: text("avatar").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  twitter: text("twitter"),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  description: text("description").notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
});

export const talks = sqliteTable("talks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
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
  format: text("format", { enum: ["talk", "workshop", "keynote", "panel"] }).notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const userSchedules = sqliteTable("user_schedules", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  talkId: text("talk_id")
    .notNull()
    .references(() => talks.id),
  addedAt: integer("added_at").notNull(),
});
