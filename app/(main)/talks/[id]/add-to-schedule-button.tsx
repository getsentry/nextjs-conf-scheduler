"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToSchedule, removeFromSchedule } from "@/lib/actions/schedule";

type AddToScheduleButtonProps = {
  talkId: string;
  isInSchedule: boolean;
};

export function AddToScheduleButton({ talkId, isInSchedule }: AddToScheduleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = isInSchedule ? await removeFromSchedule(talkId) : await addToSchedule(talkId);
      if ("error" in result) {
        if (result.error === "Talk already in your schedule") {
          router.refresh();
          return;
        }
        toast.error(result.error);
        return;
      }

      router.refresh();
    });
  };

  return (
    <Button
      className="w-full"
      disabled={isPending}
      onClick={handleClick}
      type="button"
      variant={isInSchedule ? "outline" : "default"}
    >
      {isPending ? "Updating..." : isInSchedule ? "Remove from my events" : "Add to my events"}
    </Button>
  );
}
