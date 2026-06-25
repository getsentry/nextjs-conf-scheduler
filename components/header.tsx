import Link from "next/link";
import { Suspense } from "react";
import { AiAssistantOpenButton } from "@/components/ai-assistant-open-button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/dal";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg">AI Engineer WF 2026</span>
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
          <Suspense>
            <AiAssistantOpenButton />
          </Suspense>
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
    <Link
      href="/?view=my-events"
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      My Events
    </Link>
  );
}

async function AuthButtons() {
  const session = await verifySession();

  if (session.isAuth) {
    return <SignOutButton />;
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
