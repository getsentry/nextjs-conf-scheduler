"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToSchedule, removeFromSchedule } from "@/lib/actions/schedule";

type AddToScheduleButtonProps = {
  talkId: string;
  isInSchedule: boolean;
};

export function AddToScheduleButton({ talkId, isInSchedule }: AddToScheduleButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = isInSchedule ? await removeFromSchedule(talkId) : await addToSchedule(talkId);
      if ("error" in result) {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      variant={isInSchedule ? "outline" : "default"}
      className="w-full"
    >
      {isPending ? "Updating..." : isInSchedule ? "Remove from my events" : "Add to my events"}
    </Button>
  );
}
