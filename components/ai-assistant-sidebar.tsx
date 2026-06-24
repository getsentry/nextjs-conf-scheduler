import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { AiAssistantSidebarShell } from "./ai-assistant-sidebar-shell";

export function AiAssistantSidebar() {
  return (
    <Suspense fallback={<AiAssistantSidebarSkeleton />}>
      <AiAssistantSidebarContent />
    </Suspense>
  );
}

async function AiAssistantSidebarContent() {
  const session = await verifySession();

  return <AiAssistantSidebarShell isAuthenticated={session.isAuth} />;
}

function AiAssistantSidebarSkeleton() {
  return (
    <aside
      aria-hidden="true"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-0 shrink-0 overflow-hidden bg-background xl:flex"
    />
  );
}
