import * as dotenv from "dotenv";
import { getClient } from "../lib/db";

dotenv.config({ path: ".env.local" });

async function main() {
  const sql = getClient();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql.end();
  console.log("Postgres extensions ready: vector");
}

main().catch((error) => {
  console.error("Failed to initialize Postgres extensions:", error);
  process.exit(1);
});
