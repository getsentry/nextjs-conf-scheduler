import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/lib/auth/dal";
import { getClient } from "@/lib/db";
import { getSpeakerById } from "@/lib/db/queries";
import { GREG_PSTRUCHA_SPEAKER_ID, isSentryEmail } from "@/lib/sentry-demo";
import { formatTime, levelColors } from "@/lib/types";

type Params = Promise<{ id: string }>;

export default function SpeakerDetailPage({ params }: { params: Params }) {
  return (
    <Suspense>
      <SpeakerDetailContent params={params} />
    </Suspense>
  );
}

async function SpeakerDetailContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await getUser();

  if (id === GREG_PSTRUCHA_SPEAKER_ID && isSentryEmail(user?.email)) {
    Sentry.logger.warn("Running demo slow speaker query", {
      action: "speaker.load",
      result: "demo_slow_query",
      speaker_id: id,
      user_id: user?.id,
    });
    await getClient()`select pg_sleep(6)`;
  }

  const speaker = await getSpeakerById(id);

  if (!speaker) {
    notFound();
  }

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/speakers" className="hover:text-foreground">
          Speakers
        </Link>
        <span className="mx-2">/</span>
        <span>{speaker.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Speaker info */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="pt-6 text-center">
              <Image
                src={speaker.avatar}
                alt={speaker.name}
                width={160}
                height={160}
                className="h-40 w-40 rounded-full object-cover mx-auto mb-4"
              />
              <h1 className="text-2xl font-bold">{speaker.name}</h1>
              <p className="text-muted-foreground">{speaker.role}</p>
              <p className="text-muted-foreground">{speaker.company}</p>
              {speaker.twitter && (
                <a
                  href={`https://twitter.com/${speaker.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline mt-2 inline-block"
                >
                  @{speaker.twitter}
                </a>
              )}
              <p className="text-sm text-muted-foreground mt-4 text-left">{speaker.bio}</p>
            </CardContent>
          </Card>
        </div>

        {/* Speaker talks */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Sessions ({speaker.talks.length})</h2>
          <div className="space-y-4">
            {speaker.talks.map((talk) => (
              <Link key={talk.id} href={`/talks/${talk.id}`}>
                <Card className="transition-shadow hover:ring-2 hover:ring-primary/20 hover:shadow-md motion-reduce:transition-none">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: talk.track.color }}
                        title={talk.track.name}
                      />
                      <CardTitle className="flex-1">{talk.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <span>{formatTime(talk.startTime)}</span>
                      <span>·</span>
                      <span>{talk.room.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {talk.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{talk.track.name}</Badge>
                      <Badge variant="secondary" className={levelColors[talk.level]}>
                        {talk.level}
                      </Badge>
                      <Badge variant="outline">{talk.format}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
