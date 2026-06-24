import "./sentry.server.config";
import * as Sentry from "@sentry/nextjs";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";

const publicRoutes = ["/login", "/signup"];
const cachedRoutes = ["/", "/speakers"];

type PageRoute = {
  route: string;
  routeType: "account" | "cached" | "dynamic";
};

function getPageRoute(path: string): PageRoute | null {
  if (cachedRoutes.includes(path)) return { route: path, routeType: "cached" };
  if (publicRoutes.includes(path)) return { route: path, routeType: "account" };
  if (path.startsWith("/talks/")) return { route: "/talks/[id]", routeType: "dynamic" };
  if (path.startsWith("/speakers/")) return { route: "/speakers/[id]", routeType: "dynamic" };
  return null;
}

function isPageViewRequest(req: NextRequest): boolean {
  if (req.method !== "GET") return false;

  const purpose = req.headers.get("purpose") ?? req.headers.get("sec-purpose") ?? "";
  if (purpose.includes("prefetch") || req.headers.has("next-router-prefetch")) return false;

  const destination = req.headers.get("sec-fetch-dest");
  if (destination && destination !== "document" && destination !== "empty") return false;

  const accept = req.headers.get("accept") ?? "";
  const isRscRequest = req.headers.get("rsc") === "1" || req.nextUrl.searchParams.has("_rsc");

  return isRscRequest || accept.includes("text/html");
}

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = publicRoutes.includes(path);
  const pageRoute = getPageRoute(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  if (session?.userId) {
    Sentry.setUser({ id: session.userId, email: session.email, username: session.name });
  }

  if (pageRoute && isPageViewRequest(req)) {
    Sentry.metrics.count("page.view", 1, {
      attributes: {
        is_page: "true",
        path,
        route: pageRoute.route,
        route_type: pageRoute.routeType,
        signed_in: String(!!session?.userId),
      },
    });
  }

  if (isPublicRoute && session?.userId) {
    Sentry.logger.info("Redirecting signed-in user from public route", {
      action: "proxy.redirect",
      path,
      reason: "already_signed_in",
      destination: "/",
    });
    event.waitUntil(Sentry.flush());
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  event.waitUntil(Sentry.flush());
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|monitoring|sentry-tunnel|.*\\..*).*)"],
};
