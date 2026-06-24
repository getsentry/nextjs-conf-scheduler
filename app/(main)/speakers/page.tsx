import * as Sentry from "@sentry/nextjs";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getAllSpeakers } from "@/lib/db/queries";

async function getCachedSpeakers() {
  "use cache: remote";
  cacheTag("speakers");
  cacheLife("days");

  const result = await getAllSpeakers();

  Sentry.metrics.count("cache.miss", 1, {
    attributes: { cache_key: "speakers_list", path: "/speakers" },
  });

  Sentry.logger.info("Cache miss on speakers list", {
    cache_key: "speakers_list",
    cache_tags: "speakers",
    cache_life: "days",
    path: "/speakers",
    speaker_count: result.length,
  });

  return result;
}

export default function SpeakersPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Speakers</h1>
        <p className="text-muted-foreground">Meet the AI Engineer World's Fair 2026 speakers</p>
      </div>

      <Suspense>
        <SpeakersList />
      </Suspense>
    </>
  );
}

async function SpeakersList() {
  const speakers = await getCachedSpeakers();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {speakers.map((speaker) => (
        <Link key={speaker.id} href={`/speakers/${speaker.id}`}>
          <Card className="h-full transition-shadow hover:ring-2 hover:ring-primary/20 hover:shadow-md motion-reduce:transition-none">
            <CardContent className="pt-6 text-center">
              <Image
                src={speaker.avatar}
                alt={speaker.name}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full object-cover mx-auto mb-4"
              />
              <h2 className="font-semibold">{speaker.name}</h2>
              <p className="text-sm text-muted-foreground">{speaker.role}</p>
              <p className="text-sm text-muted-foreground">{speaker.company}</p>
              {speaker.twitter && <p className="text-sm text-primary mt-2">@{speaker.twitter}</p>}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
