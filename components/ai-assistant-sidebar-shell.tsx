"use client";

import { PanelRightCloseIcon, PanelRightOpenIcon, SparklesIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AIChat } from "@/components/ai-assistant-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DESKTOP_ASSISTANT_QUERY = "(min-width: 1280px)";

export function AiAssistantSidebarShell({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(true);
  const [desktopChatMounted, setDesktopChatMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_ASSISTANT_QUERY);
    const syncViewport = () => {
      setIsDesktop(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setCollapsed(true);
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (searchParams.get("assistant") !== "open") {
      return;
    }

    const isDesktopViewport = window.matchMedia(DESKTOP_ASSISTANT_QUERY).matches;
    if (isDesktopViewport) {
      setDesktopChatMounted(true);
      setCollapsed(false);
      setMobileOpen(false);
    } else {
      setCollapsed(true);
      setMobileOpen(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("assistant");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const collapseAssistant = useCallback(() => {
    setCollapsed(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("assistant");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <>
      <aside
        aria-hidden={collapsed}
        className={cn(
          "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-hidden border-l bg-background transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none xl:flex",
          collapsed ? "w-0 border-l-0 opacity-0" : "w-[30rem] opacity-100 2xl:w-[34rem]",
        )}
        inert={collapsed ? true : undefined}
      >
        {desktopChatMounted && isDesktop ? (
          <div className="flex h-full w-[30rem] shrink-0 flex-col 2xl:w-[34rem]">
            <AssistantHeader isAuthenticated={isAuthenticated} onCollapse={collapseAssistant} />
            <AIChat isAuthenticated={isAuthenticated} />
          </div>
        ) : null}
      </aside>

      <Button
        className="fixed bottom-4 right-4 z-40 h-10 rounded-full px-4 shadow-lg xl:hidden"
        onClick={() => setMobileOpen(true)}
        type="button"
      >
        <PanelRightOpenIcon className="size-4" />
        Ask AI
      </Button>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="flex h-[min(90dvh,46rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3 text-left">
            <DialogTitle>Chat</DialogTitle>
          </DialogHeader>
          <AIChat isAuthenticated={isAuthenticated} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssistantHeader({
  isAuthenticated,
  onCollapse,
}: {
  isAuthenticated: boolean;
  onCollapse: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-sm">Chat</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge className="gap-1 text-[0.65rem]" variant="secondary">
          <SparklesIcon className="size-3" />
          {isAuthenticated ? "Pro" : "Guest"}
        </Badge>
        <Button
          aria-label="Collapse assistant"
          onClick={onCollapse}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelRightCloseIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
