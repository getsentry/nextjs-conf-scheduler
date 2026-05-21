import { Suspense } from "react";
import { Header } from "@/components/header";
import { SentryUserLoader } from "@/components/sentry-user-loader";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Suspense>
        <SentryUserLoader />
      </Suspense>
      <Header />
      <main className="container py-8">{children}</main>
    </div>
  );
}
