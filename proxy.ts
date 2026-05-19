import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse, userAgent } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/my-schedule", "/ai-builder"];
const publicRoutes = ["/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);
  const ua = userAgent(req);

  Sentry.metrics.count("page.view", 1, {
    attributes: {
      path,
      authenticated: String(!!session?.userId),
      browser: ua.browser.name ?? "unknown",
      os: ua.os.name ?? "unknown",
      device: ua.device.type ?? "desktop",
      is_bot: String(ua.isBot),
    },
  });

  if (isProtectedRoute && !session?.userId) {
    Sentry.logger.info("proxy.redirect", {
      reason: "no_session",
      path,
      destination: "/login",
    });
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.userId) {
    Sentry.logger.info("proxy.redirect", {
      reason: "already_authenticated",
      user_id: session.userId,
      path,
      destination: "/",
    });
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
