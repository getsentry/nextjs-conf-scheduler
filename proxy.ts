import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse, userAgent } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/my-schedule", "/ai-builder"];
const publicRoutes = ["/login", "/signup"];

const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
const REGION = process.env.VERCEL_REGION ?? "local";

export default async function proxy(req: NextRequest) {
  const startTime = Date.now();
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);
  const ua = userAgent(req);

  const event: Record<string, unknown> = {
    path,
    method: req.method,
    authenticated: !!session?.userId,
    user_id: session?.userId ?? "anonymous",
    browser: ua.browser.name ?? "unknown",
    browser_version: ua.browser.version ?? "unknown",
    os: ua.os.name ?? "unknown",
    device: ua.device.type ?? "desktop",
    is_bot: ua.isBot,
    referer: req.headers.get("referer") ?? "",
    commit_sha: COMMIT_SHA,
    region: REGION,
  };

  let outcome = "passthrough";

  if (isProtectedRoute && !session?.userId) {
    outcome = "redirect:no_session";
    event.destination = "/login";
    event.duration_ms = Date.now() - startTime;
    event.outcome = outcome;

    Sentry.logger.info("page.view", event);
    Sentry.metrics.count("page.view", 1, {
      attributes: { path, authenticated: "false", outcome },
    });

    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.userId) {
    outcome = "redirect:already_authenticated";
    event.destination = "/";
    event.duration_ms = Date.now() - startTime;
    event.outcome = outcome;

    Sentry.logger.info("page.view", event);
    Sentry.metrics.count("page.view", 1, {
      attributes: { path, authenticated: "true", outcome },
    });

    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  event.duration_ms = Date.now() - startTime;
  event.outcome = outcome;

  Sentry.logger.info("page.view", event);
  Sentry.metrics.count("page.view", 1, {
    attributes: {
      path,
      authenticated: String(!!session?.userId),
      outcome,
    },
  });

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
