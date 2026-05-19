import * as Sentry from "@sentry/nextjs";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { cacheTag, cacheLife } from "next/cache";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { ScheduleFilters } from "@/components/schedule-filters";
import { ScheduleGrid } from "@/components/schedule-grid";
import { db } from "@/lib/db";
import { rooms, speakers, talks, tracks } from "@/lib/db/schema";

type SearchParams = Promise<{
  track?: string;
  level?: string;
  format?: string;
}>;

async function getCachedScheduleData() {
  "use cache";
  cacheTag("talks", "tracks");
  cacheLife("hours");

  const [talkResults, trackResults] = await Promise.all([
    db
      .select({
        id: talks.id,
        title: talks.title,
        description: talks.description,
        startTime: talks.startTime,
        endTime: talks.endTime,
        level: talks.level,
        format: talks.format,
        speaker: {
          id: speakers.id,
          name: speakers.name,
          avatar: speakers.avatar,
          company: speakers.company,
        },
        track: {
          id: tracks.id,
          name: tracks.name,
          color: tracks.color,
        },
        room: {
          id: rooms.id,
          name: rooms.name,
        },
      })
      .from(talks)
      .innerJoin(speakers, eq(talks.speakerId, speakers.id))
      .innerJoin(tracks, eq(talks.trackId, tracks.id))
      .innerJoin(rooms, eq(talks.roomId, rooms.id))
      .orderBy(talks.startTime),
    db.select().from(tracks),
  ]);

  Sentry.metrics.count("cache.miss", 1, {
    attributes: { cache_key: "schedule_data" },
  });

  Sentry.logger.info("cache.miss", {
    cache_key: "schedule_data",
    cache_tags: "talks,tracks",
    cache_life: "hours",
    talk_count: talkResults.length,
    track_count: trackResults.length,
  });

  return { talks: talkResults, tracks: trackResults };
}

export default function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Conference Schedule</h1>
          <p className="text-muted-foreground">October 22, 2025 · San Francisco, CA</p>
        </div>

        <Suspense>
          <ScheduleContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function ScheduleContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;

  const { talks: allTalks, tracks } = await getCachedScheduleData();
  const serverNow = Date.now();

  let filteredTalks = allTalks;

  if (params.track) {
    filteredTalks = filteredTalks.filter((talk) => talk.track.id === params.track);
  }
  if (params.level) {
    filteredTalks = filteredTalks.filter((talk) => talk.level === params.level);
  }
  if (params.format) {
    filteredTalks = filteredTalks.filter((talk) => talk.format === params.format);
  }

  return (
    <>
      <div className="mb-8">
        <ScheduleFilters tracks={tracks} />
      </div>
      <ScheduleGrid talks={filteredTalks} serverNow={serverNow} />
    </>
  );
}
