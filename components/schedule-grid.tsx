import Link from "next/link";
import { ScheduleSaveButton } from "@/components/schedule-save-button";
import type { Talk } from "@/lib/types";
import { formatDate, formatDayKey, formatDuration, formatTime, levelColors } from "@/lib/types";
import { cn } from "@/lib/utils";

type ScheduleGridProps = {
  isAuthenticated: boolean;
  savedTalkIds: string[];
  talks: Talk[];
};

type Room = Talk["room"];

type DayGroup = {
  id: string;
  label: string;
  talks: Talk[];
};

const roomCollator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });

function groupTalksByDay(talks: Talk[]): DayGroup[] {
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
    .map(([id, dayTalks]) => ({
      id,
      label: dayTalks[0] ? formatDate(dayTalks[0].startTime).replace(", 2026", "") : id,
      talks: [...dayTalks].sort((a, b) => a.startTime - b.startTime),
    }));
}

function getRooms(talks: Talk[]) {
  const rooms = new Map<string, Room>();
  for (const talk of talks) {
    rooms.set(talk.room.id, talk.room);
  }

  return Array.from(rooms.values()).sort((a, b) => roomCollator.compare(a.name, b.name));
}

function getTimeSlots(talks: Talk[]) {
  return Array.from(new Set(talks.map((talk) => talk.startTime))).sort((a, b) => a - b);
}

function groupTalksBySlot(talks: Talk[]) {
  const slots = new Map<string, Talk[]>();

  for (const talk of talks) {
    const key = `${talk.startTime}:${talk.room.id}`;
    const slotTalks = slots.get(key);
    if (slotTalks) {
      slotTalks.push(talk);
    } else {
      slots.set(key, [talk]);
    }
  }

  return slots;
}

export function ScheduleGrid({ isAuthenticated, savedTalkIds, talks }: ScheduleGridProps) {
  if (talks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed py-16 text-center">
        <p className="font-medium">No sessions match this view.</p>
        <p className="mt-1 text-sm text-muted-foreground">Try changing the search or filters.</p>
      </div>
    );
  }

  const days = groupTalksByDay(talks);
  const savedTalkIdSet = new Set(savedTalkIds);

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <DayScheduleGrid
          day={day}
          isAuthenticated={isAuthenticated}
          key={day.id}
          savedTalkIdSet={savedTalkIdSet}
        />
      ))}
    </div>
  );
}

function DayScheduleGrid({
  day,
  isAuthenticated,
  savedTalkIdSet,
}: {
  day: DayGroup;
  isAuthenticated: boolean;
  savedTalkIdSet: Set<string>;
}) {
  const rooms = getRooms(day.talks);
  const timeSlots = getTimeSlots(day.talks);
  const talksBySlot = groupTalksBySlot(day.talks);
  const gridTemplateColumns = `5.5rem repeat(${rooms.length}, minmax(11rem, 1fr))`;
  const minWidth = `${88 + rooms.length * 176}px`;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold text-lg">{day.label}</h2>
          <p className="text-sm text-muted-foreground">{day.talks.length} sessions</p>
        </div>
        <p className="text-xs text-muted-foreground">{rooms.length} rooms</p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-full" style={{ minWidth }}>
          <div className="grid border-b bg-card/95" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-30 border-r bg-card/95 p-3 text-xs font-medium text-muted-foreground">
              Time
            </div>
            {rooms.map((room) => (
              <div className="border-r p-3 text-center last:border-r-0" key={room.id}>
                <p className="truncate font-medium text-sm">{room.name}</p>
              </div>
            ))}
          </div>

          <div className="divide-y">
            {timeSlots.map((timeSlot) => (
              <div
                className="grid [contain-intrinsic-size:auto_9rem] [content-visibility:auto]"
                key={timeSlot}
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-10 border-r bg-card/95 p-3 text-sm font-medium text-muted-foreground">
                  {formatTime(timeSlot)}
                </div>
                {rooms.map((room) => {
                  const slotTalks = talksBySlot.get(`${timeSlot}:${room.id}`) ?? [];

                  return (
                    <div
                      className="min-h-32 border-r bg-muted/10 p-1.5 last:border-r-0"
                      key={room.id}
                    >
                      <div className="space-y-1.5">
                        {slotTalks.map((talk) => (
                          <SessionBlock
                            isAuthenticated={isAuthenticated}
                            key={talk.id}
                            saved={savedTalkIdSet.has(talk.id)}
                            talk={talk}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SessionBlock({
  isAuthenticated,
  saved,
  talk,
}: {
  isAuthenticated: boolean;
  saved: boolean;
  talk: Talk;
}) {
  return (
    <article
      className={cn(
        "relative rounded-lg border bg-background text-xs shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none",
        saved && "border-primary/50 bg-primary/5 ring-1 ring-primary/15",
      )}
    >
      <div className="absolute right-1.5 top-1.5 z-10">
        <ScheduleSaveButton isAuthenticated={isAuthenticated} saved={saved} talkId={talk.id} />
      </div>
      <Link className="block p-2.5 pr-9" href={`/talks/${talk.id}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-3 font-semibold leading-snug">{talk.title}</h3>
          <span className="shrink-0 text-[0.65rem] text-muted-foreground">
            {formatDuration(talk.startTime, talk.endTime)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-muted-foreground">{talk.speaker.name}</p>
        {talk.speaker.company ? (
          <p className="line-clamp-1 text-muted-foreground/80">{talk.speaker.company}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded-md border px-1.5 py-0.5 text-[0.62rem] capitalize text-muted-foreground">
            {talk.format}
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[0.62rem] capitalize",
              levelColors[talk.level],
            )}
          >
            {talk.level}
          </span>
        </div>
      </Link>
    </article>
  );
}
