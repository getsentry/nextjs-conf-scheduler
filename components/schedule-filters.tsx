"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL_VALUE = "all";

type Track = {
  id: string;
  name: string;
  color: string;
  count?: number;
};

type ScheduleDay = {
  id: string;
  label: string;
  dateLabel: string;
  count: number;
};

type ScheduleFiltersProps = {
  days: ScheduleDay[];
  filteredCount: number;
  isAuthenticated: boolean;
  savedCount: number;
  totalCount: number;
  tracks: Track[];
};

const levels = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
] as const;

const formats = [
  { id: "keynote", label: "Keynote" },
  { id: "talk", label: "Talk" },
  { id: "workshop", label: "Workshop" },
  { id: "panel", label: "Panel" },
  { id: "sponsor", label: "Sponsor" },
  { id: "plenary", label: "Plenary" },
] as const;

function getUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function ScheduleFilters({
  days,
  filteredCount,
  isAuthenticated,
  savedCount,
  totalCount,
  tracks,
}: ScheduleFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTrack = searchParams.get("track");
  const activeLevel = searchParams.get("level");
  const activeFormat = searchParams.get("format");
  const activeQuery = searchParams.get("q") ?? "";
  const activeView = searchParams.get("view") === "my-events" ? "my-events" : "all";
  const currentDay = searchParams.get("day");
  const activeDay = days.some((day) => day.id === currentDay) ? currentDay : days[0]?.id;

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("assistant");
      const nextValue = value === ALL_VALUE ? null : value;

      if (nextValue === null || params.get(key) === nextValue) {
        params.delete(key);
      } else {
        params.set(key, nextValue);
      }

      if (key !== "day") {
        params.delete("day");
      }

      router.push(getUrl(params), { scroll: false });
    },
    [router, searchParams],
  );

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      params.delete("assistant");
      const formData = new FormData(event.currentTarget);
      const query = String(formData.get("q") ?? "").trim();

      if (query) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      params.delete("day");

      router.push(getUrl(params), { scroll: false });
    },
    [router, searchParams],
  );

  const updateView = useCallback(
    (view: "all" | "my-events") => {
      if (view === "my-events" && !isAuthenticated) {
        router.push("/login");
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete("assistant");
      params.delete("day");

      if (view === "my-events") {
        params.set("view", view);
      } else {
        params.delete("view");
      }

      router.push(getUrl(params), { scroll: false });
    },
    [isAuthenticated, router, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push("/", { scroll: false });
  }, [router]);

  const hasActiveFilters =
    activeTrack ||
    activeLevel ||
    activeFormat ||
    activeQuery ||
    currentDay ||
    activeView === "my-events";

  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-sm">Schedule</h2>
            <p className="text-xs text-muted-foreground">
              {activeView === "my-events"
                ? `${filteredCount.toLocaleString()} of ${savedCount.toLocaleString()} saved events`
                : `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} sessions`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-background p-0.5">
              <Button
                aria-pressed={activeView === "all"}
                className="h-7"
                onClick={() => updateView("all")}
                size="sm"
                type="button"
                variant={activeView === "all" ? "secondary" : "ghost"}
              >
                All sessions
              </Button>
              <Button
                aria-pressed={activeView === "my-events"}
                className="h-7 gap-1.5"
                onClick={() => updateView("my-events")}
                size="sm"
                type="button"
                variant={activeView === "my-events" ? "secondary" : "ghost"}
              >
                My events
                {isAuthenticated ? (
                  <Badge className="text-[0.62rem]" variant="outline">
                    {savedCount}
                  </Badge>
                ) : null}
              </Button>
            </div>
            {hasActiveFilters ? (
              <Button
                className="w-fit"
                onClick={clearFilters}
                size="sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <form className="flex min-w-0 items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="-translate-y-1/2 pointer-events-none absolute left-2 top-1/2 size-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-7"
                defaultValue={activeQuery}
                name="q"
                placeholder="Search sessions, speakers, companies..."
              />
            </div>
            <Button className="h-9" size="lg" type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              value={activeTrack ?? ALL_VALUE}
              onValueChange={(value) => updateFilter("track", value)}
            >
              <SelectTrigger className="!h-9 w-full" size="default">
                <SelectValue>{(value) => trackLabel(tracks, value)}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="max-h-80 w-80">
                <SelectItem value={ALL_VALUE}>All program tracks</SelectItem>
                {tracks.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: track.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{track.name}</span>
                    {typeof track.count === "number" ? (
                      <span className="ml-auto text-muted-foreground">{track.count}</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeLevel ?? ALL_VALUE}
              onValueChange={(value) => updateFilter("level", value)}
            >
              <SelectTrigger className="!h-9 w-full" size="default">
                <SelectValue>{(value) => optionLabel(levels, value, "All levels")}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value={ALL_VALUE}>All levels</SelectItem>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFormat ?? ALL_VALUE}
              onValueChange={(value) => updateFilter("format", value)}
            >
              <SelectTrigger className="!h-9 w-full" size="default">
                <SelectValue>{(value) => optionLabel(formats, value, "All formats")}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value={ALL_VALUE}>All formats</SelectItem>
                {formats.map((format) => (
                  <SelectItem key={format.id} value={format.id}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day) => (
            <DayPill
              active={activeDay === day.id}
              count={day.count}
              key={day.id}
              label={day.dateLabel.replace(/^\w+, /, "")}
              meta={day.label}
              onClick={() => updateFilter("day", day.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DayPill({
  active,
  count,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex min-w-36 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted/60",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-xs">{label}</span>
        <span
          className={cn("block text-[0.65rem]", active ? "opacity-80" : "text-muted-foreground")}
        >
          {meta}
        </span>
      </span>
      <Badge className="shrink-0 text-[0.65rem]" variant={active ? "secondary" : "outline"}>
        {count}
      </Badge>
    </button>
  );
}

function optionLabel<T extends { id: string; label: string }>(
  options: readonly T[],
  value: string | null,
  fallback: string,
) {
  if (!value || value === ALL_VALUE) {
    return fallback;
  }

  return options.find((option) => option.id === value)?.label ?? fallback;
}

function trackLabel(tracks: Track[], value: string | null) {
  if (!value || value === ALL_VALUE) {
    return "All program tracks";
  }

  return tracks.find((track) => track.id === value)?.name ?? "All program tracks";
}
