import * as Sentry from "@sentry/nextjs";
import { Suspense } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { ScheduleFilters } from "@/components/schedule-filters";
import { ScheduleGrid } from "@/components/schedule-grid";
import { getAllTalks, getAllTracks } from "@/lib/db/queries";

type SearchParams = Promise<{
  track?: string;
  level?: string;
  format?: string;
}>;

async function getCachedScheduleData() {
  "use cache";
  cacheTag("talks", "tracks");
  cacheLife("hours");

  const [allTalks, allTracks] = await Promise.all([getAllTalks(), getAllTracks()]);

  Sentry.metrics.count("cache.miss", 1, {
    attributes: { cache_key: "schedule_data", path: "/" },
  });

  Sentry.logger.info("cache.miss", {
    cache_key: "schedule_data",
    cache_tags: "talks,tracks",
    cache_life: "hours",
    path: "/",
    talk_count: allTalks.length,
    track_count: allTracks.length,
  });

  return { talks: allTalks, tracks: allTracks };
}

export default function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Conference Schedule</h1>
        <p className="text-muted-foreground">October 22, 2025 · San Francisco, CA</p>
      </div>

      <Suspense>
        <ScheduleContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ScheduleContent({ searchParams }: { searchParams: SearchParams }) {
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
