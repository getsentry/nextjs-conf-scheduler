"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CalendarPlusIcon, ClockIcon, MapPinIcon, UserIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addToSchedule } from "@/lib/actions/schedule";

const EXAMPLE_PROMPTS = [
  "I'm interested in AI and machine learning talks",
  "I'm a beginner, what talks should I attend?",
  "Show me all the workshops available",
  "I want to learn about performance optimization",
  "Help me build a schedule focused on developer experience",
];

interface TalkResult {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  level: string;
  format: string;
  speaker: string;
  speakerCompany: string;
  track: string;
  trackId: string;
  room: string;
}

function TalkCard({ talk }: { talk: TalkResult }) {
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    startTransition(async () => {
      const result = await addToSchedule(talk.id);
      if (result.success || result.error === "Talk already in your schedule") {
        setAdded(true);
      }
    });
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm leading-tight">{talk.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserIcon className="size-3" />
              {talk.speaker}
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3" />
              {talk.startTime} - {talk.endTime}
            </span>
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3" />
              {talk.room}
            </span>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {talk.track}
        </Badge>
      </div>
      <Button
        size="sm"
        variant={added ? "outline" : "default"}
        className="w-full text-xs"
        onClick={handleAdd}
        disabled={isPending || added}
      >
        {isPending ? (
          "Adding..."
        ) : added ? (
          "Added"
        ) : (
          <>
            <CalendarPlusIcon className="size-3 mr-1" />
            Add to Schedule
          </>
        )}
      </Button>
    </div>
  );
}

function isTalkResultArray(output: unknown): output is TalkResult[] {
  return (
    Array.isArray(output) &&
    output.length > 0 &&
    typeof output[0]?.id === "string" &&
    typeof output[0]?.title === "string"
  );
}

function ToolOutputContent({ toolName, output }: { toolName: string; output: unknown }) {
  if ((toolName === "searchTalks" || toolName === "getTalkDetails") && output != null) {
    const talks = Array.isArray(output) ? output : [output];
    if (isTalkResultArray(talks)) {
      return (
        <div className="space-y-2">
          {talks.map((talk) => (
            <TalkCard key={talk.id} talk={talk} />
          ))}
        </div>
      );
    }
  }
  if (output != null) {
    return (
      <pre className="text-xs overflow-auto rounded bg-muted/50 p-2">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  }
  return null;
}

export function AIChat() {
  const [inputValue, setInputValue] = useState("");

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai/chat" }), []);

  const { messages, sendMessage, status } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-[calc(100vh-16rem)] flex-col gap-4">
      {/* Messages */}
      <Conversation className="rounded-xl border bg-card">
        <ConversationContent>
          {messages.length === 0 ? (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-muted-foreground mb-4">
                Start by telling me about your interests, or try one of these examples:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    onClick={() => setInputValue(prompt)}
                    className="text-xs"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
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

                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no stable ID
                        <Tool key={i}>
                          <ToolHeader
                            type={toolPart.type as "tool-invocation"}
                            state={toolPart.state as "input-available" | "output-available"}
                            title={toolName}
                          />
                          <ToolContent>
                            <ToolOutputContent toolName={toolName} output={toolPart.output} />
                            {toolPart.errorText ? (
                              <p className="text-sm text-destructive">{toolPart.errorText}</p>
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
                <span className="animate-pulse text-sm text-muted-foreground">Thinking...</span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <PromptInput
        onSubmit={async ({ text }) => {
          if (!text.trim() || isLoading) return;
          setInputValue("");
          await sendMessage({ text });
        }}
      >
        <PromptInputTextarea
          value={inputValue}
          onChange={(e) => setInputValue(e.currentTarget.value)}
          placeholder="Tell me about your interests..."
          disabled={isLoading}
        />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} disabled={!inputValue.trim()} />
        </PromptInputFooter>
      </PromptInput>

      <p className="text-xs text-muted-foreground text-center">
        The AI will search the conference schedule and recommend talks based on your interests.
      </p>
    </div>
  );
}
