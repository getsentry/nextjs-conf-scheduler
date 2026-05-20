import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { Header } from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";
import { getAllSpeakers } from "@/lib/db/queries";

async function getCachedSpeakers() {
  "use cache";
  cacheTag("speakers");
  cacheLife("days");

  const result = await getAllSpeakers();

  Sentry.metrics.count("cache.miss", 1, {
    attributes: { cache_key: "speakers_list" },
  });

  Sentry.logger.info("cache.miss", {
    cache_key: "speakers_list",
    cache_tags: "speakers",
    cache_life: "days",
    speaker_count: result.length,
  });

  return result;
}

export default function SpeakersPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Speakers</h1>
          <p className="text-muted-foreground">Meet the speakers at Next.js Conf 2025</p>
        </div>

        <Suspense>
          <SpeakersList />
        </Suspense>
      </main>
    </div>
  );
}

async function SpeakersList() {
  const speakers = await getCachedSpeakers();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {speakers.map((speaker) => (
        <Link key={speaker.id} href={`/speakers/${speaker.id}`}>
          <Card className="h-full transition-all hover:ring-2 hover:ring-primary/20 hover:shadow-md">
            <CardContent className="pt-6 text-center">
              <Image
                src={speaker.avatar}
                alt={speaker.name}
                width={96}
                height={96}
                className="rounded-full mx-auto mb-4"
              />
              <h2 className="font-semibold">{speaker.name}</h2>
              <p className="text-sm text-muted-foreground">{speaker.role}</p>
              <p className="text-sm text-muted-foreground">{speaker.company}</p>
              {speaker.twitter && (
                <p className="text-sm text-primary mt-2">@{speaker.twitter}</p>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
