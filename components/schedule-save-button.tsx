"use client";

import * as Sentry from "@sentry/nextjs";
import { CalendarMinusIcon, CalendarPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToSchedule, removeFromSchedule } from "@/lib/actions/schedule";

export function ScheduleSaveButton({
  isAuthenticated,
  saved,
  talkId,
}: {
  isAuthenticated: boolean;
  saved: boolean;
  talkId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggleSaved = () => {
    if (!isAuthenticated) {
      Sentry.logger.info("Guest prompted to sign in before saving a talk", {
        action: "schedule.add",
        result: "login_required",
        talk_id: talkId,
      });
      router.push("/login");
      return;
    }

    startTransition(async () => {
      if (saved) {
        const result = await removeFromSchedule(talkId);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
      } else {
        const result = await addToSchedule(talkId);
        if ("error" in result) {
          if (result.error === "Talk already in your schedule") {
            router.refresh();
            return;
          }
          toast.error(result.error);
          return;
        }
      }
      router.refresh();
    });
  };

  return (
    <Button
      aria-label={saved ? "Remove from my events" : "Add to my events"}
      className="rounded-full shadow-sm"
      disabled={isPending}
      onClick={toggleSaved}
      size="icon-xs"
      type="button"
      variant={saved ? "default" : "outline"}
    >
      {saved ? <CalendarMinusIcon className="size-3" /> : <CalendarPlusIcon className="size-3" />}
    </Button>
  );
}
