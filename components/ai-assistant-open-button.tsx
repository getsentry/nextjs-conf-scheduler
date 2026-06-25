"use client";

import { MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const OPEN_ASSISTANT_EVENT = "ai-assistant:open";

function setAssistantDeepLink() {
  const url = new URL(window.location.href);
  url.searchParams.set("assistant", "open");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function preloadAssistant() {
  void import("@/components/ai-assistant-chat");
}

export function AiAssistantOpenButton() {
  return (
    <Button
      className="hidden sm:inline-flex"
      onClick={() => {
        setAssistantDeepLink();
        window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
      }}
      onFocus={preloadAssistant}
      onMouseEnter={preloadAssistant}
      size="sm"
      type="button"
      variant="outline"
    >
      <MessageSquareIcon className="size-3.5" />
      Ask AI
    </Button>
  );
}
