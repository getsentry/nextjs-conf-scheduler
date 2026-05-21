"use client";

import { useEffect, useState } from "react";

function getStatus(startTime: number, endTime: number, now: number) {
  const startMs = startTime * 1000;
  const endMs = endTime * 1000;

  if (now >= startMs && now <= endMs) {
    const remaining = Math.round((endMs - now) / 60000);
    return { label: `${remaining}m left`, variant: "live" as const };
  }

  if (now < startMs) {
    const diff = startMs - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.round((diff % 3600000) / 60000);
    if (hours > 0) {
      return { label: `in ${hours}h ${minutes}m`, variant: "upcoming" as const };
    }
    return { label: `in ${minutes}m`, variant: "upcoming" as const };
  }

  return { label: "ended", variant: "past" as const };
}

const variantStyles = {
  live: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  upcoming: "bg-primary/10 text-primary",
  past: "bg-muted text-muted-foreground",
};

export function TalkTimeStatus({
  startTime,
  endTime,
  serverNow,
}: {
  startTime: number;
  endTime: number;
  serverNow: number;
}) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [serverNow]);

  const status = getStatus(startTime, endTime, now);

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${variantStyles[status.variant]}`}
    >
      {status.variant === "live" && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {status.label}
    </span>
  );
}
