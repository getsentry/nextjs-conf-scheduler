import * as Sentry from "@sentry/nextjs";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScheduleFilters } from "@/components/schedule-filters";
import { ScheduleGrid } from "@/components/schedule-grid";
import { verifySession } from "@/lib/auth/dal";
import { conferenceConfig, conferenceDateLocationLabel } from "@/lib/conference-config";
import { getAllTalks, getAllTracks, getUserScheduleTalkIds } from "@/lib/db/queries";
import { formatDate, formatDayKey, type Talk } from "@/lib/types";

type ScheduleDay = {
  id: string;
  label: string;
  dateLabel: string;
  count: number;
};

type SearchParams = Promise<{
  track?: string;
  level?: string;
  format?: string;
  q?: string;
  day?: string;
  view?: string;
}>;

async function getCachedScheduleData() {
  "use cache: remote";
  cacheTag("talks", "tracks");
  cacheLife("hours");

  const [allTalks, allTracks] = await Promise.all([getAllTalks(), getAllTracks()]);

  Sentry.metrics.count("cache.miss", 1, {
    attributes: { cache_key: "schedule_data", path: "/" },
  });

  Sentry.logger.info("Cache miss on schedule data", {
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
        <h1 className="text-3xl font-bold tracking-tight mb-2">{conferenceConfig.name} Schedule</h1>
        <p className="text-muted-foreground">{conferenceDateLocationLabel()}</p>
      </div>

      <Suspense>
        <ScheduleContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ScheduleContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, { talks: allTalks, tracks }, session] = await Promise.all([
    searchParams,
    getCachedScheduleData(),
    verifySession(),
  ]);
  const isMyEventsView = params.view === "my-events";

  if (isMyEventsView && !session.isAuth) {
    redirect("/login");
  }

  const savedTalkIds = session.userId ? await getUserScheduleTalkIds(session.userId) : [];
  const savedTalkIdSet = new Set(savedTalkIds);
  const query = params.q?.trim().toLowerCase();
  let filteredTalks = isMyEventsView
    ? allTalks.filter((talk) => savedTalkIdSet.has(talk.id))
    : allTalks;

  if (params.track) {
    filteredTalks = filteredTalks.filter((talk) => talk.track.id === params.track);
  }
  if (params.level) {
    filteredTalks = filteredTalks.filter((talk) => talk.level === params.level);
  }
  if (params.format) {
    filteredTalks = filteredTalks.filter((talk) => talk.format === params.format);
  }
  if (query) {
    filteredTalks = filteredTalks.filter((talk) => {
      const haystack = [
        talk.title,
        talk.description,
        talk.speaker.name,
        talk.speaker.company,
        ...(talk.speakers ?? []).flatMap((speaker) => [speaker.name, speaker.company]),
        talk.track.name,
        talk.room.name,
        talk.level,
        talk.format,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  const dayNumberById = getScheduleDayNumbers(allTalks);
  const days = getScheduleDays(filteredTalks, dayNumberById);
  const activeDay = days.some((day) => day.id === params.day) ? params.day : (days[0]?.id ?? "");
  const trackCounts = getTrackCounts(allTalks);
  const trackOptions: Array<(typeof tracks)[number] & { count: number }> = [];
  for (const track of tracks) {
    if (isProgramTrack(track.id, track.name)) {
      trackOptions.push({ ...track, count: trackCounts.get(track.id) ?? 0 });
    }
  }
  trackOptions.sort((a, b) => a.name.localeCompare(b.name));
  const visibleTalks =
    activeDay === "all"
      ? filteredTalks
      : filteredTalks.filter((talk) => formatDayKey(talk.startTime) === activeDay);

  return (
    <>
      <div className="mb-6">
        <Suspense>
          <ScheduleFilters
            days={days}
            filteredCount={filteredTalks.length}
            totalCount={allTalks.length}
            isAuthenticated={session.isAuth}
            savedCount={savedTalkIds.length}
            tracks={trackOptions}
          />
        </Suspense>
      </div>
      <ScheduleGrid
        isAuthenticated={session.isAuth}
        savedTalkIds={savedTalkIds}
        talks={visibleTalks}
      />
    </>
  );
}

function getTrackCounts(talks: Talk[]) {
  const counts = new Map<string, number>();

  for (const talk of talks) {
    counts.set(talk.track.id, (counts.get(talk.track.id) ?? 0) + 1);
  }

  return counts;
}

function isProgramTrack(id: string, name: string) {
  if (id === "general" || id === "main-stage") return false;
  if (id.startsWith("expo-stage")) return false;
  if (id.startsWith("workshops-day")) return false;
  if (/^track-(\d+|m)$/i.test(id)) return false;
  if (/^Track [\dA-Z]+$/i.test(name)) return false;

  return true;
}

function getScheduleDayNumbers(talks: Talk[]) {
  const firstTalkByDay = new Map<string, Talk>();

  for (const talk of talks) {
    const dayKey = formatDayKey(talk.startTime);
    const firstTalk = firstTalkByDay.get(dayKey);
    if (!firstTalk || talk.startTime < firstTalk.startTime) {
      firstTalkByDay.set(dayKey, talk);
    }
  }

  return new Map(
    Array.from(firstTalkByDay.entries())
      .sort(([, a], [, b]) => a.startTime - b.startTime)
      .map(([id], index) => [id, index + 1]),
  );
}

function getScheduleDays(talks: Talk[], dayNumberById: Map<string, number>): ScheduleDay[] {
  const grouped = new Map<string, Talk[]>();

  for (const talk of talks) {
    const dayKey = formatDayKey(talk.startTime);
    const dayTalks = grouped.get(dayKey);
    if (dayTalks) {
      dayTalks.push(talk);
    } else {
      grouped.set(dayKey, [talk]);
    }
  }

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => (a[0]?.startTime ?? 0) - (b[0]?.startTime ?? 0))
    .map(([id, dayTalks]) => {
      const firstTalk = dayTalks.reduce<Talk | undefined>(
        (earliest, talk) => (!earliest || talk.startTime < earliest.startTime ? talk : earliest),
        undefined,
      );
      return {
        id,
        label: `Day ${dayNumberById.get(id) ?? 1}`,
        dateLabel: firstTalk ? formatDate(firstTalk.startTime).replace(", 2026", "") : id,
        count: dayTalks.length,
      };
    });
}
