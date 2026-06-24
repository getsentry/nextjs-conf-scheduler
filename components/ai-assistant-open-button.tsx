"use client";

import { MessageSquareIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AiAssistantOpenButton() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Button
      className="hidden sm:inline-flex"
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("assistant", "open");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <MessageSquareIcon className="size-3.5" />
      Ask AI
    </Button>
  );
}
