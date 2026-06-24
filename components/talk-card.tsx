import Image from "next/image";
import Link from "next/link";
import { TalkTimeStatus } from "@/components/talk-time-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatTime, levelColors, type Talk } from "@/lib/types";

type TalkCardProps = {
  talk: Talk;
  showTime?: boolean;
  serverNow?: number;
};

const formatIcons = {
  talk: "🎤",
  workshop: "🛠️",
  keynote: "⭐",
  panel: "👥",
  sponsor: "🏷️",
  plenary: "📍",
};

export function TalkCard({ talk, showTime = true, serverNow }: TalkCardProps) {
  return (
    <Link href={`/talks/${talk.id}`} className="block">
      <Card className="h-full transition-shadow hover:ring-2 hover:ring-primary/30 hover:shadow-lg motion-reduce:transition-none">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div
              className="h-2 w-2 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: talk.track.color }}
              title={talk.track.name}
            />
            <CardTitle className="flex-1 line-clamp-2">{talk.title}</CardTitle>
            <span className="text-lg shrink-0" title={talk.format}>
              {formatIcons[talk.format]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showTime && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>{formatTime(talk.startTime)}</span>
              <span>·</span>
              <span>{formatDuration(talk.startTime, talk.endTime)}</span>
              <span>·</span>
              <span>{talk.room.name}</span>
              {serverNow && (
                <>
                  <span>·</span>
                  <TalkTimeStatus
                    startTime={talk.startTime}
                    endTime={talk.endTime}
                    serverNow={serverNow}
                  />
                </>
              )}
            </div>
          )}

          <p className="text-muted-foreground line-clamp-2 text-xs">{talk.description}</p>

          <div className="flex items-center gap-2">
            <Image
              src={talk.speaker.avatar}
              alt={talk.speaker.name}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{talk.speaker.name}</p>
              <p className="text-xs text-muted-foreground truncate">{talk.speaker.company}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {talk.track.name}
            </Badge>
            <Badge variant="secondary" className={`text-[10px] ${levelColors[talk.level]}`}>
              {talk.level}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
