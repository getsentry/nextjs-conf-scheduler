"use client";

import {
  type ComponentProps,
  createContext as createReactContext,
  type PropsWithChildren,
  useContext,
} from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type ContextValue = {
  dailyInputTokens: number;
  dailyOutputTokens: number;
  dailyTotalTokens: number;
  maxTokens: number;
  modelId?: string;
  usedTokens: number;
};

type ContextProps = PropsWithChildren<
  ComponentProps<typeof HoverCard> & {
    dailyInputTokens?: number;
    dailyOutputTokens?: number;
    dailyTotalTokens?: number;
    maxTokens: number;
    modelId?: string;
    usedTokens: number;
  }
>;

const ContextData = createReactContext<ContextValue | null>(null);

function useContextData() {
  const context = useContext(ContextData);
  if (!context) {
    throw new Error("Context components must be used inside <Context />");
  }

  return context;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value);
}

function getPercent(usedTokens: number, maxTokens: number) {
  if (maxTokens <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((usedTokens / maxTokens) * 100));
}

export function Context({
  children,
  dailyInputTokens = 0,
  dailyOutputTokens = 0,
  dailyTotalTokens = 0,
  maxTokens,
  modelId,
  usedTokens,
  ...props
}: ContextProps) {
  return (
    <ContextData.Provider
      value={{
        dailyInputTokens,
        dailyOutputTokens,
        dailyTotalTokens,
        maxTokens,
        modelId,
        usedTokens,
      }}
    >
      <HoverCard {...props}>{children}</HoverCard>
    </ContextData.Provider>
  );
}

export function ContextTrigger({ className, children, ...props }: ComponentProps<"button">) {
  const { maxTokens, usedTokens } = useContextData();
  const percent = getPercent(usedTokens, maxTokens);
  const circumference = 28 * Math.PI;

  return (
    <HoverCardTrigger
      render={
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground",
            className,
          )}
          type="button"
          {...props}
        >
          {children ?? (
            <>
              <svg aria-hidden="true" className="size-4 -rotate-90" viewBox="0 0 32 32">
                <circle
                  className="text-muted"
                  cx="16"
                  cy="16"
                  fill="none"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <circle
                  className="text-primary"
                  cx="16"
                  cy="16"
                  fill="none"
                  r="14"
                  stroke="currentColor"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (percent / 100) * circumference}
                  strokeLinecap="round"
                  strokeWidth="4"
                />
              </svg>
              <span>{formatTokens(usedTokens)} context</span>
            </>
          )}
        </button>
      }
    />
  );
}

export function ContextContent({ className, ...props }: ComponentProps<typeof HoverCardContent>) {
  return <HoverCardContent className={cn("w-72 p-0", className)} {...props} />;
}

export function ContextContentHeader({ className, ...props }: ComponentProps<"div">) {
  const { maxTokens, usedTokens } = useContextData();
  const percent = getPercent(usedTokens, maxTokens);

  return (
    <div className={cn("border-b p-3", className)} {...props}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Context</p>
          <p className="text-muted-foreground text-xs">
            ~{formatTokens(usedTokens)} / {formatTokens(maxTokens)} tokens
          </p>
        </div>
        <span className="font-medium text-xs">{percent}%</span>
      </div>
    </div>
  );
}

export function ContextContentBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-2 p-3", className)} {...props} />;
}

export function ContextContentFooter({ className, ...props }: ComponentProps<"div">) {
  const { modelId } = useContextData();

  return (
    <div
      className={cn("border-t bg-muted/40 px-3 py-2 text-muted-foreground text-xs", className)}
      {...props}
    >
      {props.children ?? modelId}
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{typeof value === "number" ? formatTokens(value) : value}</span>
    </div>
  );
}

export function ContextEstimatedUsage() {
  return <UsageRow label="Estimated context" value={useContextData().usedTokens} />;
}

export function ContextDailyInputUsage() {
  return <UsageRow label="Today input" value={useContextData().dailyInputTokens} />;
}

export function ContextDailyOutputUsage() {
  return <UsageRow label="Today output" value={useContextData().dailyOutputTokens} />;
}

export function ContextDailyTotalUsage() {
  return <UsageRow label="Today total" value={useContextData().dailyTotalTokens} />;
}
