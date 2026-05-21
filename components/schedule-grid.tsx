import type { Talk } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/types";
import { TalkCard } from "./talk-card";

type ScheduleGridProps = {
  talks: Talk[];
  serverNow?: number;
};

function groupTalksByTime(talks: Talk[]): Map<number, Talk[]> {
  const grouped = new Map<number, Talk[]>();

  for (const talk of talks) {
    const existing = grouped.get(talk.startTime) || [];
    grouped.set(talk.startTime, [...existing, talk]);
  }

  return grouped;
}

export function ScheduleGrid({ talks, serverNow }: ScheduleGridProps) {
  if (talks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No talks match your filters.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Try adjusting your filters to see more sessions.
        </p>
      </div>
    );
  }

  const groupedTalks = groupTalksByTime(talks);
  const sortedTimeSlots = Array.from(groupedTalks.keys()).sort((a, b) => a - b);

  // Determine if we need to show date headers (multiple days)
  const dates = new Set(talks.map((t) => new Date(t.startTime * 1000).toDateString()));
  const showDateHeaders = dates.size > 1;
  let currentDate = "";

  return (
    <div className="space-y-8">
      {sortedTimeSlots.map((timeSlot) => {
        const slotTalks = groupedTalks.get(timeSlot) || [];
        const dateStr = new Date(timeSlot * 1000).toDateString();
        const isNewDate = dateStr !== currentDate;

        if (isNewDate) {
          currentDate = dateStr;
        }

        return (
          <div key={timeSlot}>
            {/* Date header when crossing days */}
            {showDateHeaders && isNewDate && (
              <h2 className="text-lg font-semibold mb-4 pb-2 border-b">{formatDate(timeSlot)}</h2>
            )}

            {/* Time slot header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium">
                {formatTime(timeSlot)}
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Talks grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {slotTalks.map((talk) => (
                <TalkCard key={talk.id} talk={talk} showTime={false} serverNow={serverNow} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
