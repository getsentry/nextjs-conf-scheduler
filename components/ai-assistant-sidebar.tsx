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
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[30rem] shrink-0 flex-col border-l bg-background xl:flex 2xl:w-[34rem]">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <p className="font-semibold text-sm">Chat</p>
      </div>
      <div className="flex-1 bg-muted/30 motion-safe:animate-pulse" />
    </aside>
  );
}
