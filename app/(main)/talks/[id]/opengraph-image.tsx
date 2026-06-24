import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { speakers, talks, tracks } from "@/lib/db/schema";

export const alt = "Talk details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { id: string };

export default async function OGImage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  return Sentry.startSpan({ op: "og.image", name: `og-image:talk:${id}` }, async (span) => {
    const talk = await Sentry.startSpan(
      { op: "db.query", name: "fetch talk for OG image" },
      async () => {
        const result = await db
          .select({
            title: talks.title,
            level: talks.level,
            format: talks.format,
            speakerName: speakers.name,
            speakerCompany: speakers.company,
            trackName: tracks.name,
            trackColor: tracks.color,
          })
          .from(talks)
          .innerJoin(speakers, eq(talks.speakerId, speakers.id))
          .innerJoin(tracks, eq(talks.trackId, tracks.id))
          .where(eq(talks.id, id))
          .limit(1);

        return result[0] ?? null;
      },
    );

    if (!talk) {
      Sentry.logger.warn("OG image talk not found", {
        action: "og.image",
        result: "not_found",
        talk_id: id,
      });
      span.setStatus({ code: 2, message: "not_found" });

      return new ImageResponse(
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#0E0717",
            color: "#B4ADC6",
            fontSize: 32,
            fontFamily: "sans-serif",
          }}
        >
          Talk not found
        </div>,
        { ...size },
      );
    }

    Sentry.logger.info("OG image generated", {
      action: "og.image",
      result: "generated",
      talk_id: id,
      talk_title: talk.title,
      track: talk.trackName,
      speaker: talk.speakerName,
    });

    return new ImageResponse(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#0E0717",
          padding: 60,
          fontFamily: "sans-serif",
        }}
      >
        {/* Top bar with track color */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: talk.trackColor,
            }}
          />
          <span style={{ color: "#B4ADC6", fontSize: 20 }}>{talk.trackName}</span>
          <span style={{ color: "#6C5FC7", fontSize: 20, marginLeft: 16 }}>
            {talk.format.charAt(0).toUpperCase() + talk.format.slice(1)}
          </span>
          <span style={{ color: "#6C5FC7", fontSize: 20 }}>
            {talk.level.charAt(0).toUpperCase() + talk.level.slice(1)}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          <h1
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "white",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              maxWidth: "90%",
            }}
          >
            {talk.title}
          </h1>
        </div>

        {/* Bottom: Speaker + Branding */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>
              {talk.speakerName}
            </span>
            <span style={{ color: "#B4ADC6", fontSize: 18 }}>{talk.speakerCompany}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#6C5FC7", fontSize: 18, fontWeight: 600 }}>
              AI Engineer World's Fair 2026
            </span>
          </div>
        </div>
      </div>,
      { ...size },
    );
  });
}
