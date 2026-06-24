import { createRequire } from "node:module";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import type { Sql } from "postgres";
import * as schema from "./schema";

const require = createRequire(import.meta.url);

type PostgresFactory = typeof postgres;

function loadPostgres(): PostgresFactory {
  return require("postgres") as PostgresFactory;
}

// Store singletons on globalThis so route handlers and instrumentation share one pool per process.
const SQL_KEY = "__postgres_client" as const;
const DB_KEY = "__drizzle_db" as const;

declare global {
  var __postgres_client: Sql | undefined;
  var __drizzle_db: PostgresJsDatabase<typeof schema> | undefined;
}

export function getClient(): Sql {
  if (!globalThis[SQL_KEY]) {
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    globalThis[SQL_KEY] = loadPostgres()(connectionString, {
      // Neon/Vercel pooled connections use PgBouncer; disable prepared statements for compatibility.
      prepare: false,
    });
  }

  return globalThis[SQL_KEY];
}

export function getDb() {
  if (!globalThis[DB_KEY]) {
    globalThis[DB_KEY] = drizzle(getClient(), { schema });
  }
  return globalThis[DB_KEY];
}

// Lazy proxy — defers initialization until first use to avoid build-time env var errors.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
