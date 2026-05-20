"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { removeFromSchedule } from "@/lib/actions/schedule";
import { formatDuration, formatTime, levelColors, type Talk } from "@/lib/types";

type MyScheduleListProps = {
  talks: Talk[];
};

// Check for conflicts between talks
function findConflicts(talks: Talk[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();

  for (let i = 0; i < talks.length; i++) {
    for (let j = i + 1; j < talks.length; j++) {
      const a = talks[i];
      const b = talks[j];

      // Check if times overlap
      if (a.startTime < b.endTime && b.startTime < a.endTime) {
        const existingA = conflicts.get(a.id) || [];
        const existingB = conflicts.get(b.id) || [];
        conflicts.set(a.id, [...existingA, b.id]);
        conflicts.set(b.id, [...existingB, a.id]);
      }
    }
  }

  return conflicts;
}

function TalkItem({
  talk,
  hasConflict,
  onRemove,
  isRemoving,
}: {
  talk: Talk;
  hasConflict: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <Card className={hasConflict ? "ring-2 ring-destructive/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: talk.track.color }}
            />
            <Link href={`/talks/${talk.id}`}>
              <CardTitle className="hover:text-primary transition-colors">{talk.title}</CardTitle>
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
            className="text-muted-foreground hover:text-destructive"
          >
            {isRemoving ? "Removing..." : "Remove"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasConflict && (
          <div className="mb-3 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
            This talk conflicts with another in your schedule
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <span>{formatTime(talk.startTime)}</span>
          <span>·</span>
          <span>{formatDuration(talk.startTime, talk.endTime)}</span>
          <span>·</span>
          <span>{talk.room.name}</span>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{talk.description}</p>

        <div className="flex items-center gap-3 mb-3">
          <Link href={`/speakers/${talk.speaker.id}`} className="flex items-center gap-2 group">
            <Image
              src={talk.speaker.avatar}
              alt={talk.speaker.name}
              width={24}
              height={24}
              className="rounded-full"
            />
            <span className="text-sm group-hover:text-primary transition-colors">
              {talk.speaker.name}
            </span>
          </Link>
          <span className="text-sm text-muted-foreground">{talk.speaker.company}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{talk.track.name}</Badge>
          <Badge variant="secondary" className={levelColors[talk.level]}>
            {talk.level}
          </Badge>
          <Badge variant="outline">{talk.format}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyScheduleList({ talks }: MyScheduleListProps) {
  const [isPending, startTransition] = useTransition();
  const { conflicts, sortedTalks } = useMemo(() => {
    return {
      conflicts: findConflicts(talks),
      sortedTalks: [...talks].sort((a, b) => a.startTime - b.startTime),
    };
  }, [talks]);

  const handleRemove = (talkId: string) => {
    startTransition(async () => {
      await removeFromSchedule(talkId);
    });
  };

  return (
    <div className="space-y-4">
      {conflicts.size > 0 && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg mb-6">
          <p className="font-medium">Schedule Conflicts Detected</p>
          <p className="text-sm mt-1">
            Some of your saved talks overlap in time. You may want to remove one.
          </p>
        </div>
      )}

      {sortedTalks.map((talk) => (
        <TalkItem
          key={talk.id}
          talk={talk}
          hasConflict={conflicts.has(talk.id)}
          onRemove={() => handleRemove(talk.id)}
          isRemoving={isPending}
        />
      ))}
    </div>
  );
}
