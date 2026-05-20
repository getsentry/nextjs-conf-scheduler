"use client";

import { useTransition } from "react";
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
      if (isInSchedule) {
        await removeFromSchedule(talkId);
      } else {
        await addToSchedule(talkId);
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
      {isPending ? "Updating..." : isInSchedule ? "Remove from My Schedule" : "Add to My Schedule"}
    </Button>
  );
}
