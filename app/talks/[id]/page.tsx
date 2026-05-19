import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { verifySession } from "@/lib/auth/dal";
import { trpc } from "@/lib/trpc/server";
import { formatDate, formatDuration, formatTime, levelColors } from "@/lib/types";
import { AddToScheduleButton } from "./add-to-schedule-button";

type Params = Promise<{ id: string }>;

const formatLabels = {
  talk: "Talk",
  workshop: "Workshop",
  keynote: "Keynote",
  panel: "Panel Discussion",
};

export default function TalkDetailPage({ params }: { params: Params }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <Suspense>
          <TalkDetailContent params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function TalkDetailContent({ params }: { params: Params }) {
  const { id } = await params;
  const [api, session] = await Promise.all([trpc(), verifySession()]);

  const [talk, isInSchedule] = await Promise.all([
    api.talks.byId({ id }),
    session.isAuth ? api.schedule.isInSchedule({ talkId: id }) : false,
  ]);

  if (!talk) {
    notFound();
  }

  return (
    <>
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Schedule
          </Link>
          <span className="mx-2">/</span>
          <span>{talk.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Track badge */}
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: talk.track.color }} />
              <span className="text-sm font-medium">{talk.track.name}</span>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight">{talk.title}</h1>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{formatLabels[talk.format]}</Badge>
              <Badge variant="secondary" className={levelColors[talk.level]}>
                {talk.level.charAt(0).toUpperCase() + talk.level.slice(1)}
              </Badge>
            </div>

            {/* Description */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-muted-foreground leading-relaxed">{talk.description}</p>
            </div>

            {/* Track info */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-medium mb-2">About the {talk.track.name} Track</h3>
                <p className="text-sm text-muted-foreground">{talk.track.description}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Schedule info */}
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <h3 className="font-medium mb-2">When</h3>
                  <p className="text-sm">{formatDate(talk.startTime)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(talk.startTime)} - {formatTime(talk.endTime)}
                    <span className="mx-1">·</span>
                    {formatDuration(talk.startTime, talk.endTime)}
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Where</h3>
                  <p className="text-sm">{talk.room.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Capacity: {talk.room.capacity} attendees
                  </p>
                </div>

                {session.isAuth ? (
                  <AddToScheduleButton talkId={talk.id} isInSchedule={isInSchedule} />
                ) : (
                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground">
                      <Link href="/login" className="text-primary hover:underline">
                        Sign in
                      </Link>{" "}
                      to add this talk to your schedule.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Speaker card */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-medium mb-4">Speaker</h3>
                <Link
                  href={`/speakers/${talk.speaker.id}`}
                  className="flex items-start gap-4 group"
                >
                  <Image
                    src={talk.speaker.avatar}
                    alt={talk.speaker.name}
                    width={64}
                    height={64}
                    className="rounded-full"
                  />
                  <div>
                    <p className="font-medium group-hover:text-primary transition-colors">
                      {talk.speaker.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{talk.speaker.role}</p>
                    <p className="text-sm text-muted-foreground">{talk.speaker.company}</p>
                    {talk.speaker.twitter && (
                      <p className="text-sm text-primary mt-1">@{talk.speaker.twitter}</p>
                    )}
                  </div>
                </Link>
                <p className="text-sm text-muted-foreground mt-4 line-clamp-3">
                  {talk.speaker.bio}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
    </>
  );
}
