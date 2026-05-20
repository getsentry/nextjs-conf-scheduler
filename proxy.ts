import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/my-schedule", "/ai-builder"];
const publicRoutes = ["/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const startTime = Date.now();
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  let outcome = "passthrough";
  let destination = "";

  if (isProtectedRoute && !session?.userId) {
    outcome = "redirect:no_session";
    destination = "/login";
  } else if (isPublicRoute && session?.userId) {
    outcome = "redirect:already_authenticated";
    destination = "/";
  }

  Sentry.logger.info("page.view", {
    user_id: session?.userId ?? "anonymous",
    outcome,
    destination,
    duration_ms: Date.now() - startTime,
  });

  Sentry.metrics.count("page.view", 1, {
    attributes: {
      path,
      authenticated: String(!!session?.userId),
      outcome,
    },
  });

  if (destination) {
    return NextResponse.redirect(new URL(destination, req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
