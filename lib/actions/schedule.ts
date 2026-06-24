"use server";

import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getUser, requireAuth } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { userSchedules } from "@/lib/db/schema";
import {
  GREG_SCHEDULE_ERROR_MESSAGE,
  isSentryEmail,
  STOP_PROMPTING_TALK_ID,
} from "@/lib/sentry-demo";

type ScheduleActionResult = { success: boolean } | { error: string };

export async function addToSchedule(talkId: string): Promise<ScheduleActionResult> {
  const startTime = Date.now();

  return Sentry.withServerActionInstrumentation(
    "schedule.addToSchedule",
    { headers: await headers() },
    async () => {
      const { userId } = await requireAuth();

      if (talkId === STOP_PROMPTING_TALK_ID) {
        const user = await getUser();
        if (isSentryEmail(user?.email)) {
          const error = new Error(GREG_SCHEDULE_ERROR_MESSAGE);

          Sentry.withScope((scope) => {
            scope.setUser({ id: userId, email: user?.email });
            scope.setTag("demo.scenario", "greg_schedule_block");
            scope.setContext("talk", { id: talkId, title: "Stop prompting" });
            Sentry.captureException(error);
          });
          Sentry.metrics.count("schedule.event", 1, {
            attributes: { action: "add", result: "demo_blocked" },
          });
          Sentry.logger.warn("Sentry user blocked from adding Greg talk", {
            action: "schedule.add",
            result: "demo_blocked",
            user_id: userId,
            talk_id: talkId,
            duration_ms: Date.now() - startTime,
          });

          return { error: GREG_SCHEDULE_ERROR_MESSAGE };
        }
      }

      const existing = await db
        .select()
        .from(userSchedules)
        .where(and(eq(userSchedules.userId, userId), eq(userSchedules.talkId, talkId)))
        .limit(1);

      if (existing.length > 0) {
        Sentry.metrics.count("schedule.event", 1, {
          attributes: { action: "add", result: "duplicate" },
        });
        Sentry.logger.info("Schedule add attempted — already exists", {
          action: "schedule.add",
          result: "duplicate",
          user_id: userId,
          talk_id: talkId,
          duration_ms: Date.now() - startTime,
        });
        return { error: "Talk already in your schedule" };
      }

      await db.insert(userSchedules).values({
        userId,
        talkId,
        addedAt: Math.floor(Date.now() / 1000),
      });

      revalidatePath("/");
      revalidatePath(`/talks/${talkId}`);

      Sentry.metrics.count("schedule.event", 1, {
        attributes: { action: "add", result: "success" },
      });
      Sentry.logger.info("Talk added to schedule", {
        action: "schedule.add",
        result: "success",
        user_id: userId,
        talk_id: talkId,
        duration_ms: Date.now() - startTime,
      });

      return { success: true };
    },
  );
}

export async function removeFromSchedule(talkId: string): Promise<ScheduleActionResult> {
  const startTime = Date.now();

  return Sentry.withServerActionInstrumentation(
    "schedule.removeFromSchedule",
    { headers: await headers() },
    async () => {
      const { userId } = await requireAuth();

      await db
        .delete(userSchedules)
        .where(and(eq(userSchedules.userId, userId), eq(userSchedules.talkId, talkId)));

      revalidatePath("/");
      revalidatePath(`/talks/${talkId}`);

      Sentry.metrics.count("schedule.event", 1, {
        attributes: { action: "remove", result: "success" },
      });
      Sentry.logger.info("Talk removed from schedule", {
        action: "schedule.remove",
        result: "success",
        user_id: userId,
        talk_id: talkId,
        duration_ms: Date.now() - startTime,
      });

      return { success: true };
    },
  );
}
