import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireAuth } from "@/lib/auth/dal";
import { getUserSchedule } from "@/lib/db/queries";
import { MyScheduleList } from "./my-schedule-list";

export default function MySchedulePage() {
  return (
    <Suspense>
      <MyScheduleContent />
    </Suspense>
  );
}

async function MyScheduleContent() {
  const { userId } = await requireAuth();
  const schedule = await getUserSchedule(userId);

  const talks = schedule.map((item) => ({
    id: item.talk.id,
    title: item.talk.title,
    description: item.talk.description,
    startTime: item.talk.startTime,
    endTime: item.talk.endTime,
    level: item.talk.level,
    format: item.talk.format,
    speaker: item.speaker,
    track: item.track,
    room: item.room,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">My Schedule</h1>
          <p className="text-muted-foreground">
            {talks.length === 0
              ? "You haven't added any talks to your schedule yet."
              : `You have ${talks.length} talk${talks.length === 1 ? "" : "s"} saved.`}
          </p>
        </div>

        {talks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              Browse the schedule and add talks you want to attend.
            </p>
            <a href="/" className="text-primary hover:underline">
              View full schedule
            </a>
          </div>
        ) : (
          <MyScheduleList talks={talks} />
        )}
      </main>
    </div>
  );
}
