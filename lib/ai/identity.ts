import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getUser, verifySession } from "@/lib/auth/dal";
import { isSentryEmail } from "@/lib/sentry-demo";
import type { AiIdentity } from "./usage";

const GUEST_COOKIE_NAME = "ai_guest_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function fallbackGuestId(ipAddress: string | null, userAgent: string | null) {
  const hash = createHash("sha256")
    .update(`${ipAddress ?? "unknown"}:${userAgent ?? "unknown"}`)
    .digest("hex")
    .slice(0, 32);

  return `guest_${hash}`;
}

function isValidGuestId(value: string | undefined): value is string {
  return !!value && /^guest_[a-zA-Z0-9_-]{16,64}$/.test(value);
}

export async function getAiIdentity(): Promise<AiIdentity> {
  const session = await verifySession();

  if (session.isAuth && session.userId) {
    const user = await getUser();
    if (user) {
      return {
        type: "user",
        id: user.id,
        accessTier: "authenticated",
        email: user.email,
        isInternalSentry: isSentryEmail(user.email),
      };
    }
  }

  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (isValidGuestId(existingGuestId)) {
    return { type: "guest", id: existingGuestId, accessTier: "guest" };
  }

  const guestId = `guest_${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    cookieStore.set(GUEST_COOKIE_NAME, guestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
    });

    return { type: "guest", id: guestId, accessTier: "guest" };
  } catch {
    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipAddress = headerStore.get("x-real-ip") ?? forwardedFor;
    const userAgent = headerStore.get("user-agent");

    return {
      type: "guest",
      id: fallbackGuestId(ipAddress, userAgent),
      accessTier: "guest",
    };
  }
}
