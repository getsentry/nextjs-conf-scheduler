import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutes = ["/my-schedule", "/ai-builder"];
const publicRoutes = ["/login", "/signup"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = req.cookies.get("session")?.value;
  const session = await decrypt(cookie);

  Sentry.metrics.count("page.view", 1, {
    attributes: {
      path,
      authenticated: String(!!session?.userId),
    },
  });

  if (isProtectedRoute && !session?.userId) {
    Sentry.logger.info("proxy.redirect", {
      reason: "no_session",
      destination: "/login",
    });
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.userId) {
    Sentry.logger.info("proxy.redirect", {
      reason: "already_authenticated",
      destination: "/",
    });
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
