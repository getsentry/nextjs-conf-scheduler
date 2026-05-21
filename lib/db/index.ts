import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Store singletons on globalThis so the instrumentation bundle (where Sentry
// patches client.execute) and page-handler bundles share the same instance.
const CLIENT_KEY = "__libsql_client" as const;
const DB_KEY = "__drizzle_db" as const;

declare global {
  var __libsql_client: Client | undefined;
  var __drizzle_db: LibSQLDatabase<typeof schema> | undefined;
}

export function getClient(): Client {
  if (!globalThis[CLIENT_KEY]) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error("TURSO_DATABASE_URL environment variable is not set");
    }
    globalThis[CLIENT_KEY] = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return globalThis[CLIENT_KEY];
}

export function getDb() {
  if (!globalThis[DB_KEY]) {
    globalThis[DB_KEY] = drizzle(getClient(), { schema });
  }
  return globalThis[DB_KEY];
}

// Lazy proxy — defers initialization until first use to avoid build-time env var errors
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
