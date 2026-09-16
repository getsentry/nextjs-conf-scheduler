// Builds a conference seed snapshot for AI Engineer Paris 2026 from the live page bundle.
//
// ai.engineer has no public JSON feed or Sessionize API endpoint for this event: the
// schedule and speaker list only exist as JS literal arrays inside the Next.js page
// chunk shipped to the browser. We parse that chunk with the TypeScript compiler's AST
// (never eval/Function/vm) and convert only literal expressions, so a malicious or
// unexpected bundle can't execute code during import.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const PARIS_PAGE_URL = "https://ai.engineer/paris/2026";
const CHUNK_PATTERN = /\/_next\/static\/chunks\/pages\/paris\/2026-[^"]+\.js/;
const USER_AGENT = "conf-scheduler-importer/1.0 (+https://ai.engineer/paris/2026)";

const PROFILE_CACHE_PATH = path.resolve(
  "data/conference-seeds/sources/ai-engineer-paris-2026.sessionize-profiles.json",
);
const DEFAULT_OUT_PATH = "data/conference-seeds/ai-engineer-paris-2026.json";

const TRACK_COLORS = [
  "#6C5FC7",
  "#F55459",
  "#2BA185",
  "#F5B000",
  "#3D74DB",
  "#E1567C",
  "#8B5CF6",
  "#FF7738",
];

const args = process.argv.slice(2);

function flagValue(name: string, fallback?: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

function hasFlag(name: string) {
  return args.includes(name);
}

type RawSession = {
  id: string | number;
  date: string;
  start: string;
  end: string;
  title: string;
  owner: string;
  company?: string;
  description?: string;
  room: string;
  topic?: string;
};

type RawSpeaker = {
  id: string;
  name: string;
  company?: string;
  company_website?: string;
  title?: string;
  linkedin?: string;
  profile_picture?: string;
  sessions?: unknown;
  room?: string;
};

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}

async function fetchChunkSource() {
  const html = await fetchText(PARIS_PAGE_URL);
  const match = html.match(CHUNK_PATTERN);
  if (!match) {
    throw new Error(`Could not find the paris/2026 page chunk script in ${PARIS_PAGE_URL}`);
  }
  const chunkUrl = new URL(match[0], PARIS_PAGE_URL).toString();
  return fetchText(chunkUrl);
}

/** Sentinel thrown internally when an AST node isn't a literal we can safely convert. */
class NotLiteralError extends Error {}

// Converts a literal-only AST node (strings, numbers, booleans incl. minified
// !0/!1, null, negative numbers, arrays, and plain object literals) into a plain
// JS value. Anything else (identifiers, calls, spreads, computed keys, ...)
// throws NotLiteralError so the caller can skip that array.
function evaluateLiteral(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
      return -Number(node.operand.text);
    }
    if (node.operator === ts.SyntaxKind.ExclamationToken && ts.isNumericLiteral(node.operand)) {
      // Minified booleans: !0 === true, !1 === false.
      const value = Number(node.operand.text);
      if (value === 0) return true;
      if (value === 1) return false;
    }
    throw new NotLiteralError();
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluateLiteral(element));
  }

  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) throw new NotLiteralError();
      let key: string;
      if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
        key = property.name.text;
      } else {
        throw new NotLiteralError();
      }
      result[key] = evaluateLiteral(property.initializer);
    }
    return result;
  }

  throw new NotLiteralError();
}

// Finds every array literal whose elements are all object literals, converts
// each one with evaluateLiteral, and skips (rather than throws on) arrays that
// contain anything non-literal.
function findObjectArrays(source: string): Record<string, unknown>[][] {
  const sourceFile = ts.createSourceFile("chunk.js", source, ts.ScriptTarget.Latest, true);
  const found: Record<string, unknown>[][] = [];

  function visit(node: ts.Node) {
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length > 0 &&
      node.elements.every((element) => ts.isObjectLiteralExpression(element))
    ) {
      try {
        found.push(
          node.elements.map((element) => evaluateLiteral(element) as Record<string, unknown>),
        );
      } catch (error) {
        if (!(error instanceof NotLiteralError)) throw error;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function findArrayByKeys(
  arrays: Record<string, unknown>[][],
  requiredKeys: string[],
  label: string,
): Record<string, unknown>[] {
  const matches = arrays.filter(
    (array) => array.length > 0 && requiredKeys.every((key) => Object.hasOwn(array[0], key)),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} array (keys: ${requiredKeys.join(", ")}), found ${matches.length}`,
    );
  }
  return matches[0];
}

const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

function stripDiacritics(value: string) {
  return value.normalize("NFKD").replace(DIACRITICS_PATTERN, "");
}

function slug(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function talkId(sessionId: string, title: string) {
  const titleSlug = slug(title).slice(0, 48).replace(/-+$/, "");
  return `aiep-${sessionId}-${titleSlug}`;
}

function speakerId(name: string) {
  return `aiep-spk-${slug(name)}`;
}

function trackId(topic: string) {
  return `aiep-track-${slug(topic)}`;
}

function roomId(room: string) {
  return `aiep-room-${slug(room)}`;
}

function splitOwners(owner: string) {
  return owner
    .split(/\s*,\s*|\s+&\s+|\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function nameKey(name: string) {
  return stripDiacritics(name).toLowerCase().trim();
}

// Europe/Paris wall-clock time -> unix seconds, computed from the actual UTC
// offset on that date (handles the CEST/CET transition without a new dependency).
function parisWallTimeToUnixSeconds(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(naiveUtcMs)).map((part) => [part.type, part.value]),
  );
  const asParisWallTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asParisWallTime - naiveUtcMs;
  return Math.round((naiveUtcMs - offsetMs) / 1000);
}

type ProfileCacheEntry = {
  name: string;
  profileUrl: string | null;
  bio: string | null;
  twitter: string | null;
};

type ProfileCache = Record<string, ProfileCacheEntry>;

async function loadProfileCache(): Promise<ProfileCache> {
  try {
    return JSON.parse(await readFile(PROFILE_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function findProfileSlug(name: string, uuid: string): Promise<string | null> {
  const url = `https://sessionize.com/speakers-directory?q=${encodeURIComponent(name)}`;
  const html = await fetchText(url);

  const marker = `favoriteSpeaker(this, '${uuid}')`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const preceding = html.slice(Math.max(0, markerIndex - 4000), markerIndex);
  const hrefMatches = [...preceding.matchAll(/href="\/([a-z0-9._-]+)"/g)];
  if (hrefMatches.length === 0) return null;
  return hrefMatches[hrefMatches.length - 1][1];
}

async function fetchProfile(
  slug: string,
  uuid: string,
): Promise<Omit<ProfileCacheEntry, "name"> | null> {
  const profileUrl = `https://sessionize.com/${slug}`;
  const html = await fetchText(profileUrl);
  if (!html.includes(uuid)) return null;

  const bioMatch = html.match(/class="c-s-speaker-info__bio"[^>]*>([\s\S]*?)<\/div>/);
  const bio = bioMatch
    ? decodeHtmlEntities(bioMatch[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim() || null
    : null;

  const twitterMatch = html.match(
    /class="c-s-links__link"\s+href="https:\/\/(?:x|twitter)\.com\/([^"/?]+)"/,
  );
  const twitter = twitterMatch ? twitterMatch[1] : null;

  return { profileUrl, bio, twitter };
}

function emptyProfileEntry(name: string): ProfileCacheEntry {
  return { name, profileUrl: null, bio: null, twitter: null };
}

async function refreshProfileCache(
  rawSpeakers: RawSpeaker[],
  cache: ProfileCache,
): Promise<ProfileCache> {
  const refreshed: ProfileCache = { ...cache };

  for (const [index, rawSpeaker] of rawSpeakers.entries()) {
    if (index > 0) await sleep(1000);

    try {
      const slugFound = await findProfileSlug(rawSpeaker.name, rawSpeaker.id);
      if (!slugFound) {
        refreshed[rawSpeaker.id] = emptyProfileEntry(rawSpeaker.name);
        continue;
      }

      const profile = await fetchProfile(slugFound, rawSpeaker.id);
      refreshed[rawSpeaker.id] = profile
        ? { name: rawSpeaker.name, ...profile }
        : emptyProfileEntry(rawSpeaker.name);
    } catch (error) {
      console.warn(
        `Sessionize lookup failed for ${rawSpeaker.name}, keeping previous cache entry:`,
        error,
      );
      if (!refreshed[rawSpeaker.id]) {
        refreshed[rawSpeaker.id] = emptyProfileEntry(rawSpeaker.name);
      }
    }
  }

  // Sort keys for a stable, reviewable diff.
  const sorted: ProfileCache = {};
  for (const uuid of Object.keys(refreshed).sort()) {
    sorted[uuid] = refreshed[uuid];
  }
  return sorted;
}

type Talk = {
  id: string;
  title: string;
  description: string;
  speakerId: string;
  trackId: string;
  roomId: string;
  startTime: number;
  endTime: number;
  level: string;
  format: string;
  status: string;
};

function buildSeed(
  rawSessions: RawSession[],
  rawSpeakers: RawSpeaker[],
  profileCache: ProfileCache,
) {
  const speakerByNameKey = new Map(rawSpeakers.map((speaker) => [nameKey(speaker.name), speaker]));

  // Tracks: one per distinct non-empty topic, plus a fallback for empty-topic sessions.
  const topics = new Set<string>();
  for (const session of rawSessions) {
    if (session.topic) topics.add(session.topic);
  }
  const OPENING_KEYNOTES = "Opening & Keynotes";
  const trackNames = [...topics, OPENING_KEYNOTES].sort();
  const tracks = trackNames.map((name, index) => ({
    id: name === OPENING_KEYNOTES ? "aiep-track-opening-keynotes" : trackId(name),
    name,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    description: "",
  }));
  const trackIdByName = new Map(tracks.map((track) => [track.name, track.id]));

  // Rooms
  const roomNames = [...new Set(rawSessions.map((session) => session.room))].sort();
  const rooms = roomNames.map((name) => ({ id: roomId(name), name, capacity: 0 }));

  // Talks + talkSpeakers
  const talks: Talk[] = [];
  const talkSpeakers: { talkId: string; speakerId: string; position: number }[] = [];
  const speakerHasTalk = new Set<string>();

  for (const session of rawSessions) {
    const sessionId = String(session.id);
    const ownerNames = splitOwners(session.owner);
    const ownerSpeakerIds: string[] = [];

    for (const ownerName of ownerNames) {
      const rawSpeaker = speakerByNameKey.get(nameKey(ownerName));
      if (!rawSpeaker) {
        throw new Error(`Session ${sessionId} owner "${ownerName}" has no matching speaker`);
      }
      ownerSpeakerIds.push(speakerId(rawSpeaker.name));
    }

    const trackName = session.topic || OPENING_KEYNOTES;
    const track = trackIdByName.get(trackName);
    if (!track) throw new Error(`Session ${sessionId} has unmapped topic "${trackName}"`);

    const id = talkId(sessionId, session.title);
    const startTime = parisWallTimeToUnixSeconds(session.date, session.start);
    const endTime = parisWallTimeToUnixSeconds(session.date, session.end);

    const format =
      session.room === "Workshop"
        ? "workshop"
        : /\bpanel\b/i.test(session.title)
          ? "panel"
          : !session.topic
            ? "keynote"
            : "talk";

    talks.push({
      id,
      title: session.title,
      description: session.description || "",
      speakerId: ownerSpeakerIds[0],
      trackId: track,
      roomId: roomId(session.room),
      startTime,
      endTime,
      level: "intermediate",
      format,
      status: "confirmed",
    });

    ownerSpeakerIds.forEach((sid, position) => {
      talkSpeakers.push({ talkId: id, speakerId: sid, position });
      speakerHasTalk.add(sid);
    });
  }

  talks.sort(
    (a, b) =>
      a.startTime - b.startTime || a.roomId.localeCompare(b.roomId) || a.id.localeCompare(b.id),
  );

  // Speakers
  const speakers = rawSpeakers
    .map((rawSpeaker) => {
      const id = speakerId(rawSpeaker.name);
      if (!speakerHasTalk.has(id)) {
        throw new Error(`Speaker "${rawSpeaker.name}" (${id}) has no talk`);
      }
      const cached = profileCache[rawSpeaker.id];
      const company = rawSpeaker.company || "";
      const role = rawSpeaker.title || "";
      const bio = cached?.bio || [role, company].filter(Boolean).join(", ");
      return {
        id,
        name: rawSpeaker.name,
        bio,
        avatar: rawSpeaker.profile_picture || "",
        company,
        role,
        twitter: cached?.twitter ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { tracks, rooms, speakers, talks, talkSpeakers };
}

async function main() {
  console.log(`Fetching ${PARIS_PAGE_URL}...`);
  const chunkSource = await fetchChunkSource();

  const objectArrays = findObjectArrays(chunkSource);
  const rawSessions = findArrayByKeys(
    objectArrays,
    ["id", "date", "start", "end", "title", "owner", "room"],
    "sessions",
  ) as unknown as RawSession[];
  const rawSpeakers = findArrayByKeys(
    objectArrays,
    ["id", "name", "sessions", "room"],
    "speakers",
  ) as unknown as RawSpeaker[];

  console.log(
    `Found ${rawSessions.length} sessions and ${rawSpeakers.length} speakers in the page bundle.`,
  );

  let profileCache = await loadProfileCache();
  if (hasFlag("--profiles")) {
    console.log("Refreshing Sessionize profile cache (one request per speaker, 1s apart)...");
    profileCache = await refreshProfileCache(rawSpeakers, profileCache);
    await mkdir(path.dirname(PROFILE_CACHE_PATH), { recursive: true });
    await writeFile(PROFILE_CACHE_PATH, `${JSON.stringify(profileCache, null, 1)}\n`);
    const matched = Object.values(profileCache).filter((entry) => entry.profileUrl).length;
    console.log(`Matched ${matched} of ${rawSpeakers.length} speakers to a Sessionize profile.`);
  }

  const seed = buildSeed(rawSessions, rawSpeakers, profileCache);

  const scrapedOn = new Date().toISOString().slice(0, 10);
  const output = {
    metadata: {
      id: "ai-engineer-paris-2026",
      name: "AI Engineer Paris 2026",
      timezone: "Europe/Paris",
      dates: "2026-09-23/2026-09-24",
      location: "Paris, France",
    },
    source: `https://ai.engineer/paris/2026 (sessions and speakers from the page bundle, scraped ${scrapedOn}; bios from public Sessionize profiles where available)`,
    ...seed,
  };

  const outPath = path.resolve(flagValue("--out", DEFAULT_OUT_PATH) as string);
  await writeFile(outPath, JSON.stringify(output, null, 1));

  console.log(
    `Wrote ${outPath}: ${seed.tracks.length} tracks, ${seed.rooms.length} rooms, ${seed.speakers.length} speakers, ${seed.talks.length} talks, ${seed.talkSpeakers.length} talk-speaker links`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
