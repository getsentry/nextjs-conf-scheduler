import * as Sentry from "@sentry/nextjs";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/my-schedule", "/ai-builder"];
const publicRoutes = ["/login", "/signup"];
const staticRoutes = ["/workshop"];
const cachedRoutes = ["/", "/speakers"];

function getRouteType(path: string): string {
  if (staticRoutes.some((r) => path.startsWith(r))) return "static";
  if (cachedRoutes.includes(path)) return "cached";
  if (protectedRoutes.some((r) => path.startsWith(r))) return "dynamic";
  if (path.startsWith("/talks/")) return "dynamic";
  if (path.startsWith("/speakers/")) return "dynamic";
  return "other";
}

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);
  const routeType = getRouteType(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  if (session?.userId) {
    Sentry.setUser({ id: session.userId, email: session.email, username: session.name });
  }

  Sentry.metrics.count("page.view", 1, {
    attributes: {
      path,
      route_type: routeType,
      authenticated: String(!!session?.userId),
    },
  });

  if (isProtectedRoute && !session?.userId) {
    Sentry.logger.info("Redirecting unauthenticated user to login", {
      action: "proxy.redirect",
      path,
      reason: "no_session",
      destination: "/login",
    });
    event.waitUntil(Sentry.flush());
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.userId) {
    Sentry.logger.info("Redirecting authenticated user from public route", {
      action: "proxy.redirect",
      path,
      reason: "already_authenticated",
      destination: "/",
    });
    event.waitUntil(Sentry.flush());
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  event.waitUntil(Sentry.flush());
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|monitoring|sentry-tunnel|.*\\.png$).*)"],
};
