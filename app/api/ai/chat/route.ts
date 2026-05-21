import * as Sentry from "@sentry/nextjs";
import { createUIMessageStreamResponse } from "ai";
import { runAgentPipeline } from "@/lib/ai/agents";
import { requireAuth } from "@/lib/auth/dal";

export async function POST(req: Request) {
  const startTime = Date.now();
  const { userId } = await requireAuth();
  const conversationId = req.headers.get("x-conversation-id");
  if (conversationId) {
    Sentry.setConversationId(conversationId);
  }
  const { messages } = await req.json();

  return Sentry.startSpan(
    {
      name: "ai.chat.request",
      op: "ai.pipeline",
      attributes: {
        "ai.pipeline.name": "conference-scheduler",
        "user.id": userId,
      },
    },
    async () => {
      try {
        const formattedMessages = messages
          .map((m: { role: string; parts?: Array<{ type: string; text?: string }> }) => ({
            role: m.role as "user" | "assistant",
            content: (m.parts ?? [])
              .filter((p: { type: string }) => p.type === "text")
              .map((p: { text?: string }) => p.text || "")
              .join(""),
          }))
          .filter((m: { content: string }) => m.content.length > 0);

        const result = await runAgentPipeline(formattedMessages, userId);

        Sentry.logger.info("AI chat request completed", {
          action: "ai.chat",
          result: "success",
          user_id: userId,
          conversation_id: conversationId,
          message_count: messages.length,
          duration_ms: Date.now() - startTime,
        });

        return createUIMessageStreamResponse({
          stream: result.toUIMessageStream(),
        });
      } catch (error) {
        Sentry.captureException(error);
        Sentry.logger.error("AI chat request failed", {
          action: "ai.chat",
          result: "error",
          user_id: userId,
          conversation_id: conversationId,
          error: error instanceof Error ? error.message : String(error),
          duration_ms: Date.now() - startTime,
        });
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  );
}
