import { createHash, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getUser, verifySession } from "@/lib/auth/dal";
import { isSentryEmail } from "@/lib/sentry-demo";
import type { AiIdentity } from "./usage";

const GUEST_COOKIE_NAME = "ai_guest_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const GUEST_ID_PATTERN = /^guest_[a-f0-9]{32}$/;
const SIGNED_GUEST_ID_PATTERN = /^(guest_[a-f0-9]{32})\.([a-f0-9]{32})$/;

function fallbackGuestId(ipAddress: string | null, userAgent: string | null) {
  const hash = createHash("sha256")
    .update(`${ipAddress ?? "unknown"}:${userAgent ?? "unknown"}`)
    .digest("hex")
    .slice(0, 32);

  return `guest_${hash}`;
}

function guestCookieSecret() {
  return process.env.JWT_SECRET || "development-guest-cookie-secret";
}

function signGuestId(guestId: string) {
  return createHmac("sha256", guestCookieSecret()).update(guestId).digest("hex").slice(0, 32);
}

function signedGuestCookieValue(guestId: string) {
  return `${guestId}.${signGuestId(guestId)}`;
}

function parseSignedGuestId(value: string | undefined) {
  const match = value?.match(SIGNED_GUEST_ID_PATTERN);
  if (!match) return null;

  const [, guestId, signature] = match;
  return GUEST_ID_PATTERN.test(guestId) && signature === signGuestId(guestId) ? guestId : null;
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
  const existingGuestId = parseSignedGuestId(cookieStore.get(GUEST_COOKIE_NAME)?.value);

  if (existingGuestId) {
    return { type: "guest", id: existingGuestId, accessTier: "guest" };
  }

  const guestId = `guest_${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    cookieStore.set(GUEST_COOKIE_NAME, signedGuestCookieValue(guestId), {
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
