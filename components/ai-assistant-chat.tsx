"use client";

import { useChat } from "@ai-sdk/react";
import * as Sentry from "@sentry/nextjs";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  CalendarMinusIcon,
  CalendarPlusIcon,
  ClockIcon,
  MapPinIcon,
  SearchIcon,
  TicketIcon,
  UserIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextDailyInputUsage,
  ContextDailyOutputUsage,
  ContextDailyTotalUsage,
  ContextEstimatedUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, type ToolPart } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addToSchedule, removeFromSchedule } from "@/lib/actions/schedule";
import { type AiAccessTier, getSelectableModels } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

const EXAMPLE_PROMPTS = [
  { id: "sentry-talks", label: "Are there any talks from Sentry" },
  { id: "agents-production", label: "Find sessions about agents in production" },
  { id: "evals-observability", label: "Build me an evals + observability day" },
  { id: "beginner-workshops", label: "Which beginner workshops are worth it?" },
];

type AiUsageSnapshot = {
  accessTier: "guest" | "authenticated";
  quota: {
    limit: number;
    used: number;
    remaining: number;
    windowEnd: number;
    unlimited?: boolean;
  };
  tokens: {
    budget: number;
    input: number;
    output: number;
    total: number;
  };
};

type AiChatMessage = UIMessage<{
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}>;

type SpeakerResult = {
  name: string;
  company?: string;
  avatar?: string;
};

interface TalkResult {
  id: string;
  title: string;
  description: string;
  date?: string;
  startTime: string;
  endTime: string;
  level: string;
  format: string;
  speaker: string;
  speakerCompany?: string;
  speakerAvatar?: string;
  speakers?: SpeakerResult[];
  track: string;
  trackId?: string;
  trackColor?: string;
  room: string;
  semanticScore?: number;
  saved?: boolean;
}

type TrackResult = {
  id: string;
  name: string;
  color?: string;
  description?: string;
};

function normalizeTalkResult(value: unknown): TalkResult | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id =
    typeof raw.id === "string" ? raw.id : typeof raw.talkId === "string" ? raw.talkId : null;
  if (!id || typeof raw.title !== "string") {
    return null;
  }

  const speaker = raw.speaker;
  const track = raw.track;
  const speakerObject =
    typeof speaker === "object" && speaker !== null ? (speaker as Record<string, unknown>) : null;
  const trackObject =
    typeof track === "object" && track !== null ? (track as Record<string, unknown>) : null;
  const speakers = Array.isArray(raw.speakers)
    ? raw.speakers
        .map((item): SpeakerResult | null => {
          if (typeof item === "string") {
            return { name: item };
          }
          if (typeof item !== "object" || item === null) {
            return null;
          }
          const speaker = item as Record<string, unknown>;
          return typeof speaker.name === "string"
            ? {
                name: speaker.name,
                company: typeof speaker.company === "string" ? speaker.company : undefined,
                avatar:
                  typeof speaker.avatar === "string"
                    ? speaker.avatar
                    : typeof speaker.speakerAvatar === "string"
                      ? speaker.speakerAvatar
                      : undefined,
              }
            : null;
        })
        .filter((speaker): speaker is SpeakerResult => speaker !== null)
    : undefined;

  return {
    id,
    title: raw.title,
    description: typeof raw.description === "string" ? raw.description : "",
    date: typeof raw.date === "string" ? raw.date : undefined,
    startTime: String(raw.startTime ?? ""),
    endTime: String(raw.endTime ?? ""),
    level: typeof raw.level === "string" ? raw.level : "",
    format: typeof raw.format === "string" ? raw.format : "",
    speaker:
      typeof speaker === "string"
        ? speaker
        : typeof speakerObject?.name === "string"
          ? speakerObject.name
          : "TBA",
    speakerCompany:
      typeof raw.speakerCompany === "string"
        ? raw.speakerCompany
        : typeof speakerObject?.company === "string"
          ? speakerObject.company
          : undefined,
    speakerAvatar:
      typeof raw.speakerAvatar === "string"
        ? raw.speakerAvatar
        : typeof speakerObject?.avatar === "string"
          ? speakerObject.avatar
          : undefined,
    speakers: speakers?.length ? speakers : undefined,
    track:
      typeof track === "string"
        ? track
        : typeof trackObject?.name === "string"
          ? trackObject.name
          : "Track",
    trackId: typeof raw.trackId === "string" ? raw.trackId : undefined,
    trackColor:
      typeof raw.trackColor === "string"
        ? raw.trackColor
        : typeof trackObject?.color === "string"
          ? trackObject.color
          : undefined,
    room: typeof raw.room === "string" ? raw.room : "Room TBA",
    semanticScore: typeof raw.semanticScore === "number" ? raw.semanticScore : undefined,
    saved: raw.saved === true,
  };
}

function isTrackResultArray(output: unknown): output is TrackResult[] {
  return (
    Array.isArray(output) &&
    output.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TrackResult).id === "string" &&
        typeof (item as TrackResult).name === "string",
    )
  );
}

function EventResultCard({
  className,
  talk,
  isAuthenticated,
  showScheduleAction = true,
}: {
  className?: string;
  talk: TalkResult;
  isAuthenticated: boolean;
  showScheduleAction?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(talk.saved === true);
  const talkSpeakers = talk.speakers?.length
    ? talk.speakers
    : [{ name: talk.speaker, company: talk.speakerCompany, avatar: talk.speakerAvatar }];
  const primarySpeaker = talkSpeakers[0];
  const speakerNames = talkSpeakers.map((speaker) => speaker.name).join(", ");
  const speakerCompanies = Array.from(
    new Set(talkSpeakers.map((speaker) => speaker.company).filter(Boolean)),
  ).join(", ");

  const toggleSchedule = () => {
    if (!isAuthenticated) {
      Sentry.logger.info("Guest prompted to sign in before saving a talk", {
        action: "schedule.add",
        result: "login_required",
        talk_id: talk.id,
      });
      window.location.href = "/login";
      return;
    }

    startTransition(async () => {
      if (added) {
        const result = await removeFromSchedule(talk.id);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        if (result.success) {
          setAdded(false);
          router.refresh();
        }
        return;
      }

      const result = await addToSchedule(talk.id);
      if ("error" in result) {
        if (result.error === "Talk already in your schedule") {
          setAdded(true);
          router.refresh();
          return;
        }
        toast.error(result.error);
        return;
      }
      if (result.success) {
        setAdded(true);
        router.refresh();
      }
    });
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-background shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none",
        added && "border-primary/40 bg-primary/5",
        className,
      )}
    >
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link
              className="line-clamp-2 font-semibold text-sm hover:underline"
              href={`/talks/${talk.id}`}
            >
              {talk.title}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="size-3" />
                {talk.date ? `${talk.date} · ` : ""}
                {talk.startTime}–{talk.endTime}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3" />
                {talk.room}
              </span>
            </div>
          </div>
          {talk.format ? (
            <Badge className="shrink-0 text-[0.65rem] capitalize" variant="secondary">
              {talk.format}
            </Badge>
          ) : null}
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">{talk.description}</p>

        <div className="flex items-center gap-2">
          {primarySpeaker?.avatar ? (
            <div className="relative shrink-0">
              <Image
                alt={primarySpeaker.name}
                className="size-7 rounded-full object-cover ring-1 ring-border"
                height={28}
                src={primarySpeaker.avatar}
                width={28}
              />
              {talkSpeakers.length > 1 ? (
                <span className="-bottom-1 -right-1 absolute rounded-full bg-primary px-1 text-[8px] text-primary-foreground">
                  +{talkSpeakers.length - 1}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
              <UserIcon className="size-3.5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{speakerNames}</p>
            {speakerCompanies ? (
              <p className="truncate text-[0.68rem] text-muted-foreground">{speakerCompanies}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="max-w-full truncate text-[0.62rem]" variant="outline">
            {talk.track}
          </Badge>
          {talk.semanticScore ? (
            <Badge className="text-[0.62rem]" variant="secondary">
              {Math.round(talk.semanticScore * 100)}% match
            </Badge>
          ) : null}
        </div>

        {showScheduleAction ? (
          <Button
            className="w-full"
            disabled={isPending}
            onClick={toggleSchedule}
            size="sm"
            type="button"
            variant={added ? "outline" : "default"}
          >
            {isPending ? (
              added ? (
                "Removing…"
              ) : (
                "Adding…"
              )
            ) : added ? (
              <>
                <CalendarMinusIcon className="size-3" />
                Remove from schedule
              </>
            ) : isAuthenticated ? (
              <>
                <CalendarPlusIcon className="size-3" />
                Add to my schedule
              </>
            ) : (
              <>
                <TicketIcon className="size-3" />
                Sign in to save
              </>
            )}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function TracksResult({ tracks }: { tracks: TrackResult[] }) {
  return (
    <div className="grid gap-2">
      {tracks.slice(0, 12).map((track) => (
        <div className="rounded-xl border bg-background p-3" key={track.id}>
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full bg-primary"
              style={{ backgroundColor: track.color }}
            />
            <p className="font-medium text-xs">{track.name}</p>
          </div>
          {track.description ? (
            <p className="mt-1 line-clamp-2 text-[0.68rem] text-muted-foreground">
              {track.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ConflictResult({ output }: { output: Record<string, unknown> }) {
  const conflicts = Array.isArray(output.conflicts) ? output.conflicts : [];
  const hasConflicts = output.hasConflicts === true;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-xs",
        hasConflicts
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
      )}
    >
      <p className="font-medium">
        {hasConflicts
          ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} found`
          : "No schedule conflicts"}
      </p>
      {typeof output.message === "string" ? (
        <p className="mt-1 opacity-80">{output.message}</p>
      ) : null}
    </div>
  );
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function partForContextEstimate(part: unknown) {
  if (typeof part !== "object" || part === null) {
    return "";
  }

  const raw = part as Record<string, unknown>;
  if (typeof raw.text === "string") {
    return raw.text;
  }

  if ("input" in raw || "output" in raw) {
    return JSON.stringify({ input: raw.input, output: raw.output });
  }

  return "";
}

function estimateConversationTokens(messages: AiChatMessage[], draft: string) {
  const messageText = messages
    .flatMap((message) => message.parts.map(partForContextEstimate))
    .filter(Boolean)
    .join("\n");

  return estimateTokens(`${messageText}\n${draft}`.trim());
}

function latestTokenUsage(messages: AiChatMessage[]) {
  for (const message of [...messages].reverse()) {
    const usage = message.metadata?.usage;
    if (usage && usage.totalTokens > 0) {
      return usage;
    }
  }

  return undefined;
}

function ToolOutputContent({
  isAuthenticated,
  output,
  toolName,
}: {
  isAuthenticated: boolean;
  output: unknown;
  toolName: string;
}) {
  if (
    (toolName === "searchTalks" ||
      toolName === "getTalkDetails" ||
      toolName === "getUserSchedule") &&
    output != null
  ) {
    const talks = (Array.isArray(output) ? output : [output])
      .map(normalizeTalkResult)
      .filter((talk): talk is TalkResult => talk !== null);

    if (talks.length > 0) {
      return (
        <div className="relative overflow-hidden rounded-2xl border bg-muted/20">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
          <div className="flex gap-3 overflow-x-auto p-2 [scrollbar-width:thin]">
            {talks.map((talk) => (
              <EventResultCard
                className="w-72 shrink-0 sm:w-80"
                isAuthenticated={isAuthenticated}
                key={talk.id}
                showScheduleAction={toolName !== "getUserSchedule"}
                talk={talk}
              />
            ))}
          </div>
        </div>
      );
    }
  }

  if (toolName === "getTracks" && isTrackResultArray(output)) {
    return <TracksResult tracks={output} />;
  }

  if (toolName === "checkConflicts" && typeof output === "object" && output !== null) {
    return <ConflictResult output={output as Record<string, unknown>} />;
  }

  if (output != null) {
    return (
      <pre className="max-h-56 overflow-auto rounded-lg bg-muted/50 p-2 text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  }

  return null;
}

export function AIChat({
  className,
  isAuthenticated,
}: {
  className?: string;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const [inputValue, setInputValue] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [usage, setUsage] = useState<AiUsageSnapshot | null>(null);
  const conversationId = useRef(`conv_${crypto.randomUUID()}`);

  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/usage", { cache: "no-store" });
      if (response.ok) {
        setUsage((await response.json()) as AiUsageSnapshot);
      }
    } catch {
      // Usage display is best-effort; chat should keep working.
    }
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    setPageTitle(document.title);
  });

  useEffect(() => {
    Sentry.setConversationId(conversationId.current);
    return () => Sentry.setConversationId(null);
  }, []);

  const pageContext = useMemo(
    () => ({
      path: pathname,
      query: searchParamString,
      title: pageTitle,
    }),
    [pageTitle, pathname, searchParamString],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        headers: { "x-conversation-id": conversationId.current },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat<AiChatMessage>({
    onError: refreshUsage,
    onFinish: refreshUsage,
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";
  const accessTier: AiAccessTier =
    usage?.accessTier ?? (isAuthenticated ? "authenticated" : "guest");
  const modelOptions = useMemo(() => getSelectableModels(accessTier), [accessTier]);
  const selectedModel =
    modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0];
  const latestUsage = latestTokenUsage(messages);
  const contextTokens = Math.max(
    estimateConversationTokens(messages, inputValue),
    (latestUsage?.totalTokens ?? 0) + estimateTokens(inputValue),
  );

  useEffect(() => {
    const defaultModelId = modelOptions[0]?.id;
    if (defaultModelId && !modelOptions.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(defaultModelId);
    }
  }, [modelOptions, selectedModelId]);

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col divide-y overflow-hidden bg-background",
        className,
      )}
    >
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 p-4">
          {messages.length === 0 ? (
            <ConversationEmptyState className="gap-3 p-4">
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <SearchIcon className="size-5" />
              </div>
              <p className="font-medium text-sm">Ask the schedule</p>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts?.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no stable ID
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      );
                    }

                    if (part.type === "reasoning") {
                      return (
                        <Reasoning
                          // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no stable ID
                          key={i}
                          isStreaming={status === "streaming"}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    }

                    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                      const toolPart = part as {
                        type: string;
                        toolName?: string;
                        state: string;
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      const toolName = toolPart.toolName ?? toolPart.type.replace(/^tool-/, "");
                      const toolKey = [
                        message.id,
                        toolName,
                        toolPart.state,
                        JSON.stringify(toolPart.input ?? toolPart.output ?? "").slice(0, 120),
                      ].join(":");

                      return (
                        <Tool
                          className={cn(
                            "w-full",
                            toolPart.state === "output-error" &&
                              "border-destructive/40 bg-destructive/5",
                          )}
                          defaultOpen={true}
                          key={toolKey}
                        >
                          <ToolHeader
                            state={toolPart.state as ToolPart["state"]}
                            title={toolName}
                            type={toolPart.type as `tool-${string}`}
                          />
                          <ToolContent>
                            <ToolOutputContent
                              isAuthenticated={isAuthenticated}
                              output={toolPart.output}
                              toolName={toolName}
                            />
                            {toolPart.errorText ? (
                              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                {toolPart.errorText}
                              </div>
                            ) : null}
                          </ToolContent>
                        </Tool>
                      );
                    }

                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <Message from="assistant">
              <MessageContent>
                <span className="text-sm text-muted-foreground motion-safe:animate-pulse">
                  Thinking…
                </span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="grid shrink-0 gap-3 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <Button
                className="h-auto rounded-full px-3 py-1.5 text-xs"
                key={prompt.id}
                onClick={() => {
                  Sentry.metrics.count("ai.prompt.selected", 1, {
                    attributes: {
                      prompt_id: prompt.id,
                      prompt_label: prompt.label,
                      page_path: pageContext.path,
                    },
                  });
                  setInputValue(prompt.label);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {prompt.label}
              </Button>
            ))}
          </div>
        ) : null}

        <PromptInput
          onSubmit={async ({ text }) => {
            if (!text.trim() || isLoading) return;
            const messageCount = messages.filter((message) => message.role === "user").length + 1;
            Sentry.logger.info("User sent AI chat message", {
              action: "ai.message.sent",
              conversation_id: conversationId.current,
              message_count: messageCount,
              message_length: text.length,
              model_id: selectedModel?.id,
              page_path: pageContext.path,
            });
            Sentry.metrics.count("ai.message.sent", 1, {
              attributes: { message_count: messageCount },
            });
            setInputValue("");
            await sendMessage(
              { text },
              { body: { context: pageContext, model: selectedModel?.id } },
            );
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              disabled={isLoading}
              onChange={(event) => setInputValue(event.currentTarget.value)}
              placeholder="Ask for recommendations…"
              value={inputValue}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputSelect
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setSelectedModelId(value);
                  }
                }}
                value={selectedModel?.id ?? ""}
              >
                <PromptInputSelectTrigger aria-label="Model" className="max-w-40">
                  <PromptInputSelectValue>
                    {() => selectedModel?.name ?? "Model"}
                  </PromptInputSelectValue>
                </PromptInputSelectTrigger>
                <PromptInputSelectContent align="start" className="w-56">
                  {modelOptions.map((model) => (
                    <PromptInputSelectItem key={model.id} value={model.id}>
                      {model.name}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>

              <Context
                dailyInputTokens={usage?.tokens.input ?? 0}
                dailyOutputTokens={usage?.tokens.output ?? 0}
                dailyTotalTokens={usage?.tokens.total ?? 0}
                maxTokens={selectedModel?.contextWindow ?? 1}
                modelId={selectedModel?.id}
                usedTokens={contextTokens}
              >
                <ContextTrigger aria-label="Conversation context usage" />
                <ContextContent align="end" side="top">
                  <ContextContentHeader />
                  <ContextContentBody>
                    <ContextEstimatedUsage />
                    <ContextDailyInputUsage />
                    <ContextDailyOutputUsage />
                    <ContextDailyTotalUsage />
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Credits</span>
                      <span className="font-medium">
                        {usage?.quota.unlimited
                          ? "Unlimited"
                          : usage
                            ? `${usage.quota.remaining}/${usage.quota.limit}`
                            : "—"}
                      </span>
                    </div>
                  </ContextContentBody>
                  <ContextContentFooter>
                    {selectedModel?.description}. Context is current chat only.
                  </ContextContentFooter>
                </ContextContent>
              </Context>
            </PromptInputTools>
            <PromptInputSubmit disabled={!inputValue.trim() || isLoading} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
