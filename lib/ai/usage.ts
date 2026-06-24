import * as Sentry from "@sentry/nextjs";
import type { LanguageModelUsage } from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";

export type AiIdentityType = "user" | "guest";
export type AiAccessTier = "authenticated" | "guest";

export type AiIdentity = {
  type: AiIdentityType;
  id: string;
  accessTier: AiAccessTier;
  email?: string;
  isInternalSentry?: boolean;
};

export type AiQuota = {
  id: string;
  limit: number;
  used: number;
  remaining: number;
  windowStart: number;
  windowEnd: number;
  unlimited: boolean;
};

export type AiUsageSnapshot = {
  identityType: AiIdentityType;
  accessTier: AiAccessTier;
  quota: AiQuota;
  tokens: {
    input: number;
    output: number;
    total: number;
    budget: number;
  };
};

const DAILY_REQUEST_LIMITS: Record<AiAccessTier, number> = {
  guest: 10,
  authenticated: 100,
};

const DEFAULT_REQUEST_ALERT_THRESHOLDS: Record<AiAccessTier, number> = {
  guest: 8,
  authenticated: 75,
};

const DEFAULT_TOKEN_ALERT_THRESHOLD = 100_000;

function currentUtcDayWindow(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  return { start, end: start + 24 * 60 * 60 };
}

function quotaId(identity: AiIdentity, windowStart: number) {
  return `${identity.type}:${identity.id}:${windowStart}`;
}

function envInt(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requestAlertThreshold(accessTier: AiAccessTier) {
  const globalThreshold = process.env.AI_USAGE_ALERT_DAILY_REQUESTS;
  if (globalThreshold) {
    return envInt("AI_USAGE_ALERT_DAILY_REQUESTS", DEFAULT_REQUEST_ALERT_THRESHOLDS[accessTier]);
  }

  return accessTier === "guest"
    ? envInt("AI_USAGE_ALERT_GUEST_DAILY_REQUESTS", DEFAULT_REQUEST_ALERT_THRESHOLDS.guest)
    : envInt("AI_USAGE_ALERT_AUTH_DAILY_REQUESTS", DEFAULT_REQUEST_ALERT_THRESHOLDS.authenticated);
}

export function tokenAlertThreshold() {
  return envInt("AI_USAGE_ALERT_DAILY_TOKENS", DEFAULT_TOKEN_ALERT_THRESHOLD);
}

export function aiTier(identity: Pick<AiIdentity, "accessTier">) {
  return identity.accessTier === "authenticated" ? "member" : "guest";
}

export function aiMetricAttributes(identity: AiIdentity) {
  return {
    ai_tier: aiTier(identity),
    identity_type: identity.type,
    is_internal_sentry: identity.isInternalSentry === true,
    ...(identity.type === "user" ? { identity_id: identity.id } : {}),
  };
}

export function aiLogFields(identity: AiIdentity) {
  return {
    ai_tier: aiTier(identity),
    identity_type: identity.type,
    identity_id: identity.id,
    is_internal_sentry: identity.isInternalSentry === true,
  };
}

export function aiMetricOwner(identity: AiIdentity) {
  return identity.type === "user" ? identity.id : "guest";
}

function hasUnlimitedQuota(identity: AiIdentity) {
  return identity.type === "user" && identity.isInternalSentry === true;
}

function reportUsageThresholdExceeded({
  identity,
  threshold,
  type,
  value,
  windowEnd,
  windowStart,
}: {
  identity: AiIdentity;
  threshold: number;
  type: "requests" | "tokens";
  value: number;
  windowStart: number;
  windowEnd: number;
}) {
  const attributes = {
    ...aiMetricAttributes(identity),
    threshold_type: type,
  };

  Sentry.metrics.count("ai.usage.threshold_exceeded", 1, { attributes });
  Sentry.logger.warn("AI usage threshold exceeded", {
    action: "ai.usage.threshold_exceeded",
    ...aiLogFields(identity),
    threshold_type: type,
    threshold_value: threshold,
    usage_value: value,
    window_start: windowStart,
    window_end: windowEnd,
  });
}

export async function getAiUsageSnapshot(identity: AiIdentity): Promise<AiUsageSnapshot> {
  const { start, end } = currentUtcDayWindow();
  const id = quotaId(identity, start);
  const unlimited = hasUnlimitedQuota(identity);
  const limit = unlimited ? Number.MAX_SAFE_INTEGER : DAILY_REQUEST_LIMITS[identity.accessTier];

  const [existing] = await db.select().from(aiUsage).where(eq(aiUsage.id, id)).limit(1);
  const used = existing?.requestCount ?? 0;

  return {
    identityType: identity.type,
    accessTier: identity.accessTier,
    quota: {
      id,
      limit,
      used,
      remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
      windowStart: start,
      windowEnd: end,
      unlimited,
    },
    tokens: {
      input: existing?.inputTokens ?? 0,
      output: existing?.outputTokens ?? 0,
      total: existing?.totalTokens ?? 0,
      budget: tokenAlertThreshold(),
    },
  };
}

export async function checkAndIncrementAiQuota(
  identity: AiIdentity,
): Promise<
  { allowed: true; quota: AiQuota } | { allowed: false; quota: AiQuota; retryAfterSeconds: number }
> {
  const { start, end } = currentUtcDayWindow();
  const id = quotaId(identity, start);
  const unlimited = hasUnlimitedQuota(identity);
  const limit = DAILY_REQUEST_LIMITS[identity.accessTier];
  const now = Math.floor(Date.now() / 1000);

  const [incremented] = await db
    .insert(aiUsage)
    .values({
      id,
      identityType: identity.type,
      identityId: identity.id,
      windowStart: start,
      windowEnd: end,
      requestCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiUsage.id,
      set: {
        requestCount: sql`${aiUsage.requestCount} + 1`,
        updatedAt: now,
      },
      where: unlimited ? undefined : sql`${aiUsage.requestCount} < ${limit}`,
    })
    .returning({ requestCount: aiUsage.requestCount });

  if (!incremented) {
    const [existing] = await db.select().from(aiUsage).where(eq(aiUsage.id, id)).limit(1);
    const used = existing?.requestCount ?? limit;
    const quota = {
      id,
      limit,
      used,
      remaining: 0,
      windowStart: start,
      windowEnd: end,
      unlimited: false,
    };

    Sentry.metrics.count("ai.rate_limited", 1, {
      attributes: aiMetricAttributes(identity),
    });
    Sentry.metrics.gauge("ai.quota.remaining", quota.remaining, {
      attributes: aiMetricAttributes(identity),
    });

    return { allowed: false, quota, retryAfterSeconds: Math.max(1, end - now) };
  }

  const used = incremented.requestCount;
  const quota = {
    id,
    limit: unlimited ? Number.MAX_SAFE_INTEGER : limit,
    used,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    windowStart: start,
    windowEnd: end,
    unlimited,
  };

  Sentry.metrics.gauge("ai.quota.remaining", quota.remaining, {
    attributes: aiMetricAttributes(identity),
  });

  const threshold = requestAlertThreshold(identity.accessTier);
  if (used >= threshold && used - 1 < threshold) {
    reportUsageThresholdExceeded({
      identity,
      threshold,
      type: "requests",
      value: used,
      windowStart: start,
      windowEnd: end,
    });
  }

  return { allowed: true, quota };
}

export async function recordAiTokenUsage(
  usageId: string,
  usage: LanguageModelUsage,
  identity?: AiIdentity,
) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return { inputTokens, outputTokens, totalTokens };
  }

  const [updatedUsage] = await db
    .update(aiUsage)
    .set({
      inputTokens: sql`${aiUsage.inputTokens} + ${inputTokens}`,
      outputTokens: sql`${aiUsage.outputTokens} + ${outputTokens}`,
      totalTokens: sql`${aiUsage.totalTokens} + ${totalTokens}`,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(aiUsage.id, usageId))
    .returning({
      identityId: aiUsage.identityId,
      identityType: aiUsage.identityType,
      totalTokens: aiUsage.totalTokens,
      windowEnd: aiUsage.windowEnd,
      windowStart: aiUsage.windowStart,
    });

  const threshold = tokenAlertThreshold();
  if (updatedUsage && updatedUsage.totalTokens >= threshold) {
    const previousTotal = updatedUsage.totalTokens - totalTokens;
    if (previousTotal < threshold) {
      reportUsageThresholdExceeded({
        identity: identity ?? {
          accessTier: updatedUsage.identityType === "guest" ? "guest" : "authenticated",
          id: updatedUsage.identityId,
          type: updatedUsage.identityType,
        },
        threshold,
        type: "tokens",
        value: updatedUsage.totalTokens,
        windowStart: updatedUsage.windowStart,
        windowEnd: updatedUsage.windowEnd,
      });
    }
  }

  return { inputTokens, outputTokens, totalTokens };
}
