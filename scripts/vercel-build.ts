import { spawnSync } from "node:child_process";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function normalizeDbUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.password = "";
    url.username = "";
    return url.toString();
  } catch {
    return value;
  }
}

function previewDbGuard() {
  const current = normalizeDbUrl(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
  if (!current)
    throw new Error("DATABASE_URL or POSTGRES_URL must be set for conference previews.");

  const protectedUrls = [
    process.env.PRIMARY_DATABASE_URL,
    process.env.PRODUCTION_DATABASE_URL,
    process.env.NEON_PRIMARY_DATABASE_URL,
  ]
    .map(normalizeDbUrl)
    .filter(Boolean);

  if (protectedUrls.length === 0 && process.env.ALLOW_UNGUARDED_PREVIEW_DB !== "1") {
    throw new Error(
      "Set PRIMARY_DATABASE_URL/PRODUCTION_DATABASE_URL before preview seeding, or explicitly set ALLOW_UNGUARDED_PREVIEW_DB=1.",
    );
  }

  if (protectedUrls.includes(current)) {
    throw new Error(
      "Refusing to prepare conference preview because DATABASE_URL matches a primary DB URL.",
    );
  }
}

const isConferencePreview =
  process.env.VERCEL_ENV === "preview" && process.env.CONFERENCE_SEED_FILE;

if (isConferencePreview) {
  previewDbGuard();
  console.log(`Preparing conference preview from ${process.env.CONFERENCE_SEED_FILE}`);
  run("pnpm", ["db:push"]);
  run("pnpm", ["db:seed:conference"]);

  if (process.env.SKIP_CONFERENCE_EMBED !== "1") {
    run("pnpm", ["db:embed"]);
  }
} else {
  console.log("No conference preview seed configured; running app build only.");
}

run("pnpm", ["build"]);
