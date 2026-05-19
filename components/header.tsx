import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { verifySession } from "@/lib/auth/dal";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg">Next.js Conf 2025</span>
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Schedule
            </Link>
            <Link
              href="/speakers"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Speakers
            </Link>
            <Suspense>
              <AuthNav />
            </Suspense>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Suspense
            fallback={
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
            }
          >
            <AuthButtons />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function AuthNav() {
  const session = await verifySession();

  if (!session.isAuth) return null;

  return (
    <>
      <Link
        href="/my-schedule"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        My Schedule
      </Link>
      <Link
        href="/ai-builder"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        AI Builder
      </Link>
    </>
  );
}

async function AuthButtons() {
  const session = await verifySession();

  if (session.isAuth) {
    return (
      <form action={logout}>
        <Button variant="outline" size="sm" type="submit">
          Sign Out
        </Button>
      </form>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Sign In
      </Link>
      <Link href="/signup">
        <Button size="sm">Sign Up</Button>
      </Link>
    </>
  );
}
